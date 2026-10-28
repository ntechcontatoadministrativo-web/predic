// Testes do motor de padrões da base de dados (planilhas livres, mapeamento, estatística e regressão).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const ctx = vm.createContext({ console, Intl, Math, Date, JSON, Promise, setTimeout, clearTimeout, URL, AbortController, window: {}, localStorage: { getItem: () => null, setItem() {} } });
const src = ['core.js', 'data.js', 'ia-core.js', 'padroes.js'].map(f => fs.readFileSync(new URL('../app/js/' + f, import.meta.url), 'utf8')).join('\n;\n');
vm.runInContext(src + '\n;globalThis.T = { compute, estudoExemplo, baseExemplo, analisarPadroes, alvoDoEstudo, padroesDoEstudo, resumoPadroesIA, concorrentesDaBase, contextoIA, numBR, dataDe, lerTexto, abaDeMatriz, novaBase, registrosDe, ols, detectarPapel, lerPlanilhaLivre };', ctx);
const T = ctx.T;
const REAL = { geo: { lat: -1.371, lon: -48.444, bairro: 'Parque Verde' }, macro: { ipca: { v: 4.5 }, incc: { v: 6 } } };

test('números e datas em formatos brasileiros e internacionais', () => {
  const casos = [['9.500', 9500], ['9.500,00', 9500], ['R$ 612.000,00', 612000], ['4,1%', 4.1], ['1,2 mi', 1.2e6], ['850 mil', 850000], ['9,500.00', 9500], ['68.5', 68.5], ['-1.4312', -1.4312], ['', NaN], ['abc', NaN]];
  casos.forEach(([v, e]) => Number.isNaN(e) ? assert.ok(Number.isNaN(T.numBR(v)), v) : assert.equal(T.numBR(v), e, v));
  const d = v => new Date(T.dataDe(v)).toISOString().slice(0, 10);
  assert.equal(d('2025-03-01'), '2025-03-01'); assert.equal(d('10/03/2025'), '2025-03-10'); assert.equal(d('03/2025'), '2025-03-01');
  assert.equal(d('mar/25'), '2025-03-01'); assert.equal(d(45000), '2023-03-15'); assert.equal(T.dataDe('texto'), null);
});

test('reconhece colunas pelo título e pelo conteúdo', () => {
  const p = (h, v = []) => T.detectarPapel(h, v);
  assert.equal(p('R$/m²'), 'm2'); assert.equal(p('Valor do m²'), 'm2'); assert.equal(p('Área privativa (m²)'), 'area'); assert.equal(p('Metragem'), 'area');
  assert.equal(p('Preço de venda'), 'preco'); assert.equal(p('Quartos'), 'dorms'); assert.equal(p('Unidades vendidas'), 'vendidas'); assert.equal(p('Estoque'), 'estoque');
  assert.equal(p('VSO'), 'vso'); assert.equal(p('Bairro'), 'bairro'); assert.equal(p('Data de lançamento'), 'data'); assert.equal(p('Longitude'), 'lon');
  assert.equal(p('X', [450000, 620000, 810000]), 'preco'); assert.equal(p('Y', [72, 88, 110]), 'area');
});

test('texto colado (TSV) e CSV com ponto e vírgula viram base mapeada', () => {
  const tsv = 'Empreendimento\tBairro\tÁrea\tPreço\nA\tCentro\t70\t650.000\nB\tCentro\t85\t790.000\nC\tNazaré\t60\t520.000';
  const b = T.novaBase(T.lerPlanilhaLivre(tsv)[0], '');
  assert.equal(b.cols.map(c => c.papel).join(), 'nome,bairro,area,preco');
  const r = T.registrosDe([b]); assert.equal(r.length, 3); assert.ok(Math.abs(r[0].m2 - 650000 / 70) < 1e-6); assert.equal(r[0].der.join(), 'm2');
  const csv = 'Título do relatório;;\nNome;Valor (R$ mil);Metragem\nX;650;70\nY;"790";85\nTotal;1440;155';
  const b2 = T.novaBase(T.lerPlanilhaLivre(csv)[0], 'p.csv'); const r2 = T.registrosDe([b2]);
  assert.equal(r2.length, 2, 'cabeçalho achado e linha de total ignorada');
  assert.equal(r2[0].preco, 650000, 'preço em R$ mil convertido');
});

test('deriva estoque, vendidas e VSO; converte VSO em fração', () => {
  const hoje = Date.UTC(2026, 0, 1);
  const b = { id: 'b', ativa: true, cols: ['Nome', 'R$/m²', 'Total', 'Vendidas', 'Lançamento', 'VSO'].map((h, i) => ({ h, papel: ['nome', 'm2', 'total', 'vendidas', 'data', 'ignorar'][i] })), rows: [['A', 9000, 100, 40, '2025-01-01', ''], ['B', 9500, 80, 20, '2025-07-01', '']] };
  const r = T.registrosDe([b], { hoje });
  assert.equal(r[0].estoque, 60); assert.ok(Math.abs(r[0].vso - 40 / 100 / (365 / 30.44) * 100) < 0.05, 'VSO pela velocidade desde o lançamento');
  const f = { id: 'f', ativa: true, cols: [{ h: 'm2', papel: 'm2' }, { h: 'vso', papel: 'vso' }], rows: [[9000, 0.04], [9100, 0.035], [9200, 0.05]] };
  assert.ok(Math.abs(T.registrosDe([f])[0].vso - 4) < 1e-9);
});

test('mínimos quadrados recuperam coeficientes conhecidos', () => {
  const X = [], y = []; for (let i = 0; i < 40; i++) { const a = i / 4, b = (i * 7) % 5; X.push([1, a, b]); y.push(2 + 0.5 * a - 0.3 * b); }
  const f = T.ols(X, y); assert.ok(Math.abs(f.beta[0] - 2) < 1e-3 && Math.abs(f.beta[1] - 0.5) < 1e-3 && Math.abs(f.beta[2] + 0.3) < 1e-3); assert.ok(f.r2 > 0.999);
});

test('base de exemplo: padrões, modelo de preço e sugestão coerentes', () => {
  const st = T.estudoExemplo(), M = T.compute(st);
  const P = T.analisarPadroes([T.baseExemplo()], T.alvoDoEstudo(st, M, REAL), {}, REAL.macro);
  assert.ok(P.n >= 60 && P.nOut >= 1, 'outlier sintético separado');
  assert.ok(P.modelo && P.modelo.confiavel && P.modelo.r2aj > 0.6, 'modelo explica a base: ' + P.modelo?.r2aj);
  const pad = P.modelo.coefs.find(c => c.k === 'pad'); assert.ok(pad.efeito > 0.05 && pad.sig === 'forte', 'padrão mais alto encarece');
  const dist = P.modelo.coefs.find(c => c.k === 'dist'); assert.ok(dist.efeito < 0, 'mais longe do terreno é mais barato');
  assert.ok(P.modelo.coefs.some(c => c.bairro), 'efeito de bairro estimado');
  assert.ok(P.tend.ano.g > 0.02 && P.tend.ano.g < 0.12, 'valorização anual próxima da simulada: ' + P.tend.ano.g);
  assert.equal(P.modelo.mix.length, st.produtos[0].mix.length);
  assert.ok(P.sugestao.m2 > 7000 && P.sugestao.m2 < 14000 && P.sugestao.lo < P.sugestao.m2 && P.sugestao.hi > P.sugestao.m2);
  assert.ok(P.insights.length >= 8 && P.insights.every(i => typeof i.t === 'string' && ['ok', 'at', 'cr', 'na'].includes(i.k)));
  assert.ok(P.comps.lista.length >= 5);
  const cs = T.concorrentesDaBase(P, 12); assert.ok(cs.length > 0 && cs.length <= 12 && cs.every(c => c.m2 > 0 && c.nome));
});

test('filtros reduzem a base e o raio usa a distância ao terreno', () => {
  const st = T.estudoExemplo(), M = T.compute(st), alvo = T.alvoDoEstudo(st, M, REAL), b = [T.baseExemplo()];
  const todos = T.analisarPadroes(b, alvo, {}), so = T.analisarPadroes(b, alvo, { bairros: ['Marambaia'] }), raio = T.analisarPadroes(b, alvo, { raioKm: 2 });
  assert.ok(so.n < todos.n && so.recs.every(r => r.bairro === 'Marambaia'));
  assert.ok(raio.recs.every(r => r.dist <= 2));
  assert.ok(T.analisarPadroes(b, alvo, { outliers: true }).n === todos.n + todos.nOut);
});

test('estudo com base: contexto da IA traz o resumo dos padrões', () => {
  const st = { ...T.estudoExemplo(), bases: [T.baseExemplo()] }, M = T.compute(st);
  const c = T.contextoIA(st, M, REAL);
  assert.ok(c.mercado.baseDeDados && c.mercado.baseDeDados.registros > 50 && c.mercado.baseDeDados.padroesEncontrados.length > 5);
  assert.ok(JSON.stringify(c.mercado.baseDeDados).length < 12000, 'resumo compacto');
  assert.equal(T.contextoIA(T.estudoExemplo(), T.compute(T.estudoExemplo()), REAL).mercado.baseDeDados, null);
});

test('base pequena ou sem preço não quebra a análise', () => {
  const b = { id: 'x', ativa: true, cols: [{ h: 'Nome', papel: 'nome' }, { h: 'Obs', papel: 'ignorar' }], rows: [['A', 'x'], ['B', 'y']] };
  const P = T.analisarPadroes([b], {}); assert.equal(P.n, 0); assert.ok(P.insights[0].t.includes('mapeamento'));
});
