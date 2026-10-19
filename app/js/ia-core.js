'use strict';
/* PREDIC · IA: simulação, busca de meta e contexto do estudo (roda no navegador e nos testes) */

// Variáveis que a IA pode simular/alterar: [rótulo, unidade, leitura, patch do produto]
const AI_VARS = {
  preco_m2: ['Preço médio de venda', 'R$/m²', P => derive(P).preco, (P, v) => { const k = v / (derive(P).preco || v); return { mix: P.mix.map(m => ({ ...m, preco: Math.round(m.preco * k) })) }; }],
  custo_obra_m2: ['Custo de obra', 'R$/m²', P => P.custo, (P, v) => ({ custo: Math.max(1, v) })],
  vso: ['Velocidade de vendas', '% a.m.', P => P.vso, (P, v) => ({ vso: Math.max(0.1, v) })],
  prazo_obra: ['Prazo de obra', 'meses', P => P.prazo, (P, v) => ({ prazo: Math.max(6, Math.min(96, Math.round(v))) })],
  permuta_financeira_pct: ['Permuta financeira', '% VGV', P => P.permFin || 0, (P, v) => ({ permFin: Math.max(0, Math.min(99, v)) })],
  terreno_dinheiro: ['Terreno em dinheiro', 'R$', P => P.terrenoCash || 0, (P, v) => ({ terrenoCash: Math.max(0, v) })],
  financiamento_pct: ['Financiamento à produção', '% obra', P => P.finPct ?? 60, (P, v) => ({ finPct: Math.max(0, Math.min(90, v)), capModelo: 'livre', assoc: false })],
  juros_financiamento: ['Juros do financiamento', '% a.a.', P => P.finJuros ?? 10.5, (P, v) => ({ finJuros: Math.max(0, v), capModelo: 'livre' })],
  tma: ['TMA', '% a.a.', null, null]
};
const fmtVar = (k, v) => k === 'preco_m2' || k === 'custo_obra_m2' ? mil(v) + '/m²' : k === 'terreno_dinheiro' ? milhoes(v) : num(v, k === 'prazo_obra' ? 0 : 1) + ' ' + AI_VARS[k][1];
const prodSel = st => st.produtos[Math.min(st.prodSel || 0, st.produtos.length - 1)];

// Cálculo rápido (sem matrizes de sensibilidade): usado pela IA e pela biblioteca de estudos.
function quick(st, P = prodSel(st)) {
  const C = st.comite || COMITE0, SC = st.cenarios || SCEN0;
  const pIn = pInOf(P, st.tma, premOf(st)), R = engine(applyScen(pIn, 'base', SC)), Rp = engine(applyScen(pIn, 'pessimista', SC));
  const crit = { tir: ok(R.tir) && R.tir * 100 >= C.tirMin, vpl: R.vpl > 0, margem: R.margem * 100 >= C.margemMin, expo: Math.abs(R.expo) / R.vgv * 100 <= C.expoMax, payback: R.payback <= C.paybackMax };
  const sc = [crit.tir, crit.vpl, crit.margem, crit.expo].filter(Boolean).length;
  const veredito = sc === 4 && crit.payback ? 'Aprovar' : sc >= 2 ? 'Aprovar com ressalvas' : 'Reprovar';
  return { R, Rp, crit, veredito, k: veredito === 'Aprovar' ? 'ok' : veredito === 'Reprovar' ? 'cr' : 'at' };
}
const resumoR = q => ({
  tir: ok(q.R.tir) ? pct(q.R.tir, 2) : 'indefinida', vpl: milhoes(q.R.vpl), margem: pct(q.R.margem), lucro: milhoes(q.R.lucro), vgv: milhoes(q.R.vgv),
  exposicaoMax: milhoes(Math.abs(q.R.expo)) + ' (' + pct(Math.abs(q.R.expo) / q.R.vgv, 0) + ' do VGV, mês ' + q.R.expoMes + ')', payback: q.R.payback + ' meses',
  tirPessimista: ok(q.Rp.tir) ? pct(q.Rp.tir) : 'indefinida', veredito: q.veredito
});

// Aplica alterações ({variavel, valor}) a uma cópia do estudo.
function aplicarVars(st, alts) {
  const s = { ...st, produtos: st.produtos.slice() }, i = Math.min(st.prodSel || 0, st.produtos.length - 1), feitas = [];
  for (const a of alts || []) {
    const d = AI_VARS[a && a.variavel]; if (!d || !ok(+a.valor)) continue;
    if (a.variavel === 'tma') { feitas.push({ variavel: 'tma', de: s.tma, para: +a.valor }); s.tma = +a.valor; continue; }
    const P = s.produtos[i]; feitas.push({ variavel: a.variavel, de: d[2](P), para: +a.valor });
    s.produtos[i] = { ...P, ...d[3](P, +a.valor) };
  }
  return { st: s, feitas };
}
const descreverFeitas = feitas => feitas.map(f => ({ variavel: AI_VARS[f.variavel][0], de: fmtVar(f.variavel, f.de), para: fmtVar(f.variavel, f.para) }));
function simularVars(st, alts) {
  const { st: s2, feitas } = aplicarVars(st, alts);
  if (!feitas.length) return { erro: 'Nenhuma alteração válida. Use variáveis da lista e valores numéricos absolutos.' };
  return { premissas: descreverFeitas(feitas), antes: resumoR(quick(st)), depois: resumoR(quick(s2)) };
}
function buscarMeta(st, variavel, indicador, alvo) {
  const d = AI_VARS[variavel]; if (!d || variavel === 'tma') return { erro: 'Variável não suportada.' };
  const P = prodSel(st), v0 = d[2](P), vgv = quick(st).R.vgv;
  const met = s => { const R = quick(s).R; return indicador === 'tir' ? (ok(R.tir) ? R.tir * 100 : -999) : indicador === 'margem' ? R.margem * 100 : R.vpl; };
  const f = v => met(aplicarVars(st, [{ variavel, valor: v }]).st) - alvo;
  const faixa = { preco_m2: [v0 * 0.3, v0 * 3], custo_obra_m2: [v0 * 0.2, v0 * 3], vso: [0.2, 30], prazo_obra: [6, 96], permuta_financeira_pct: [0, 60], terreno_dinheiro: [0, vgv] }[variavel];
  const r = zero(f, faixa[0], faixa[1]);
  if (r == null) return { resultado: 'O alvo não é atingível variando só ' + d[0].toLowerCase() + ' entre ' + fmtVar(variavel, faixa[0]) + ' e ' + fmtVar(variavel, faixa[1]) + '.', valorAtual: fmtVar(variavel, v0) };
  return { variavel: d[0], valorNecessario: fmtVar(variavel, r), valorNumerico: Math.round(r * 100) / 100, valorAtual: fmtVar(variavel, v0), variacao: pct(r / (v0 || 1) - 1), indicadoresNoAlvo: resumoR(quick(aplicarVars(st, [{ variavel, valor: r }]).st)) };
}

// Retrato compacto do estudo para a IA (ordem de chaves estável).
function contextoIA(st, M, real) {
  const { PR, D, R, RR } = M, E = st.estudo, L = st.listas, rl = real || {};
  const r1 = r => ({ tir: ok(r.tir) ? pct(r.tir) : 'indefinida', vpl: milhoes(r.vpl), margem: pct(r.margem), lucro: milhoes(r.lucro), exposicao: milhoes(Math.abs(r.expo)), payback: r.payback + ' m' });
  const pend = l => l.filter(x => x.k !== 'ok').map(x => x.nome + ' [' + NIVTXT[x.k] + (x.status ? ': ' + x.status : '') + ']');
  return {
    secaoAberta: (SECS.find(s => s[0] === st.sec) || SECS[0])[1],
    premissasMotor: (P => ({ recebimentoNaPlanta: P.recAto + '% ato, ' + P.recObra + '% durante a obra, ' + Math.max(0, 100 - P.recAto - P.recObra) + '% nas chaves', posEntrega: P.posAto + '% à vista e saldo repassado em ' + P.posRepasse + ' meses',
      distrato: 'retenção de ' + P.distRetencao + '% do pago, custo de ' + P.distCusto + '%, revenda de ' + P.distRevenda + '% em ' + P.distRevendaMeses + ' meses', curvaObra: (CURVAS[P.curva] || CURVAS.sino)[0], areaEquivalente_pct: P.aeqFator, mesesAntesDaObra: P.preObra }))(M.PM || premOf(st)),
    empreendimento: { nome: E.nome, codigo: E.codigo, endereco: E.endereco, lote: E.lote, areaTerreno_m2: E.area, zona: E.zona, classe: E.classe, CA: E.ca, TO_pct: E.to, gabarito_m: E.gabarito, matricula: E.matricula, cartorio: E.cartorio, prazoAteRegistro_meses: E.prazoReg, demandaAnual_domicilios: E.demanda, rendaMedia_milReais: E.renda, perfil: [E.perfil, E.perfilDesc].filter(Boolean).join(' · ') },
    produtoSelecionado: {
      nome: PR.nome, descricao: PR.descr, tipo: PR.tipoEdif, padrao: PR.padrao, programa: PR.programa === 'mcmv' ? 'MCMV faixa ' + PR.faixa + ' (teto R$ ' + num(PR.teto) + ')' : 'mercado (SBPE)',
      pavimentos: PR.pavimentos, unidadesPorAndar: PR.unAndar, mix: PR.mix.map(m => ({ tipologia: m.tipo, unidades: m.un, area_m2: m.area, preco_m2: m.preco, ticket: mil(m.area * m.preco), permuta: m.perm })),
      unidadesTotal: D.unT, unidadesVendaveis: D.un, areaPrivativaVendavel_m2: Math.round(D.ap), areaConstruida_m2: Math.round(D.ac), precoMedio_m2: Math.round(D.preco), ticketMedio: mil(R.ticket),
      custoObra_m2: PR.custo, prazoObra_meses: PR.prazo, vso_pct_mes: PR.vso, lancamento_mes: lancOf(PR), vagas: PR.vagas, lazer: PR.lazer,
      terreno: { permutaFinanceira_pctVGV: PR.permFin || 0, dinheiro: mil(PR.terrenoCash || 0), custoTotal: milhoes(R.terrenoEq), sobreVGV: pct(R.terrenoEq / R.vgv) },
      capitalizacao: PR.assoc ? 'crédito associativo, entrada ' + PR.entrada + '%' : 'financiamento ' + (PR.finPct ?? 60) + '% da obra a ' + (PR.finJuros ?? 10.5) + '% a.a.',
      outrosCustos: Object.fromEntries(CUSTO_CAMPOS.map(c => [c[0] + ' (' + c[1] + ')', PR.custos?.[c[2]] ?? c[3]])),
      aderenciaProdutoDemanda: Object.fromEntries(ADER_CRIT.map((c, i) => [c, PR.ader[i] ?? 50]))
    },
    indicadores: { base: r1(R), pessimista: r1(RR[0]), otimista: r1(RR[2]), vgv: milhoes(R.vgv), cte: milhoes(M.CTE), cteSobreVGV: pct(M.CTE / R.vgv), capitalProprioSobreCTE: pct(Math.abs(R.expo) / M.CTE), entregaChaves_mes: R.entrega, tirPonderada: ok(M.esp(r => r.tir)) ? pct(M.esp(r => r.tir)) : '—', vplPonderado: milhoes(M.esp(r => r.vpl)) },
    composicaoCTE: Object.fromEntries(M.usos.map(u => [u[0], milhoes(u[1])])),
    comite: { tma_pct: st.tma, ...st.comite, veredito: M.verdict[0], criterios: M.crit, nivelRisco: M.riscoNivel[0] },
    cenarios: st.cenarios, pesosCenarios: st.pesos,
    sensibilidade: { quedaPrecoSuportada: pct(M.qP), aumentoCustoSuportado: pct(M.qC), pontosRuptura: M.be.map(b => b.l + ': ' + b.v), variaveisQueMaisPesam: M.tornado.map(t => t.l + ' (' + t.faixa + '): ' + num(t.neg, 1) + ' / +' + num(t.pos, 1) + ' p.p.'), riscos: M.riscos.map(r => r.l + ': ' + r.v + ' [' + r.k + ']') },
    mercado: { concorrentes: st.concs.map(c => ({ nome: c.nome, tipo: c.tipo, padrao: c.padrao, m2: c.m2, ticket_mil: c.ticket, vso: c.vso, estoque: c.estoque })), precoMedioPonderado_m2: Math.round(M.MK.preco), vsoMediana: M.MK.vso, absorcao_meses: Math.round(M.MK.abs), vendasMes_regiao: Math.round(M.MK.vel), premissasCalculadas: M.premissas.map(p => p.t + ' [' + NIVM[p.k] + ']'), rendaNecessaria: M.aff ? mil(M.aff.renda) + '/mês' : null, riscos: L.riscosMercado.map(r => r.t + ' (' + r.v + ', ' + NIVM[r.k] + ')') },
    legal: { dueDiligencePendente: pend(L.dd), restricoes: pend(L.restricoes), licencas: L.licencas.map(x => x.nome + ' · ' + x.prazo + ' dias · ' + NIVTXT[x.k]), pareceres: L.pareceres.map(p => p.t), condicionantesUrbanizacao: L.condUrb.map(c => c.t + ' (' + c.v + ')'), infraestrutura: L.infra.map(i => i.nome + ': ' + i.status + (i.pct !== '' ? ' ' + i.pct + '%' : '')) },
    urbanismo: { potencialConstrutivo_m2: Math.round(M.POT), usoDoPotencial: M.usoCA == null ? null : pct(M.usoCA, 0) },
    comparativoProdutos: M.comp.map(c => ({ nome: c.nome, tir: ok(c.rb.tir) ? pct(c.rb.tir) : '—', margem: pct(c.rb.margem), vpl: milhoes(c.rb.vpl), risco: c.risco[0] })),
    dadosReais: {
      macro: rl.macro ? { selic: rl.macro.selic?.v, incc12m: rl.macro.incc?.v, ipca12m: rl.macro.ipca?.v, jurosImobiliarioPF: rl.macro.jurosImob?.v } : null,
      municipio: rl.ibge ? { nome: rl.ibge.nome, uf: rl.ibge.uf, populacao: rl.ibge.popEst?.v || rl.ibge.pop?.v, pibPerCapita: rl.ibge.pibPc && Math.round(rl.ibge.pibPc) } : null,
      sinapi: rl.sinapi ? { uf: rl.sinapi.uf, custo_m2: rl.sinapi.v, mes: rl.sinapi.mes } : null,
      altimetria: rl.elev ? { lote_m: Math.round(rl.elev.lote), mediaEntorno_m: Math.round(rl.elev.media) } : null,
      entorno1km: rl.pois ? Object.fromEntries(rl.pois.cats.map(c => [API.POI_CATS.find(x => x.k === c.k).l, c.n + ' (mais próximo ' + (c.perto ?? '—') + ' m)'])) : null
    },
    notasDoAnalista: st.notas || ''
  };
}
