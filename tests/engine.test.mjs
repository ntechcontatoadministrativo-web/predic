// Testes do motor financeiro e das ferramentas da IA (rodam os mesmos arquivos do navegador num contexto isolado).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const ctx = vm.createContext({ console, Intl, Math, Date, JSON, Promise, setTimeout, clearTimeout, URL, AbortController, window: {}, localStorage: { getItem: () => null, setItem() {} } });
const src = ['core.js', 'data.js', 'ia-core.js'].map(f => fs.readFileSync(new URL('../app/js/' + f, import.meta.url), 'utf8')).join('\n;\n');
vm.runInContext(src + '\n;globalThis.T = { engine, derive, compute, estudoExemplo, estudoVazio, quick, simularVars, buscarMeta, aplicarVars, contextoIA, parseNum, pInOf, applyScen, premOf, PREM0, SCEN0 };', ctx);
const T = ctx.T;

test('estudo de exemplo: VGV, TIR e veredito coerentes', () => {
  const st = T.estudoExemplo(), M = T.compute(st);
  const vgvMix = st.produtos[0].mix.reduce((a, m) => a + (m.un - m.perm) * m.area * m.preco, 0);
  assert.ok(Math.abs(M.R.vgv - vgvMix) < 1, 'VGV do motor = soma do mix');
  assert.ok(Number.isFinite(M.R.tir) && M.R.tir > 0 && M.R.tir < 2, 'TIR plausível: ' + M.R.tir);
  assert.ok(M.R.expo < 0, 'há exposição de caixa');
  assert.ok(M.R.payback > M.R.expoMes, 'payback depois da exposição máxima');
  assert.ok(['Aprovar', 'Aprovar com ressalvas', 'Reprovar'].includes(M.verdict[0]));
  assert.equal(M.matrizes.length, 3);
});

test('cenários ordenados: pessimista ≤ base ≤ otimista', () => {
  const M = T.compute(T.estudoExemplo());
  assert.ok(M.RR[0].lucro <= M.RR[1].lucro && M.RR[1].lucro <= M.RR[2].lucro);
});

test('preço maior aumenta a TIR; custo maior reduz', () => {
  const st = T.estudoExemplo(), b = T.quick(st).R.tir;
  const up = T.quick(T.aplicarVars(st, [{ variavel: 'preco_m2', valor: 12000 }]).st).R.tir;
  const cu = T.quick(T.aplicarVars(st, [{ variavel: 'custo_obra_m2', valor: 4500 }]).st).R.tir;
  assert.ok(up > b && cu < b);
});

test('simularVars não altera o estudo original e ignora variáveis inválidas', () => {
  const st = T.estudoExemplo(), antes = JSON.stringify(st);
  const r = T.simularVars(st, [{ variavel: 'vso', valor: 5 }, { variavel: 'xpto', valor: 1 }, { variavel: 'tma', valor: 'abc' }]);
  assert.equal(JSON.stringify(st), antes);
  assert.equal(r.premissas.length, 1);
  assert.ok(r.depois.tir && r.antes.tir);
  assert.ok(T.simularVars(st, []).erro);
});

test('buscarMeta encontra o preço que leva a TIR ao alvo', () => {
  const st = T.estudoExemplo();
  const r = T.buscarMeta(st, 'preco_m2', 'tir', 25);
  assert.ok(r.valorNumerico > 0, JSON.stringify(r));
  const tir = T.quick(T.aplicarVars(st, [{ variavel: 'preco_m2', valor: r.valorNumerico }]).st).R.tir * 100;
  assert.ok(Math.abs(tir - 25) < 0.3, 'TIR no alvo: ' + tir);
});

test('estudo em branco calcula sem erro e gera contexto para a IA', () => {
  const st = T.estudoVazio(), M = T.compute(st);
  assert.ok(Number.isFinite(M.R.vgv));
  const c = T.contextoIA(st, M, {});
  assert.ok(JSON.stringify(c).length > 500);
  const c2 = T.contextoIA(T.estudoExemplo(), T.compute(T.estudoExemplo()), {});
  assert.equal(c2.produtoSelecionado.mix.length, 4);
});

test('parseNum aceita formatos brasileiros', () => {
  assert.equal(T.parseNum('1.234,5'), 1234.5);
  assert.equal(T.parseNum('R$ 10.500'), 10.5); // ponto sem vírgula = decimal (comportamento herdado)
  assert.equal(T.parseNum('12%'), 12);
});

/* ---------- premissas do motor ---------- */
const baseIn = (st, prem) => T.applyScen(T.pInOf(st.produtos[0], st.tma, T.premOf({ premissas: prem })), 'base', T.SCEN0);
const soma = a => a.reduce((x, y) => x + y, 0);

test('premissas padrão reproduzem o modelo original (regressão)', () => {
  const R = T.compute(T.estudoExemplo()).R;
  assert.ok(Math.abs(R.tir - 0.27940049956154045) < 1e-9, 'TIR ' + R.tir);
  assert.ok(Math.abs(R.lucro - 14275203.625433385) < 1e-3, 'lucro ' + R.lucro);
  assert.ok(Math.abs(R.expo - -16663474.280630855) < 1e-3, 'exposição ' + R.expo);
});

test('sem distrato, toda unidade vendida vira receita: Σ recebimentos = VGV', () => {
  const p = { ...baseIn(T.estudoExemplo()), distrato: 0 };
  const R = T.engine(p);
  assert.ok(Math.abs(soma(R.vendas) - p.un) < 1e-6, 'vendeu tudo no horizonte');
  assert.ok(Math.abs(soma(R.rec) - R.vgv) < 1, 'Σrec ' + soma(R.rec) + ' × VGV ' + R.vgv);
});

test('regime de recebimento: mais ato reduz a exposição e não muda o total recebido', () => {
  const st = T.estudoExemplo();
  const a = T.engine({ ...baseIn(st), distrato: 0 }), b = T.engine({ ...baseIn(st, { recAto: 20 }), distrato: 0 });
  assert.ok(b.expo > a.expo, 'exposição menor com mais sinal');
  assert.ok(Math.abs(soma(a.rec) - soma(b.rec)) < 1);
});

test('curva de obra muda o calendário, não o custo nominal da obra', () => {
  const st = T.estudoExemplo();
  const r = ['sino', 'antecipada', 'tardia', 'linear'].map(c => T.engine({ ...baseIn(st, { curva: c }), incc: 0 }));
  r.forEach(x => assert.ok(Math.abs(x.obra - r[0].obra) < 1e-6));
  assert.ok(r[1].expo < r[2].expo, 'obra antecipada exige mais caixa que a tardia');
});

test('distrato: retenção maior melhora o resultado; revenda menor piora', () => {
  const st = T.estudoExemplo(), p = { ...baseIn(st), distrato: 15 };
  const l = prem => T.engine({ ...baseIn(st, prem), distrato: 15 }).lucro;
  assert.ok(l({ distRetencao: 80 }) > l({ distRetencao: 25 }));
  assert.ok(l({ distRevenda: 50 }) < l({ distRevenda: 100 }));
  assert.ok(T.engine(p).lucro < T.engine({ ...p, distrato: 0 }).lucro);
});

test('TIR é a taxa que zera o VPL do fluxo', () => {
  const R = T.engine(baseIn(T.estudoExemplo())), m = Math.pow(1 + R.tir, 1 / 12) - 1;
  let v = 0, d = 1; for (const f of R.flow) { d /= 1 + m; v += f * d; }
  assert.ok(Math.abs(v) < R.vgv * 1e-6, 'VPL na TIR = ' + v);
});

test('área equivalente e tetos do MCMV vêm das premissas do estudo', () => {
  const st = T.estudoExemplo(); st.premissas = { aeqFator: 100, tetoMcmv: { 3: 400000 } };
  const M = T.compute(st), D0 = T.derive(st.produtos[0]);
  assert.equal(M.D.aeq, Math.round(D0.ac));
  assert.equal(M.PM.tetoMcmv[3], 400000);
  assert.equal(M.PM.tetoMcmv[4], T.PREM0.tetoMcmv[4]);
  assert.ok(M.R.obra > T.compute(T.estudoExemplo()).R.obra);
});
