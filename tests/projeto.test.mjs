// Testes do projeto preliminar: implantação, pavimento-tipo, cômodos, garagem e conferências.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const ctx = vm.createContext({ console, Intl, Math, Date, JSON, Promise, setTimeout, clearTimeout, URL, AbortController, window: {}, localStorage: { getItem: () => null, setItem() {} } });
const src = ['core.js', 'data.js', 'projeto.js'].map(f => fs.readFileSync(new URL('../app/js/' + f, import.meta.url), 'utf8')).join('\n;\n');
vm.runInContext(src + '\n;globalThis.T = { estudoExemplo, estudoVazio, projetoPreliminar, pavimentoTipo, comodos, programaUnidade, layoutGaragem, G2, GEO, PJ, derive };', ctx);
const T = ctx.T;
const geo = { lat: -1.38, lon: -48.45 };

test('pavimento-tipo: unidades por andar, cômodos cobrem a unidade e nada sai da placa', () => {
  const PR = T.estudoExemplo().produtos[0], P = T.pavimentoTipo(PR);
  assert.equal(P.uns.length, PR.unAndar);
  assert.ok(P.nucleo && P.nEl >= 2, 'torre de 24 pavimentos tem elevadores');
  P.uns.forEach(u => {
    const soma = u.comodos.reduce((a, r) => a + r.w * r.h, 0);
    assert.ok(Math.abs(soma - u.area) / u.area < 0.02, 'cômodos somam a área da unidade: ' + soma + ' × ' + u.area);
    u.comodos.forEach(r => assert.ok(r.x >= u.x - 1e-6 && r.y >= u.y - 1e-6 && r.x + r.w <= u.x + u.w + 1e-6 && r.y + r.h <= u.y + u.h + 1e-6, 'cômodo dentro da unidade'));
  });
  P.uns.forEach(u => assert.ok(Math.abs(u.area - u.areaMix) / u.areaMix < 0.02, 'área do mix preservada: ' + u.tipo + ' ' + u.area));
  const larg = [0, P.ud + P.cw].map(y => P.uns.filter(u => u.y === y).reduce((a, u) => a + u.w, 0) + (P.nucleo.y === y ? P.nucleo.w : 0) + P.fill.filter(f => f.y === y).reduce((a, f) => a + f.w, 0));
  larg.forEach(l => assert.ok(Math.abs(l - P.W) < 1e-6, 'fileiras preenchem a placa'));
});

test('tipologia: dormitórios e suíte reconhecidos pelo nome', () => {
  assert.equal(T.programaUnidade({ tipo: '3 dorm. suíte', area: 110 }).q, 3);
  assert.equal(T.programaUnidade({ tipo: 'Studio', area: 28 }).q, 0);
  assert.equal(T.programaUnidade({ tipo: '2 dorm.', area: 60 }).suite, false);
  const r = T.comodos(8, 9, T.programaUnidade({ tipo: '3 dorm. suíte', area: 72 }));
  assert.equal(r.filter(x => /Suíte|Dorm/.test(x.n)).length, 3);
  assert.ok(r.some(x => x.n === 'Banho suíte'));
});

test('exemplo: implantação automática válida, subsolos suficientes e níveis completos', () => {
  const st = T.estudoExemplo(), PR = st.produtos[0], P = T.projetoPreliminar(st, PR, geo);
  assert.equal(P.fonte, 'estimado');
  const torres = P.itens.filter(i => i.tipo === 'torre');
  assert.equal(torres.length, 1);
  torres.forEach(t => assert.ok(!t.fora && !t.colide, 'torre dentro do lote'));
  P.itens.forEach(i => assert.ok(!i.colide, i.nome + ' sem sobreposição'));
  assert.ok(P.porNivel > 0, 'cabem vagas no subsolo');
  assert.ok(P.vagasOfertadas >= PR.vagas, 'subsolos atendem às vagas: ' + P.vagasOfertadas);
  assert.equal(P.niveis.filter(n => /subsolo/.test(n.nome)).length, P.nSub);
  assert.equal(P.niveis.slice(P.nSub).map(n => n.k).join(','), 'terreo,tipo,cob');
  assert.equal(P.unProj, PR.pavimentos * PR.unAndar);
});

test('lote desenhado no mapa: área em m² e duas torres', () => {
  const st = T.estudoExemplo(), PR = { ...st.produtos[0], tipoEdif: 'duas torres residenciais', pavimentos: 12 };
  const o = [geo.lat, geo.lon], ll = [[-40, -30], [40, -30], [40, 30], [-40, 30]].map(m => T.GEO.paraLL(o, m));
  st.estudo = { ...st.estudo, implant: { lote: ll } };
  const P = T.projetoPreliminar(st, PR, geo);
  assert.equal(P.fonte, 'mapa');
  assert.ok(Math.abs(P.areaLote - 4800) < 5, 'área ' + P.areaLote);
  assert.equal(P.itens.filter(i => i.tipo === 'torre').length, 2);
  assert.ok(P.itens.every(i => !i.fora && !i.colide));
});

test('posição manual fora do lote é apontada nas conferências', () => {
  const st = T.estudoExemplo(), PR = { ...st.produtos[0], implant: { manual: true, itens: [{ id: 't', tipo: 'torre', nome: 'Torre A', x: 500, y: 0, rot: 0 }] } };
  const P = T.projetoPreliminar(st, PR, geo);
  assert.ok(P.itens[0].fora);
  assert.equal(P.checks.find(c => /Estruturas/.test(c.t)).k, 'cr');
});

test('condomínio de casas: casas implantadas e plantas da casa tipo', () => {
  const st = T.estudoExemplo();
  st.estudo.area = 12000;
  const PR = { ...st.produtos[0], tipoEdif: 'condomínio de casas', mix: [{ tipo: '3 dorm. suíte', un: 30, area: 120, preco: 7000, perm: 0 }], vagas: 30 };
  const P = T.projetoPreliminar(st, PR, geo);
  const casas = P.itens.filter(i => i.tipo === 'casa');
  assert.ok(casas.length >= 20, 'casas implantadas: ' + casas.length);
  casas.forEach(c => assert.ok(!c.fora && !c.colide));
  assert.ok(P.niveis.some(n => /superior/.test(n.nome)), 'sobrado tem pavimento superior');
  assert.equal(P.nSub, 0);
});
