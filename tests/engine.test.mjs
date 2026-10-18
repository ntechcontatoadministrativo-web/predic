// Testes do motor financeiro e das ferramentas da IA (rodam os mesmos arquivos do navegador num contexto isolado).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const ctx = vm.createContext({ console, Intl, Math, Date, JSON, Promise, setTimeout, clearTimeout, URL, AbortController, window: {}, localStorage: { getItem: () => null, setItem() {} } });
const src = ['core.js', 'data.js', 'ia-core.js'].map(f => fs.readFileSync(new URL('../app/js/' + f, import.meta.url), 'utf8')).join('\n;\n');
vm.runInContext(src + '\n;globalThis.T = { engine, derive, compute, estudoExemplo, estudoVazio, quick, simularVars, buscarMeta, aplicarVars, contextoIA, parseNum };', ctx);
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
