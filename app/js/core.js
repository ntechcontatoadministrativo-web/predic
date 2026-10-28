'use strict';
/* PREDIC · núcleo: formatação, constantes, motor financeiro e modelo calculado */
/* ============================ formatação ============================ */
const NF = {};
const nf = d => NF[d] || (NF[d] = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }));
const ok = v => v != null && isFinite(v);
const milhoes = v => ok(v) ? (v < 0 ? '−' : '') + 'R$ ' + nf(1).format(Math.abs(v) / 1e6) + ' M' : '—';
const mil = v => ok(v) ? 'R$ ' + nf(0).format(v) : '—';
const pct = (v, d) => ok(v) ? nf(d === undefined ? 1 : d).format(v * 100) + '%' : '—';
const num = (v, d = 0) => ok(v) ? nf(d).format(v) : '—';
const parseNum = v => { if (typeof v === 'number') return v; let s = String(v ?? '').trim().replace(/[R$%\s]/g, ''); if (!s) return NaN; if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.'); return parseFloat(s); };
const clone = o => JSON.parse(JSON.stringify(o));
const uid = () => Math.random().toString(36).slice(2, 9);
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const hojeBR = () => new Date().toLocaleDateString('pt-BR');
const horaBR = d => new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/* ============================ constantes ============================ */
const LAZER_OPCOES = ['Piscina adulto e infantil', 'Academia equipada', 'Salão de festas', 'Espaço gourmet', 'Coworking', 'Brinquedoteca', 'Pet place', 'Quadra poliesportiva', 'Bicicletário', 'Lockers para delivery', 'Carregador veicular', 'Gerador full', 'Sauna', 'Rooftop', 'Lavanderia compartilhada', 'Mercado autônomo'];
const ADER_CRIT = ['Tipologia × perfil familiar', 'Ticket × renda do público', 'Lazer × concorrência', 'Vagas × exigência do público', 'Localização × público-alvo'];
// Tetos do MCMV por faixa (referência 2025). Mudam por portaria: o estudo guarda os seus em premissas.tetoMcmv.
const TETO_MCMV = { 1: 264000, 2: 264000, 3: 350000, 4: 500000 };
// Premissas do motor: os padrões reproduzem o modelo original; cada estudo pode ajustá-las em Viabilidade.
const PREM0 = {
  recAto: 8, recObra: 22, posAto: 30, posRepasse: 3,
  distRetencao: 50, distRevenda: 85, distRevendaMeses: 6, distCusto: 5.5,
  curva: 'sino', aeqFator: 87, preObra: 6, tetoMcmv: { ...TETO_MCMV }, tetoRef: '2025'
};
const premOf = st => ({ ...PREM0, ...(st && st.premissas), tetoMcmv: { ...TETO_MCMV, ...(st && st.premissas && st.premissas.tetoMcmv) } });
const CURVAS = { sino: ['Curva S (concentrada no meio da obra)', 0.55, 0.30], antecipada: ['Antecipada (estrutura pesada no início)', 0.38, 0.32], tardia: ['Tardia (acabamentos pesados)', 0.70, 0.30], linear: ['Linear (desembolso uniforme)', 0, 0] };
const NIVTXT = { ok: 'regular', at: 'atenção', cr: 'crítico', na: 'não iniciado' };
const NIVM = { ok: 'baixo', at: 'médio', cr: 'alto', na: '—' };
const NIV = v => { const x = norm(v); return /crit|alto/.test(x) ? 'cr' : /aten|medio|moder/.test(x) ? 'at' : /regular|ok|adequ|baixo|livre|emitid|conclu/.test(x) ? 'ok' : 'na'; };
const KS = ['pessimista', 'base', 'otimista'];
const KSL = { pessimista: 'Pessimista', base: 'Base', otimista: 'Otimista' };
const KSC = { pessimista: '#E0644A', base: 'var(--ink)', otimista: '#1E8F52' };
const CAT = ['#1E8F52', '#D89B26', '#7A6CBE', '#E0644A', '#5BA8D6'];
const CUSTO_CAMPOS = [['Projetos e aprovações', '% VGV', 'proj', 2.5], ['Administração', '% VGV', 'adm', 4], ['Outorga e taxas', 'R$', 'outorga', 1800000], ['Incorporação / cartório', '% VGV', 'cart', 0.8], ['Marketing / stand', '% VGV', 'mkt', 2], ['Corretagem', '% vendas', 'corr', 3.5], ['Pós-obra', '% obra', 'pos', 1], ['Tributos (RET)', '% receita', 'ret', 4], ['Frete e logística regional', '% obra', 'frete', 0]];
const CEN_CAMPOS = [['preco', 'Preço de venda', '%', 'variação do R$/m² de tabela'], ['vso', 'Velocidade de vendas', '%', 'variação da VSO mensal'], ['custo', 'Custo de obra', '%', 'erro de orçamento ou contratação'], ['prazo', 'Prazo de obra', 'meses', 'atraso (+) ou antecipação (−)'], ['tma', 'TMA e juros', 'p.p.', 'custo do capital e do financiamento'], ['incc', 'INCC acima do previsto', '% a.a.', 'inflação da obra acima dos preços'], ['distrato', 'Distratos', '% vendas', 'canceladas na entrega']];
const SCEN0 = { pessimista: { preco: -8, vso: -30, custo: 10, prazo: 4, tma: 2, incc: 3, distrato: 15 }, base: { preco: 0, vso: 0, custo: 0, prazo: 0, tma: 0, incc: 0, distrato: 5 }, otimista: { preco: 5, vso: 20, custo: -4, prazo: -2, tma: -1, incc: 0, distrato: 2 } };
const COMITE0 = { tirMin: 18, margemMin: 15, expoMax: 25, paybackMax: 42 };
const GLOSS = { VGV: 'Valor Geral de Vendas: soma do preço de todas as unidades à venda.', CTE: 'Custo Total do Empreendimento: terreno, obra, projetos, impostos, marketing, corretagem e juros.', MARGEM: 'Lucro do incorporador dividido pelo VGV.', 'EXPOSIÇÃO': 'Maior volume de dinheiro próprio que o incorporador precisa colocar antes de as vendas pagarem a conta.', PAYBACK: 'Mês em que o dinheiro colocado no projeto volta ao caixa.', RCE: 'Resultado sobre capital exposto: lucro para cada R$ 1 de dinheiro próprio no pior momento do caixa.', TIR: 'Taxa Interna de Retorno anual do projeto. Deve superar a TMA e a meta do comitê.', VPL: 'Valor Presente Líquido descontado pela TMA. Positivo = rende mais que a TMA.', TMA: 'Taxa Mínima de Atratividade: rendimento mínimo aceito pelo investidor.', VSO: 'Velocidade sobre oferta: % do estoque vendido por mês.', 'ABSORÇÃO': 'Meses para o mercado vender todo o estoque atual.', VELOCIDADE: 'Unidades vendidas por mês na região (estoque × VSO).', DEMANDA: 'Domicílios da região com perfil e renda para comprar o produto, por ano.', SINAPI: 'Custo médio do m² construído calculado pelo IBGE/Caixa para a UF (sem BDI, terreno, projetos e equipamentos).', SELIC: 'Taxa básica de juros definida pelo Copom (meta).', INCC: 'Índice Nacional de Custo da Construção (FGV), acumulado em 12 meses.' };
const ajuda = t => GLOSS[String(t || '').toUpperCase().split(/[\s/·]+/)[0]] || '';

const SECS = [['painel', 'Painel geral'], ['local', 'Localização / Urbanização'], ['legis', 'Legislação / Legalização'], ['mercado', 'Estudo de mercado'], ['dados', 'Base de dados e padrões'], ['produto', 'Característica do produto'], ['orcamento', 'Planejamento preliminar'], ['financeiro', 'Viabilidade econômico-financeira'], ['sensibilidade', 'Matriz de sensibilidade'], ['conclusao', 'Recomendações finais']];
const tk = k => ({ ok: 'g', at: 'y', cr: 'r', na: 'n' })[k];

/* ============================ motor financeiro ============================ */
// Fluxo mensal: receitas por regime de pagamento, custos por curva de obra, financiamento à produção e indicadores.
function engine(p) {
  const PM = { ...PREM0, ...p.prem }, PRE = Math.max(0, Math.round(PM.preObra));
  const ENTREGA = PRE + Math.max(6, Math.round(p.prazo ?? 30)), N = ENTREGA + 12;
  const rAto = PM.recAto / 100, rObra = PM.recObra / 100, rChaves = Math.max(0, 1 - rAto - rObra), pAto = PM.posAto / 100, pRep = Math.max(0, Math.round(PM.posRepasse));
  const incc = (p.incc ?? 0) / 100, dist = (p.distrato ?? 0) / 100 * (p.assoc ? 0.3 : 1), jfin = (p.juros ?? 10.5) / 100;
  const UN = Math.max(1, p.un), AEQ = p.aeq;
  const vgv = p.ap * p.preco, ticket = vgv / UN;
  const CP = p.custos || {}, cv = (k, d) => CP[k] ?? d;
  const obra = AEQ * p.custo * (1 + cv('frete', 0) / 100);
  const dur = ENTREGA - PRE, w = []; let ws = 0; const cv0 = CURVAS[PM.curva] || CURVAS.sino;
  for (let k = 0; k < dur; k++) { const x = (k + 0.5) / dur; const y = cv0[2] ? Math.exp(-Math.pow((x - cv0[1]) / cv0[2], 2)) : 1; w.push(y); ws += y; }
  const O1 = PRE + 1, WO = []; w.forEach((y, k) => { WO[O1 + k] = y / ws; });
  const entr = (p.entrada ?? 10) / 100, tm = p.terrenoMult ?? 1;
  const cash = (p.terrenoCash ?? 0) * tm, fin = (p.permFin ?? 0) / 100 * tm;
  const terreno = cash + fin * vgv;
  const projetos = vgv * cv('proj', 2.5) / 100, admin = vgv * cv('adm', 4) / 100, outorga = cv('outorga', 1800000);
  const cartorio = vgv * cv('cart', 0.8) / 100, marketing = vgv * cv('mkt', 2) / 100, corrPct = cv('corr', 3.5) / 100, posObra = obra * cv('pos', 1) / 100, retPct = cv('ret', 4) / 100;
  const rec = new Array(N + 2).fill(0), cost = new Array(N + 2).fill(0), vendas = new Array(N + 2).fill(0);
  let sold = 0, preVal = 0;
  for (let t = 1; t <= N; t++) {
    const q = t < (p.lanc ?? 1) ? 0 : Math.max(0, Math.min(UN * p.vso / 100, UN - sold));
    sold += q; vendas[t] = q;
    const v = q * ticket;
    if (p.assoc) {
      if (t < ENTREGA) {
        preVal += v; rec[t] += v * entr * 0.5;
        const n2 = ENTREGA - t + 1; for (let k = t; k <= ENTREGA; k++) rec[k] += v * entr * 0.5 / n2;
        const fv = v * (1 - entr); let done = 0; for (let m = O1; m <= t; m++) done += WO[m] || 0;
        rec[t] += fv * done; for (let m = t + 1; m <= ENTREGA; m++) rec[m] += fv * (WO[m] || 0);
      } else rec[t] += v;
      continue;
    }
    if (t < ENTREGA) {
      preVal += v; const n = ENTREGA - t + 1;
      rec[t] += v * rAto; for (let k = t; k <= ENTREGA; k++) rec[k] += v * rObra / n;
      rec[Math.min(N + 1, ENTREGA + 1)] += v * rChaves;
    } else { rec[t] += v * pAto; rec[Math.min(N + 1, t + pRep)] += v * (1 - pAto); }
  }
  if (dist > 0) {
    const dv = preVal * dist;
    // o repasse das chaves não entra; devolve-se a parte não retida do que foi pago; as unidades voltam à venda
    rec[ENTREGA + 1] -= dv * rChaves; cost[ENTREGA + 1] += dv * (rAto + rObra) * (1 - PM.distRetencao / 100) + dv * PM.distCusto / 100;
    const nr = Math.max(1, Math.round(PM.distRevendaMeses)), rv = dv * PM.distRevenda / 100 / nr;
    for (let k = 0; k < nr; k++) { const t = ENTREGA + 2 + k; rec[Math.min(N + 1, t)] += rv * pAto; rec[Math.min(N + 1, t + pRep)] += rv * (1 - pAto); }
  }
  cost[1] += cash * 0.30; cost[Math.max(1, PRE)] += cash * 0.70; cost[Math.min(4, Math.max(1, PRE))] += outorga;
  for (let k = 1; k <= 8; k++) cost[k] += projetos / 8;
  for (let k = 0; k < dur; k++) cost[O1 + k] += obra * w[k] / ws * Math.pow(1 + incc, (O1 + k) / 12);
  for (let t = 1; t <= ENTREGA + 6; t++) cost[t] += admin / (ENTREGA + 6);
  let corretagem = 0, tributos = 0, permPaga = 0;
  for (let t = 1; t <= N + 1; t++) { const cc = vendas[t] * ticket * corrPct; corretagem += cc; tributos += rec[t] * retPct; permPaga += rec[t] * fin; cost[t] += cc + rec[t] * retPct + rec[t] * fin; }
  for (let t = 1; t <= 3; t++) cost[t] += marketing * 0.4 / 3;
  for (let t = 4; t <= ENTREGA; t++) cost[t] += marketing * 0.6 / (ENTREGA - 3);
  cost[1] += cartorio * 0.5; for (let t = 8; t <= 12; t++) cost[t] += cartorio * 0.5 / 5;
  for (let t = ENTREGA + 1; t <= N; t++) cost[t] += posObra / (N - ENTREGA);
  const capFin = obra * (p.finPct ?? 60) / 100, jm = Math.pow(1 + jfin, 1 / 12) - 1;
  let saldoFin = 0, sacado = 0, caixa = 0, jurosTotal = 0, totalRec = 0, totalCost = 0;
  const flow = [], cum = [];
  for (let t = 1; t <= N + 1; t++) {
    const juros = saldoFin * jm; jurosTotal += juros;
    flow.push(rec[t] - cost[t]);
    cost[t] += juros;
    caixa += rec[t] - cost[t];
    if (caixa < 0 && sacado < capFin) { const s = Math.min(-caixa, capFin - sacado); saldoFin += s; sacado += s; caixa += s; }
    else if (caixa > 0 && saldoFin > 0) { const a = Math.min(caixa, saldoFin); saldoFin -= a; caixa -= a; }
    cum.push(caixa); totalRec += rec[t]; totalCost += cost[t];
  }
  const lucro = totalRec - totalCost;
  let expo = 0, expoMes = 0; cum.forEach((c, i) => { if (c < expo) { expo = c; expoMes = i + 1; } });
  let payback = 0; for (let i = expoMes; i < cum.length; i++) if (cum[i] >= 0) { payback = i + 1; break; }
  const npv = r => { let s = 0, d = 1; const f = 1 / (1 + r); for (let i = 0; i < flow.length; i++) { d *= f; s += flow[i] * d; } return s; };
  const vpl = npv(Math.pow(1 + p.tma / 100, 1 / 12) - 1);
  let tirM = null;
  let na = npv(-0.20);
  for (let g = 0; g < 200 && tirM === null; g++) {
    const a = -0.20 + g * 0.01, b = a + 0.01, nb = npv(b);
    if (na > 0 && nb <= 0) { let lo = a, hi = b; for (let i = 0; i < 48; i++) { const m = (lo + hi) / 2; if (npv(m) > 0) lo = m; else hi = m; } tirM = (lo + hi) / 2; }
    na = nb;
  }
  const tir = tirM === null ? null : Math.pow(1 + tirM, 12) - 1;
  const mv = vendas.findIndex((v, i) => i >= (p.lanc ?? 1) && i > 0 && v === 0);
  const cte = terreno + cartorio + marketing + projetos + outorga + admin + obra + posObra + tributos + jurosTotal + corretagem;
  return { vgv, ticket, obra, cartorio, marketing, corretagem, posObra, tributos, sacado, terreno, terrenoCash: cash, terrenoFin: fin * vgv, permPaga,
    terrenoEq: terreno + (p.vgvPerm ?? 0), projetos, admin, outorga, jurosTotal, capFin, totalRec, totalCost, lucro, cte,
    margem: lucro / vgv, roi: lucro / totalCost, expo, expoMes, payback: payback || N + 1, vpl, tir, cum, flow, rec, cost, vendas, entrega: ENTREGA,
    mesesVenda: mv > 0 ? mv - (p.lanc ?? 1) : N };
}
function derive(P, aeqFator = 87) {
  let unT = 0, perm = 0, apT = 0, ap = 0, vgv = 0, vgvPerm = 0, areaPerm = 0;
  P.mix.forEach(m => { unT += m.un; perm += m.perm; apT += m.un * m.area; ap += (m.un - m.perm) * m.area; vgv += (m.un - m.perm) * m.area * m.preco; vgvPerm += m.perm * m.area * m.preco; areaPerm += m.perm * m.area; });
  const ac = apT + (P.comum || 0) + (P.garagem || 0);
  return { unT, perm, un: Math.max(1, unT - perm), apT, ap: Math.max(1, ap), vgv, preco: vgv / Math.max(1, ap) || 0, ac, aeq: Math.round(ac * aeqFator / 100), vgvPerm, areaPerm };
}
const lancOf = P => { const r = (P.crono || []).find(c => c.vendas || /lan[çc]amento/i.test(c.nome)); return r ? Math.max(1, Math.round(r.ini)) : 1; };
const pInOf = (P, tma, prem = PREM0) => { const D = derive(P, prem.aeqFator); return { prem, preco: D.preco, custo: P.custo, vso: P.vso, tma, ap: D.ap, aeq: D.aeq, un: D.un, prazo: P.prazo, terrenoCash: P.terrenoCash ?? 0, permFin: P.permFin ?? 0, vgvPerm: D.vgvPerm, finPct: P.finPct ?? 60, finJuros: P.finJuros ?? 10.5, lanc: lancOf(P), custos: P.custos, assoc: !!P.assoc, entrada: P.entrada ?? 10 }; };
const applyScen = (b, k, SC) => { const c = SC[k] || SC.base; return { ...b, preco: b.preco * (1 + c.preco / 100), custo: b.custo * (1 + c.custo / 100), vso: b.vso * (1 + c.vso / 100), tma: b.tma + c.tma, prazo: b.prazo + c.prazo, incc: c.incc, distrato: c.distrato, juros: (b.finJuros ?? 10.5) + c.tma }; };
const zero = (f, lo, hi) => { let a = lo, b = hi; const fa = f(a); if (Math.sign(fa) === Math.sign(f(b))) return null; for (let i = 0; i < 22; i++) { const m = (a + b) / 2; if (Math.sign(f(m)) === Math.sign(fa)) a = m; else b = m; } return (a + b) / 2; };
// parcela inicial no SAC (padrão da Caixa) para financiar o imóvel
const parcelaSAC = (valor, taxaAA, meses = 360) => { const i = Math.pow(1 + taxaAA / 100, 1 / 12) - 1; return valor / meses + valor * i; };

/* ============================ estudo padrão ============================ */
const it = (grupo, nome, fonte, k, status, extra) => ({ id: uid(), grupo, nome, fonte, k, status, ...(extra || {}) });
const TPL = {
  dd: () => [
    it('Imóvel', 'Matrícula atualizada (menos de 30 dias)', 'CRI', 'na', ''), it('Imóvel', 'Cadeia dominial vintenária (20 anos)', 'CRI', 'na', ''),
    it('Imóvel', 'Ônus reais: hipoteca, penhora, usufruto', 'CRI', 'na', ''), it('Imóvel', 'Servidões e restrições convencionais', 'CRI', 'na', ''),
    it('Imóvel', 'Área de matrícula × levantamento topográfico', 'Topografia', 'na', ''), it('Imóvel', 'Domínio pleno × terreno de marinha', 'SPU', 'na', ''),
    it('Proprietários', 'Ações cíveis, de família e execuções', 'TJ', 'na', ''), it('Proprietários', 'Ações trabalhistas e CNDT', 'TRT / TST', 'na', ''),
    it('Proprietários', 'Débitos federais e previdenciários', 'RFB / PGFN', 'na', ''), it('Proprietários', 'Protestos de títulos', 'Tabelionatos', 'na', ''),
    it('Proprietários', 'Falência e recuperação judicial', 'TJ', 'na', ''), it('Proprietários', 'Inventário / espólio de coproprietário', 'TJ', 'na', ''),
    it('Fiscal', 'IPTU e taxas municipais', 'Prefeitura', 'na', ''), it('Fiscal', 'Certidão negativa de débitos do imóvel', 'Prefeitura', 'na', ''), it('Fiscal', 'ITBI na aquisição', 'Prefeitura', 'na', '')
  ],
  restricoes: () => [
    it('', 'Patrimônio histórico', 'IPHAN / órgão municipal', 'na', '', { desc: 'Tombamento no lote ou em raio de proteção de bem tombado.' }),
    it('', 'Restrição de altura (cone aeroportuário)', 'COMAER / DECEA', 'na', '', { desc: 'Análise AGA quando o gabarito interfere em zona de proteção de aeródromo.' }),
    it('', 'Licenciamento ambiental', 'Órgão ambiental municipal', 'na', '', { desc: 'Licença prévia e de instalação; supressão de vegetação.' }),
    it('', 'APP e recursos hídricos', 'Órgão ambiental estadual', 'na', '', { desc: 'Curso d’água ou área de preservação permanente no lote.' }),
    it('', 'Situação fundiária', 'SPU / órgão de terras', 'na', '', { desc: 'Terreno de marinha ou área da União.' }),
    it('', 'Estudo de impacto de vizinhança (EIV)', 'Secretaria de urbanismo', 'na', '', { desc: 'Exigência conforme porte do empreendimento no plano diretor.' }),
    it('', 'Polo gerador de tráfego', 'Secretaria de mobilidade', 'na', '', { desc: 'Relatório de impacto de trânsito em vias arteriais.' }),
    it('', 'Segurança contra incêndio', 'Corpo de Bombeiros', 'na', '', { desc: 'Projeto de prevenção após aprovação do arquitetônico.' })
  ],
  licencas: () => [
    it('', 'Consulta prévia de viabilidade', 'Prefeitura', 'na', '', { prazo: 30 }), it('', 'EIV e relatório de impacto de trânsito', 'Prefeitura', 'na', '', { prazo: 90 }),
    it('', 'Licença ambiental prévia e de instalação', 'Órgão ambiental', 'na', '', { prazo: 60 }), it('', 'Aprovação do projeto arquitetônico', 'Prefeitura', 'na', '', { prazo: 90 }),
    it('', 'Projeto de prevenção contra incêndio', 'Corpo de Bombeiros', 'na', '', { prazo: 45 }), it('', 'Alvará de construção', 'Prefeitura', 'na', '', { prazo: 30 }),
    it('', 'Registro de incorporação (Lei 4.591/64)', 'CRI', 'na', '', { prazo: 45 }), it('', 'Patrimônio de afetação (Lei 10.931/04)', 'CRI / RFB', 'na', '', { prazo: 15 })
  ],
  infra: () => ['Abastecimento de água', 'Rede coletora de esgoto', 'Energia elétrica', 'Drenagem urbana', 'Pavimentação', 'Internet (fibra óptica)'].map(n => ({ id: uid(), nome: n, k: 'na', status: 'a verificar', pct: '' })),
};
const EST_VAZIO = { nome: 'Novo estudo', codigo: 'VIABILIDADE-' + hojeBR().replace(/\//g, '.'), endereco: '', lote: '', matricula: '', cartorio: '', area: 0, zona: '', classe: 'urbana', ca: 0, to: 0, gabarito: 0, prazoReg: 9, demanda: 0, renda: 0, perfil: '', perfilDesc: '', cub: 0, cubFonte: '' };
const EST_EX = { nome: 'Residencial Alta Vista', codigo: 'VIABILIDADE-EXEMPLO', endereco: 'Rodovia Augusto Montenegro, 4120, Belém, PA', lote: 'Lote de esquina, testadas de 64 m e 50 m.', matricula: '41.328', cartorio: 'CRI 2º ofício', area: 3200, zona: 'ZR-4', classe: 'urbana', ca: 4, to: 50, gabarito: 80, prazoReg: 9, demanda: 1240, renda: 9.4, perfil: 'Classe B', perfilDesc: 'família, 2 e 3 dorm.', cub: 0, cubFonte: '' };
const CRONO0 = () => [
  { id: uid(), nome: 'Aquisição e due diligence', ini: 0, fim: 6, cor: '#8C8AA0' }, { id: uid(), nome: 'Projetos e aprovações', ini: 2, fim: 9, cor: '#5C6B63' },
  { id: uid(), nome: 'Registro de incorporação', ini: 8, fim: 11, cor: '#D89B26' }, { id: uid(), nome: 'Lançamento e vendas', ini: 10, fim: 39, cor: '#2BB673', vendas: true },
  { id: uid(), nome: 'Obra', ini: 7, fim: 36, cor: '#22212D', obra: true }, { id: uid(), nome: 'Habite-se e averbação', ini: 36, fim: 40, cor: '#7A6CBE' },
  { id: uid(), nome: 'Repasses e entrega', ini: 37, fim: 48, cor: '#86D1A9' }
];
const novoProduto = (nome, ex) => ({
  id: uid(), nome, descr: ex ? 'Torre única residencial com 24 pavimentos-tipo e 4 unidades por andar, voltada a famílias de classe B. Apartamentos de 2 e 3 dormitórios, garden no térreo, lazer completo no embasamento e 1,3 vaga por unidade.' : '',
  mix: ex ? [{ tipo: '2 dorm.', un: 32, area: 72, preco: 10500, perm: 0 }, { tipo: '2 dorm. suíte', un: 36, area: 88, preco: 10300, perm: 0 }, { tipo: '3 dorm.', un: 24, area: 110, preco: 10100, perm: 0 }, { tipo: 'Garden 3 dorm.', un: 4, area: 132, preco: 10600, perm: 0 }]
    : [{ tipo: '2 dorm.', un: 40, area: 60, preco: 8000, perm: 0 }],
  comum: ex ? 2310 : 800, garagem: ex ? 1530 : 600, vagas: ex ? 125 : 40, pavimentos: ex ? 24 : 10, unAndar: 4, padrao: ex ? 'médio-alto' : 'médio', tipoEdif: 'torre residencial',
  prazo: 30, custo: ex ? 3700 : 3000, vso: ex ? 3.2 : 3, terrenoCash: 0, permFin: ex ? 14 : 10, capModelo: 'sfh', finPct: 60, finJuros: 10.5, programa: 'mercado', faixa: null, teto: null, assoc: false, entrada: 10,
  custos: Object.fromEntries(CUSTO_CAMPOS.map(c => [c[2], c[3]])), crono: CRONO0(), lazer: ex ? LAZER_OPCOES.slice(0, 12) : [], ader: ex ? [88, 76, 64, 92, 80] : [50, 50, 50, 50, 50], capa: null
});
function estudoExemplo() {
  const dd = TPL.dd(); const S = { 'Matrícula': ['ok', 'regular'], 'Cadeia': ['ok', 'regular'], 'Ônus': ['at', 'hipoteca'], 'Servidões': ['ok', 'nenhuma'], 'Área de': ['ok', 'confere'], 'Domínio': ['ok', 'alodial'], 'Ações cíveis': ['ok', 'negativa'], 'Ações trab': ['ok', 'negativa'], 'Débitos': ['ok', 'negativa'], 'Protestos': ['ok', 'negativa'], 'Falência': ['ok', 'negativa'], 'Inventário': ['cr', 'em curso'], 'IPTU': ['at', 'débito'], 'Certidão': ['cr', 'pendente'], 'ITBI': ['na', 'provisionado'] };
  dd.forEach(d => { const k = Object.keys(S).find(x => d.nome.startsWith(x)); if (k) { d.k = S[k][0]; d.status = S[k][1]; } });
  const rs = TPL.restricoes(); [['ok', 'livre'], ['at', 'consulta AGA'], ['at', 'protocolado'], ['ok', 'livre'], ['ok', 'regular'], ['at', 'exigido'], ['at', 'RIT exigido'], ['na', 'a protocolar']].forEach((s, i) => { rs[i].k = s[0]; rs[i].status = s[1]; });
  const lc = TPL.licencas(); [['ok', 'emitida'], ['na', 'a protocolar'], ['at', 'em análise'], ['at', 'em análise'], ['na', 'a protocolar'], ['na', 'pendente'], ['na', 'pendente'], ['na', 'planejado']].forEach((s, i) => { lc[i].k = s[0]; lc[i].status = s[1]; });
  const inf = TPL.infra(); [[100, 'disponível'], [45, 'parcial'], [100, 'disponível'], [70, 'a reforçar'], [100, 'disponível'], [100, 'disponível']].forEach((s, i) => { inf[i].pct = s[0]; inf[i].status = s[1]; inf[i].k = s[0] >= 90 ? 'ok' : 'at'; });
  return {
    v: 2, exemplo: true, sec: 'painel', prodSel: 0, tma: 12, comite: { ...COMITE0 }, cenarios: clone(SCEN0), pesos: [25, 50, 25],
    estudo: { ...EST_EX }, produtos: [novoProduto('Produto A', true)],
    concs: [
      { id: uid(), nome: 'Vista Montenegro', tipo: '2 e 3 dorm.', padrao: 'médio-alto', m2: 9720, ticket: 728, vso: 4.1, estoque: 38 },
      { id: uid(), nome: 'Edifício Aurora', tipo: '2 dorm.', padrao: 'médio', m2: 9180, ticket: 571, vso: 3.4, estoque: 52 },
      { id: uid(), nome: 'Reserva Parque Verde', tipo: '2 dorm.', padrao: 'médio', m2: 8640, ticket: 517, vso: 3.9, estoque: 71 },
      { id: uid(), nome: 'Mirante do Bosque', tipo: '3 dorm. suíte', padrao: 'alto', m2: 10410, ticket: 958, vso: 2.6, estoque: 44 },
      { id: uid(), nome: 'Praça Marambaia', tipo: '2 e 3 dorm.', padrao: 'médio-alto', m2: 9860, ticket: 762, vso: 3.7, estoque: 29 },
      { id: uid(), nome: 'Terrazzo Coqueiro', tipo: '2 dorm.', padrao: 'médio', m2: 8920, ticket: 543, vso: 3.1, estoque: 66 },
      { id: uid(), nome: 'Jardins Augusto', tipo: '3 dorm.', padrao: 'médio-alto', m2: 9540, ticket: 834, vso: 3.8, estoque: 47 }
    ],
    listas: {
      dd, restricoes: rs, licencas: lc, infra: inf,
      condUrb: [
        { id: uid(), grupo: 'Obras exigidas', t: 'Reforço da drenagem na testada principal.', v: 'R$ 380 mil', k: 'at' },
        { id: uid(), grupo: 'Obras exigidas', t: 'Tratamento de esgoto próprio até a chegada da rede.', v: 'R$ 640 mil', k: 'at' },
        { id: uid(), grupo: 'Riscos identificados', t: 'Atraso da concessionária na extensão da rede de esgoto.', v: 'médio', k: 'at' }
      ],
      riscosMercado: [
        { id: uid(), t: 'Três lançamentos previstos no raio em 18 meses.', v: '~350 un.', k: 'cr' },
        { id: uid(), t: 'Alta dos juros reduz a capacidade de compra.', v: 'médio', k: 'at' }
      ],
      pareceres: [
        { id: uid(), t: 'Inventário em curso: exigir alvará judicial ou anuência de todos os herdeiros antes da escritura.', v: 'crítico', k: 'cr' },
        { id: uid(), t: 'Escritura de permuta com cláusula resolutiva se a aprovação do projeto não sair em 12 meses.', v: 'proteção', k: 'at' }
      ],
      condicionantes: [{ id: uid(), t: 'Lançamento condicionado a 25% de vendas em pré-lançamento para liberar a ordem de serviço.' }]
    },
    bases: [], basesFiltro: {}, notas: '', real: {}, img: { provider: 'pollinations', estilo: 'contemporâneo', vista: 'fachada', formato: '16:9', extra: '' }
  };
}
function estudoVazio() {
  const e = estudoExemplo();
  return { ...e, exemplo: false, estudo: { ...EST_VAZIO }, produtos: [novoProduto('Produto A', false)], concs: [],
    listas: { dd: TPL.dd(), restricoes: TPL.restricoes(), licencas: TPL.licencas(), infra: TPL.infra(), condUrb: [], riscosMercado: [], pareceres: [], condicionantes: [] }, notas: '', real: { macro: e.real.macro } };
}

/* ============================ modelo calculado ============================ */
function compute(st) {
  const SC = st.cenarios, E = st.estudo, C = st.comite, L = st.listas, RL = st.real || {};
  const PM = premOf(st), PRODS = st.produtos, sel = Math.min(st.prodSel, PRODS.length - 1), PR = PRODS[sel], D = derive(PR, PM.aeqFator);
  const W = (() => { const t = st.pesos.reduce((a, b) => a + b, 0) || 1; return st.pesos.map(x => x / t); })();
  const pIn = pInOf(PR, st.tma, PM), pB = applyScen(pIn, 'base', SC);
  const RR = KS.map(k => engine(applyScen(pIn, k, SC))), R = RR[1];
  const esp = f => { const v = RR.map(f); return v.some(x => !ok(x)) ? null : v.reduce((a, x, i) => a + x * W[i], 0); };
  const tirOk = t => ok(t) && t * 100 >= C.tirMin;
  const crit = {
    tir: tirOk(R.tir), vpl: R.vpl > 0, margem: R.margem * 100 >= C.margemMin,
    expo: Math.abs(R.expo) / R.vgv * 100 <= C.expoMax, payback: R.payback <= C.paybackMax
  };
  const score = [crit.tir, crit.vpl, crit.margem, crit.expo].filter(Boolean).length;
  const verdict = score === 4 && crit.payback ? ['Aprovar', '#2BB673', 'Todos os critérios do comitê atendidos no cenário base.']
    : score >= 2 ? ['Aprovar com ressalvas', '#D89B26', 'Parte dos critérios atendida; veja os itens em vermelho no painel.'] : ['Reprovar', '#E0644A', 'O cenário base não remunera o capital acima das metas do comitê.'];

  // mercado
  const cs = st.concs.filter(c => c.estoque > 0 && c.m2 > 0);
  const est = cs.reduce((a, c) => a + c.estoque, 0);
  const vs = cs.map(c => c.vso).filter(v => v > 0).sort((a, b) => a - b);
  const vel = cs.reduce((a, c) => a + c.estoque * c.vso / 100, 0);
  const grupos = {}; cs.forEach(c => { const k = (c.tipo || 'sem tipologia').trim() || 'sem tipologia'; grupos[k] = grupos[k] || { est: 0, m2: 0 }; grupos[k].est += c.estoque; grupos[k].m2 += c.m2 * c.estoque; });
  let tip = Object.entries(grupos).map(([k, g]) => ({ tipo: k, est: g.est, share: g.est / (est || 1), m2: g.m2 / g.est })).sort((a, b) => b.share - a.share);
  if (tip.length > 5) { const r = tip.slice(4); const o = r.reduce((a, x) => ({ est: a.est + x.est, m2: a.m2 + x.m2 * x.est }), { est: 0, m2: 0 }); tip = tip.slice(0, 4).concat([{ tipo: 'Outras', est: o.est, share: o.est / est, m2: o.m2 / o.est }]); }
  const MK = { n: cs.length, est, preco: est ? cs.reduce((a, c) => a + c.m2 * c.estoque, 0) / est : 0, vso: vs.length ? (vs.length % 2 ? vs[(vs.length - 1) / 2] : (vs[vs.length / 2 - 1] + vs[vs.length / 2]) / 2) : 0, vel, abs: vel > 0 ? est / vel : 0, tip };
  const nossasVendasMes = D.un * PR.vso / 100;
  const juros = RL.macro?.jurosImob?.v;
  const aff = juros ? (() => { const fin = R.ticket * 0.8, parc = parcelaSAC(fin, juros); const renda = parc / 0.30; return { fin, parc, renda, ratio: E.renda > 0 ? renda / (E.renda * 1000) : null }; })() : null;
  const premissas = [];
  if (MK.preco) { const d = D.preco / MK.preco - 1; premissas.push({ t: 'Preço ' + pct(Math.abs(d)) + (d >= 0 ? ' acima' : ' abaixo') + ' da média ponderada da concorrência.', v: mil(D.preco) + '/m²', k: d > 0.08 ? 'cr' : d > 0.03 ? 'at' : 'ok' }); }
  if (MK.vso) premissas.push({ t: 'VSO adotada ' + (PR.vso <= MK.vso ? 'igual ou abaixo' : 'acima') + ' da mediana do segmento (' + num(MK.vso, 1) + '% a.m.).', v: num(PR.vso, 1) + '% a.m.', k: PR.vso <= MK.vso ? 'ok' : PR.vso <= MK.vso * 1.2 ? 'at' : 'cr' });
  if (MK.vel) { const cap = nossasVendasMes / (MK.vel + nossasVendasMes); premissas.push({ t: 'Captura de ' + pct(cap, 0) + ' das vendas mensais da região (' + num(MK.vel, 0) + ' un./mês nos concorrentes).', v: num(nossasVendasMes, 1) + ' un./mês', k: cap <= 0.15 ? 'ok' : cap <= 0.25 ? 'at' : 'cr' }); }
  if (E.demanda > 0) { const ano = Math.min(D.un, nossasVendasMes * 12); const s = ano / E.demanda; premissas.push({ t: 'Vendas do 1º ano equivalem a ' + pct(s, 1) + ' da demanda anual de domicílios-alvo.', v: num(ano, 0) + ' un./ano', k: s <= 0.08 ? 'ok' : s <= 0.15 ? 'at' : 'cr' }); }
  if (aff && aff.ratio) premissas.push({ t: 'Renda necessária para o ticket médio (80% financiado a ' + num(juros, 2) + '% a.a., SAC 360 meses, 30% da renda) é ' + pct(aff.ratio, 0) + ' da renda média local.', v: mil(aff.renda) + '/mês', k: aff.ratio <= 1 ? 'ok' : aff.ratio <= 1.3 ? 'at' : 'cr' });

  // CTE
  const usos = [['Terreno', R.terreno, '#2BB673'], ['Incorporação / cartório', R.cartorio, '#8C8AA0'], ['Marketing / stand', R.marketing, '#D89B26'], ['Projetos, licenças e outorga', R.projetos + R.outorga, '#5C6B63'], ['Administração', R.admin, '#7A6CBE'], ['Obra / construção', R.obra, 'var(--ink2)'], ['Pós-obra', R.posObra, '#93A099'], ['Tributos (RET ' + num(PR.custos?.ret ?? 4, 1) + '%)', R.tributos, '#E0644A'], ['Juros do financiamento', R.jurosTotal, '#B23A22'], ['Corretagem', R.corretagem, '#A5761B']];
  const CTE = R.cte;

  // riscos
  const kP = zero(k => engine({ ...pB, preco: pB.preco * k }).vpl, 0.4, 1), kC = zero(k => engine({ ...pB, custo: pB.custo * k }).vpl, 1, 2.5), vMin = zero(v => engine({ ...pB, vso: v }).vpl, 0.2, pB.vso);
  const qP = R.vpl <= 0 ? 0 : kP == null ? 0.6 : 1 - kP, qC = R.vpl <= 0 ? 0 : kC == null ? 1.5 : kC - 1, fV = R.vpl <= 0 ? 0 : vMin == null ? 1 : (pB.vso - vMin) / pB.vso;
  const expV = Math.abs(R.expo) / R.vgv, cpV = Math.abs(R.expo) / CTE;
  const s3 = (a, b) => a ? 'ok' : b ? 'at' : 'cr';
  const riscos = [
    { l: 'Queda de preço suportada', d: 'até o VPL zerar', v: '−' + pct(qP, 1), k: s3(qP >= 0.10, qP >= 0.05) },
    { l: 'Aumento de custo suportado', d: 'até o VPL zerar', v: '+' + pct(qC, 1), k: s3(qC >= 0.15, qC >= 0.08) },
    { l: 'VSO mínima', d: 'adotada ' + num(pB.vso, 1) + '% a.m.', v: vMin == null ? (R.vpl > 0 ? 'abaixo de 0,2%' : '—') : num(vMin, 1) + '% a.m.', k: s3(fV >= 0.4, fV >= 0.2) },
    { l: 'Exposição / VGV', d: 'meta até ' + C.expoMax + '%', v: pct(expV, 0), k: s3(expV * 100 <= C.expoMax, expV * 100 <= C.expoMax + 10) },
    { l: 'Capital próprio / CTE', d: 'referência até 25%', v: pct(cpV, 0), k: s3(cpV <= 0.25, cpV <= 0.40) },
    { l: 'VPL no cenário pessimista', d: 'perda no pior caso', v: milhoes(RR[0].vpl), k: s3(RR[0].vpl > 0, RR[0].vpl > -0.5 * Math.max(R.vpl, 1)) }
  ];
  const nCr = riscos.filter(r => r.k === 'cr').length, nAt = riscos.filter(r => r.k === 'at').length;
  const riscoNivel = nCr >= 2 ? ['RISCO ALTO', 'cr'] : nCr + nAt >= 2 ? ['RISCO MODERADO', 'at'] : ['RISCO BAIXO', 'ok'];

  // sensibilidade
  const metr = r => st.sensInd === 'margem' ? r.margem * 100 : ok(r.tir) ? r.tir * 100 : -999;
  const VARS = { preco: ['Preço de venda', (p, d) => ({ ...p, preco: p.preco * (1 + d / 100) })], vso: ['Velocidade de vendas', (p, d) => ({ ...p, vso: p.vso * (1 + d / 100) })], custo: ['Custo de obra', (p, d) => ({ ...p, custo: p.custo * (1 + d / 100) })], prazo: ['Prazo de obra', (p, d) => ({ ...p, prazo: p.prazo + d })] };
  const steps = k => { const a = SC.pessimista[k], b = SC.otimista[k]; return [a, a / 2, 0, b / 2, b]; };
  const fmtD = (k, d) => (d > 0 ? '+' : d < 0 ? '−' : '') + num(Math.abs(d), d % 1 ? 1 : 0) + (k === 'prazo' ? ' m' : '%');
  const celCor = v => st.sensInd === 'margem' ? (v < 0 ? 'cr' : v < C.margemMin ? 'at' : 'ok') : (v < pB.tma ? 'cr' : v < C.tirMin ? 'at' : 'ok');
  const matrizes = [['preco', 'custo'], ['preco', 'vso'], ['custo', 'prazo']].map(([kx, ky]) => {
    const sx = steps(kx), sy = steps(ky);
    const rows = sy.map((dy, iy) => ({ l: fmtD(ky, dy), cells: sx.map((dx, ix) => { const v = metr(engine(VARS[kx][1](VARS[ky][1](pB, dy), dx))); return { v, txt: v === -999 ? '—' : num(v, 1) + '%', k: celCor(v), mk: ix === 0 && iy === 0 ? 'P' : ix === 2 && iy === 2 ? 'B' : ix === 4 && iy === 4 ? 'O' : '' }; }) }));
    const all = rows.flatMap(r => r.cells); const nOk = all.filter(c => c.k === 'ok').length;
    return { nome: VARS[kx][0] + ' × ' + VARS[ky][0].toLowerCase(), eixoX: VARS[kx][0], eixoY: VARS[ky][0], cols: sx.map(d => fmtD(kx, d)), rows, nOk, P: rows[0].cells[0], B: rows[2].cells[2], O: rows[4].cells[4] };
  });
  const mB = metr(engine(pB));
  const tornado = Object.entries(VARS).map(([k, [l, f]]) => { const s = steps(k); const a = metr(engine(f(pB, s[0]))) - mB, b = metr(engine(f(pB, s[4]))) - mB; return { l, faixa: fmtD(k, s[0]) + ' a ' + fmtD(k, s[4]), neg: Math.min(a, b), pos: Math.max(a, b) }; })
    .concat([(() => { const a = metr(engine({ ...pB, terrenoMult: 1.15 })) - mB, b = metr(engine({ ...pB, terrenoMult: 0.85 })) - mB; return { l: 'Custo do terreno', faixa: '+15% a −15%', neg: Math.min(a, b), pos: Math.max(a, b) }; })()])
    .sort((x, y) => (y.pos - y.neg) - (x.pos - x.neg));
  const rB = engine(pB), rTma = engine({ ...pB, tma: pB.tma + 1 }), rJur = engine({ ...pB, juros: pB.juros + 1 }), rInc = engine({ ...pB, incc: (pB.incc || 0) + 1 });
  const macroFx = [
    { l: 'TMA', d: '+1 p.p. no custo de oportunidade', v: milhoes(rTma.vpl - rB.vpl), u: 'no VPL', ref: 'a TIR não muda; muda só a régua' },
    { l: 'Juros do financiamento', d: '+1 p.p. ao ano', v: milhoes(rJur.lucro - rB.lucro), u: 'no resultado', ref: num((rJur.margem - rB.margem) * 100, 2) + ' p.p. na margem' },
    { l: 'INCC acima do previsto', d: '+1% ao ano na obra', v: milhoes(rInc.lucro - rB.lucro), u: 'no resultado', ref: num((rInc.margem - rB.margem) * 100, 2) + ' p.p. na margem' }
  ];
  const be = (() => {
    const tirAlvo = r => ok(r.tir) && r.tir * 100 >= C.tirMin;
    const bp = zero(k => (tirAlvo(engine({ ...pB, preco: pB.preco * k })) ? 1 : -1), 0.4, 1.6);
    const bc = zero(k => (tirAlvo(engine({ ...pB, custo: pB.custo * k })) ? 1 : -1), 0.5, 2.5);
    const bv = zero(v => (tirAlvo(engine({ ...pB, vso: v })) ? 1 : -1), 0.2, 20);
    return [{ v: bp ? mil(pB.preco * bp) + '/m²' : '—', l: 'Preço mínimo para TIR de ' + C.tirMin + '%' }, { v: bc ? mil(pB.custo * bc) + '/m²' : '—', l: 'Custo de obra máximo admissível' }, { v: bv ? num(bv, 1) + '% a.m.' : '—', l: 'VSO mínima para a meta de TIR' }];
  })();

  // comparativo entre produtos
  const comp = PRODS.map((P, i) => {
    const pi = pInOf(P, st.tma, PM), rr = KS.map(k => engine(applyScen(pi, k, SC))), rb = rr[1], pb = applyScen(pi, 'base', SC);
    const kp = zero(k => engine({ ...pb, preco: pb.preco * k }).vpl, 0.4, 1), kc = zero(k => engine({ ...pb, custo: pb.custo * k }).vpl, 1, 2.5);
    const qp = rb.vpl <= 0 ? 0 : kp == null ? 0.6 : 1 - kp, qc = rb.vpl <= 0 ? 0 : kc == null ? 1.5 : kc - 1;
    const e2 = Math.abs(rb.expo) / rb.vgv, c2 = Math.abs(rb.expo) / rb.cte;
    const fl = [qp < 0.05 ? 2 : qp < 0.10 ? 1 : 0, qc < 0.08 ? 2 : qc < 0.15 ? 1 : 0, e2 * 100 > C.expoMax + 10 ? 2 : e2 * 100 > C.expoMax ? 1 : 0, c2 > 0.40 ? 2 : c2 > 0.25 ? 1 : 0, rr[0].vpl > 0 ? 0 : rr[0].vpl > -0.5 * Math.max(rb.vpl, 1) ? 1 : 2];
    const nc = fl.filter(f => f === 2).length, na = fl.filter(f => f === 1).length;
    return { i, nome: P.nome, rb, vplEsp: rr.reduce((a, r, j) => a + r.vpl * W[j], 0), risco: nc >= 2 ? ['alto', 'cr'] : nc + na >= 2 ? ['moderado', 'at'] : ['baixo', 'ok'], nivel: nc * 2 + na };
  });
  const melhor = comp.reduce((b, c) => (c.vplEsp - c.nivel * 1e6) > (b.vplEsp - b.nivel * 1e6) ? c : b, comp[0]);

  // legal
  const dd = L.dd, rs = L.restricoes, lc = L.licencas;
  const cnt = (a, k) => a.filter(x => x.k === k).length;
  const autoParecer = dd.concat(rs).filter(x => x.k === 'cr' || x.k === 'at').map(x => ({ t: x.nome + (x.status ? ' — ' + x.status : ''), v: x.fonte, k: x.k }));
  const prazoLic = lc.reduce((a, x) => a + (+x.prazo || 0), 0);

  // urbanismo
  const POT = (E.area || 0) * (E.ca || 0), computavel = D.apT + (PR.comum || 0);
  const usoCA = POT ? computavel / POT : null;
  const projOcup = PR.pavimentos > 0 && E.area > 0 ? (D.apT / Math.max(1, PR.pavimentos)) / E.area : null;

  // condicionantes automáticas
  const condAuto = [
    'Aquisição do terreno com custo total de ' + milhoes(R.terrenoEq) + ' (' + pct(R.terrenoEq / R.vgv, 0) + ' do VGV), com pagamento vinculado ao registro de incorporação.',
    'Contratação da obra a preço fechado, reajuste limitado ao INCC e teto de ' + mil(PR.custo * 1.05) + '/m² equivalente.',
    'Instituição de patrimônio de afetação e adesão ao RET antes do lançamento.',
    (PR.finPct ?? 0) > 0 && !PR.assoc ? 'Financiamento à produção contratado até o mês 6, com limite de ' + num(PR.finPct, 0) + '% do custo de obra.' : PR.assoc ? 'Enquadramento no crédito associativo antes do lançamento.' : null,
    ...dd.concat(rs).filter(x => x.k === 'cr').map(x => 'Resolver antes da escritura: ' + x.nome.toLowerCase() + (x.status ? ' (' + x.status + ')' : '') + '.'),
    usoCA && usoCA > 1 ? 'Ajustar o produto: área computável estimada usa ' + pct(usoCA, 0) + ' do potencial construtivo (CA ' + num(E.ca, 1) + ').' : null
  ].filter(Boolean);

  const verdictK = verdict[0] === 'Aprovar' ? 'ok' : verdict[0] === 'Reprovar' ? 'cr' : 'at';
  return { PM, PR, D, sel, R, RR, pB, pIn, W, esp, crit, verdict, verdictK, MK, aff, premissas, usos, CTE, riscos, riscoNivel, matrizes, tornado, macroFx, be, comp, melhor, cnt, autoParecer, prazoLic, POT, computavel, usoCA, projOcup, condAuto, nossasVendasMes, qP, qC };
}
