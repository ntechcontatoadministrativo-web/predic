'use strict';
/* PREDIC · base de dados: planilhas livres, mapeamento de colunas e motor de padrões (estatística, regressão hedônica, tendência, comparáveis) */

/* ============================ papéis das colunas ============================ */
// [chave, rótulo, tipo]. A ordem é a do seletor de mapeamento.
const PAPEIS = [
  ['ignorar', 'Ignorar coluna', ''], ['nome', 'Empreendimento', 'txt'], ['bairro', 'Bairro / região', 'txt'], ['cidade', 'Cidade', 'txt'], ['incorp', 'Incorporadora', 'txt'],
  ['tipo', 'Tipologia', 'txt'], ['dorms', 'Dormitórios', 'num'], ['suites', 'Suítes', 'num'], ['vagas', 'Vagas', 'num'], ['padrao', 'Padrão', 'txt'],
  ['area', 'Área privativa (m²)', 'num'], ['preco', 'Preço total (R$)', 'num'], ['m2', 'Preço por m² (R$)', 'num'], ['data', 'Data (lançamento / pesquisa)', 'data'],
  ['vso', 'VSO (% a.m.)', 'num'], ['total', 'Unidades totais', 'num'], ['vendidas', 'Unidades vendidas', 'num'], ['estoque', 'Estoque (un.)', 'num'],
  ['lat', 'Latitude', 'num'], ['lon', 'Longitude', 'num'], ['status', 'Situação / fase', 'txt']
];
const PAPEL = Object.fromEntries(PAPEIS.map(p => [p[0], p]));
const MAX_LINHAS = 15000, MAX_COLS = 40;
// Padrão construtivo em escala ordinal (usada no modelo de preço)
const padOrd = s => { const x = norm(s); if (!x) return null; return /luxo|altissim|premium|super ?alto/.test(x) ? 5 : /medio.?alto|medio superior|alto medio/.test(x) ? 3 : /alto/.test(x) ? 4 : /econ|popular|mcmv|hmp|his|minha casa|basico|baixo/.test(x) ? 1 : /medio|standard|normal/.test(x) ? 2 : null; };
const PAD_TXT = { 1: 'econômico', 2: 'médio', 3: 'médio-alto', 4: 'alto', 5: 'luxo' };
const dormsDe = s => { const x = norm(s); if (!x) return null; if (/studio|kitnet|kit|loft|estudio/.test(x)) return 0; const m = x.match(/(\d+)\s*(d\b|ds\b|dorm|dts?\b|q\b|qs\b|quarto|qto|suite)/) || x.match(/^(\d)\b/); return m ? +m[1] : null; };

// Número em qualquer formato brasileiro ou internacional: "R$ 9.500,00", "9,500.00", "1,2 mi", "850 mil", "4,1%".
function numBR(v) {
  if (typeof v === 'number') return isFinite(v) ? v : NaN;
  if (v == null || v instanceof Date) return NaN;
  let s = String(v).trim().toLowerCase(); if (!s) return NaN;
  let mult = 1;
  if (/\bmi(lh[õo]es|lh[ãa]o)?\b|\bmm\b/.test(s)) mult = 1e6; else if (/\bmil\b|\d\s*k\b/.test(s)) mult = 1e3;
  s = s.replace(/[^\d,.\-]/g, ''); if (!s || !/\d/.test(s)) return NaN;
  const c = s.lastIndexOf(','), p = s.lastIndexOf('.');
  if (c >= 0 && p >= 0) s = c > p ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (c >= 0) s = (s.match(/,/g).length > 1 || /,\d{3}$/.test(s) && !/^-?0,/.test(s) && s.length > 5) ? s.replace(/,/g, '') : s.replace(',', '.');
  else if (p >= 0 && (s.match(/\./g).length > 1 || /^\-?\d{1,3}\.\d{3}$/.test(s))) s = s.replace(/\./g, '');
  const n = parseFloat(s); return isFinite(n) ? n * mult : NaN;
}
// Data em ms: Date, serial do Excel, "2025-03-10", "10/03/2025", "03/2025", "mar/25", "2025".
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
function dataDe(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) return isNaN(v) ? null : v.getTime();
  if (typeof v === 'number') return v > 20000 && v < 80000 ? Date.UTC(1899, 11, 30) + v * 864e5 : v >= 1990 && v <= 2100 ? Date.UTC(v, 6, 1) : null;
  const s = norm(v); let m;
  if ((m = s.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/))) return Date.UTC(+m[1], +m[2] - 1, +(m[3] || 1));
  if ((m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/))) { const y = +m[3] < 100 ? 2000 + +m[3] : +m[3]; return Date.UTC(y, +m[2] - 1, +m[1]); }
  if ((m = s.match(/^(\d{1,2})[\/.-](\d{4})$/))) return Date.UTC(+m[2], +m[1] - 1, 1);
  if ((m = s.match(/^([a-z]{3})[a-z]*[\/\s.-]*(?:de\s*)?(\d{2,4})$/)) && MESES.includes(m[1])) { const y = +m[2] < 100 ? 2000 + +m[2] : +m[2]; return Date.UTC(y, MESES.indexOf(m[1]), 1); }
  if ((m = s.match(/^([1-4])\s*(?:o|º)?\s*t(?:ri[a-z]*)?[\/\s.-]*(\d{2,4})$/))) { const y = +m[2] < 100 ? 2000 + +m[2] : +m[2]; return Date.UTC(y, (+m[1] - 1) * 3 + 1, 1); }
  if ((m = s.match(/^(19|20)\d{2}$/))) return Date.UTC(+s, 6, 1);
  return null;
}
const isoDia = t => new Date(t).toISOString().slice(0, 10);
const mesDe = t => new Date(t).toISOString().slice(0, 7);
const mesBR = ym => { const [y, m] = ym.split('-'); return MESES[+m - 1] + '/' + y.slice(2); };

// Papel pelo título da coluna; se o título não diz nada, olha o conteúdo.
function detectarPapel(h, vals) {
  const x = norm(h).replace(/²/g, '2').replace(/\s+/g, ' ');
  const t = re => re.test(x);
  if (t(/^lat(itude)?\b/)) return 'lat';
  if (t(/^(lon|lng|long)(gitude)?\b/)) return 'lon';
  if (t(/\bvso\b|velocidade/)) return 'vso';
  if (!t(/area|metragem/) && (t(/(r\$|preco|valor|ticket).*(m2|metro)|(m2|metro).*(r\$|preco|valor)|\/ ?m2\b|por m2/))) return 'm2';
  if (t(/area|metragem|tamanho|m2 priv|privativ/)) return 'area';
  if (t(/suite/)) return 'suites';
  if (t(/dorm|quarto|^q(tos?)?$|^dts?$|n.? ?de q/)) return 'dorms';
  if (t(/vaga|garag/)) return 'vagas';
  if (t(/estoque|disponive|saldo|a venda|em oferta/)) return 'estoque';
  if (t(/vendid|comercializad/)) return 'vendidas';
  if (t(/total de un|unidades|qtd|quantidade|lancad|n.? de un|^un\.?$/)) return 'total';
  if (t(/incorpor|construtor|empresa|desenvolvedor/)) return 'incorp';
  if (t(/bairro|regiao|setor|distrito|microrregiao|localizacao|zona\b/)) return 'bairro';
  if (t(/cidade|municipio/)) return 'cidade';
  if (t(/tipolog|^tipo|planta|configurac/)) return 'tipo';
  if (t(/padrao|segmento|classe|categoria|acabamento/)) return 'padrao';
  if (t(/status|situac|fase|estagio|obra/)) return 'status';
  if (t(/data|lancamento|^mes|periodo|competencia|^ano$|trimestre|^dt/)) return 'data';
  if (t(/preco|valor|ticket|venda|r\$/)) return 'preco';
  if (t(/empreend|edif|condominio|residencial|projeto|produto|nome|imovel|predio|torre/)) return 'nome';
  // pelo conteúdo
  const v = vals.filter(y => y !== '' && y != null).slice(0, 60); if (!v.length) return 'ignorar';
  if (v.filter(y => y instanceof Date || (typeof y === 'string' && dataDe(y) && /[\/-]/.test(y))).length >= v.length * 0.7) return 'data';
  const n = v.map(numBR).filter(isFinite);
  if (n.length >= v.length * 0.8) {
    const md = mediana(n);
    if (n.every(a => a >= -35 && a <= 6) && n.some(a => a % 1)) return 'lat';
    if (n.every(a => a >= -75 && a <= -28) && n.some(a => a % 1)) return 'lon';
    if (md >= 50000) return 'preco';
    if (md >= 1500 && md < 50000) return 'm2';
    if (md >= 20 && md < 600) return 'area';
    return 'ignorar';
  }
  return 'ignorar';
}

/* ============================ leitura da planilha ============================ */
const cel = v => v instanceof Date ? (isNaN(v) ? '' : isoDia(v.getTime())) : typeof v === 'string' ? v.trim().slice(0, 140) : typeof v === 'number' && isFinite(v) ? v : v == null ? '' : String(v).slice(0, 140);
// Matriz (linhas × células) → aba com cabeçalho detectado: primeira linha, entre as 20 primeiras, com 2+ títulos de texto seguida de dados.
function abaDeMatriz(nome, all) {
  let hi = all.slice(0, 20).findIndex((r, i) => r.filter(v => typeof v === 'string' && v.trim() && !isFinite(numBR(v)) && !dataDe(v)).length >= 2 && (all[i + 1] || []).filter(v => v !== '').length >= 2);
  if (hi < 0) hi = 0;
  const head = (all[hi] || []).slice(0, MAX_COLS).map((h, i) => String(cel(h) || 'Coluna ' + (i + 1)));
  const vistos = {}; const cols = head.map(h => { vistos[h] = (vistos[h] || 0) + 1; return vistos[h] > 1 ? h + ' (' + vistos[h] + ')' : h; });
  const rows = all.slice(hi + 1).map(r => cols.map((_, i) => cel(r[i])))
    .filter(r => r.filter(v => v !== '').length >= 2 && !/^(total|soma|media|m[ée]dia|subtotal)\b/i.test(String(r[0])));
  return { nome, cols, rows };
}
// CSV/TSV ou texto colado do Excel: separador detectado na primeira linha; células ficam como texto e o numBR interpreta "9.500,00".
function lerTexto(txt) {
  const t = String(txt).replace(/^﻿/, '').replace(/\r\n?/g, '\n'), l1 = t.split('\n')[0];
  const sep = ['\t', ';', ',', '|'].map(s => [s, l1.split(s).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = []; let row = [], c = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) { if (ch === '"') { if (t[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; }
    else if (ch === '"' && !c) q = true;
    else if (ch === sep) { row.push(c.trim()); c = ''; }
    else if (ch === '\n') { row.push(c.trim()); rows.push(row); row = []; c = ''; }
    else c += ch;
  }
  if (c || row.length) { row.push(c.trim()); rows.push(row); }
  return rows.filter(r => r.some(v => v !== ''));
}
// Lê qualquer planilha (.xlsx, .xls, .ods) ou texto (.csv, .tsv, colado) e devolve as abas com cabeçalho e linhas.
function lerPlanilhaLivre(entrada) {
  if (typeof entrada === 'string') return [abaDeMatriz('', lerTexto(entrada))].filter(a => a.cols.length >= 2 && a.rows.length >= 1);
  const X = window.XLSX; if (!X) throw new Error('Biblioteca de planilha não carregou.');
  const wb = X.read(entrada, { type: 'array', cellDates: true });
  return wb.SheetNames.map(nome => abaDeMatriz(nome, X.utils.sheet_to_json(wb.Sheets[nome], { header: 1, defval: '', raw: true, blankrows: false })))
    .filter(a => a.cols.length >= 2 && a.rows.length >= 1);
}
// Cria a base a partir de uma aba: detecta o papel de cada coluna (um papel por coluna, o primeiro vence).
function novaBase(aba, arquivo) {
  const usados = new Set();
  const cols = aba.cols.map((h, i) => {
    let p = detectarPapel(h, aba.rows.map(r => r[i]));
    if (p !== 'ignorar' && usados.has(p)) p = 'ignorar'; usados.add(p);
    return { h, papel: p };
  });
  return { id: uid(), nome: (arquivo ? arquivo.replace(/\.[a-z0-9]+$/i, '') : 'Base colada') + (aba.nome && !/^(sheet|planilha|plan)\s*1$/i.test(aba.nome) ? ' · ' + aba.nome : ''), arquivo: arquivo || '', aba: aba.nome || '', em: Date.now(), ativa: true, cols, rows: aba.rows.slice(0, MAX_LINHAS) };
}

/* ============================ registros tratados ============================ */
// Junta as bases ativas num único conjunto de registros normalizados (preço/m², ticket, VSO e estoque derivados quando faltam).
function registrosDe(bases, opt = {}) {
  const out = [], hoje = opt.hoje || Date.now();
  (bases || []).filter(b => b.ativa !== false).forEach(b => {
    const ix = {}; b.cols.forEach((c, i) => { if (c.papel && c.papel !== 'ignorar') ix[c.papel] = i; });
    const g = (r, k) => ix[k] == null ? '' : r[ix[k]];
    const N = (r, k) => { const v = numBR(g(r, k)); return isFinite(v) ? v : null; };
    const T = (r, k) => { const v = g(r, k); return v === '' || v == null ? '' : String(v).trim(); };
    let L = b.rows.map((r, i) => {
      const tipo = T(r, 'tipo'), padrao = T(r, 'padrao');
      return { base: b.id, i, nome: T(r, 'nome'), bairro: T(r, 'bairro'), cidade: T(r, 'cidade'), incorp: T(r, 'incorp'), tipo, padrao, status: T(r, 'status'),
        dorms: N(r, 'dorms') ?? dormsDe(tipo), suites: N(r, 'suites'), vagas: N(r, 'vagas'), area: N(r, 'area'), preco: N(r, 'preco'), m2: N(r, 'm2'), data: dataDe(g(r, 'data')),
        vso: N(r, 'vso'), total: N(r, 'total'), vendidas: N(r, 'vendidas'), estoque: N(r, 'estoque'), lat: N(r, 'lat'), lon: N(r, 'lon'), pad: padOrd(padrao) ?? padOrd(tipo), der: [] };
    });
    // unidades: preço em R$ mil, VSO como fração
    const razao = L.filter(x => x.preco > 0 && x.area > 0).map(x => x.preco / x.area);
    if (razao.length && mediana(razao) < 60) L.forEach(x => { if (x.preco != null) x.preco *= 1000; });
    else if (ix.area == null && ix.m2 == null && ix.preco != null) { const pp = L.map(x => x.preco).filter(v => v > 0); if (pp.length >= 3 && mediana(pp) < 5000) L.forEach(x => { if (x.preco != null) x.preco *= 1000; }); }
    const vv = L.map(x => x.vso).filter(v => v > 0); if (vv.length >= 3 && mediana(vv) < 0.5) L.forEach(x => { if (x.vso != null) x.vso *= 100; });
    L.forEach(x => {
      if (x.m2 == null && x.preco > 0 && x.area > 0) { x.m2 = x.preco / x.area; x.der.push('m2'); }
      if (x.preco == null && x.m2 > 0 && x.area > 0) { x.preco = x.m2 * x.area; x.der.push('preco'); }
      if (x.area == null && x.preco > 0 && x.m2 > 0) { x.area = x.preco / x.m2; x.der.push('area'); }
      if (x.estoque == null && x.total > 0 && x.vendidas != null) { x.estoque = Math.max(0, x.total - x.vendidas); x.der.push('estoque'); }
      if (x.vendidas == null && x.total > 0 && x.estoque != null) { x.vendidas = Math.max(0, x.total - x.estoque); x.der.push('vendidas'); }
      if (x.vso == null && x.total > 0 && x.vendidas != null && x.data) { const meses = (hoje - x.data) / (30.44 * 864e5); if (meses >= 1 && meses < 120) { x.vso = x.vendidas / x.total / meses * 100; x.der.push('vso'); } }
      if (!(x.lat >= -35 && x.lat <= 6 && x.lon >= -75 && x.lon <= -28)) x.lat = x.lon = null;
      x.ok = x.m2 >= 300 && x.m2 <= 150000;
    });
    out.push(...L);
  });
  return out;
}

/* ============================ estatística ============================ */
const ordenar = a => a.filter(ok).slice().sort((x, y) => x - y);
const quantil = (s, q) => { if (!s.length) return null; const p = (s.length - 1) * q, b = Math.floor(p); return s[b + 1] !== undefined ? s[b] + (p - b) * (s[b + 1] - s[b]) : s[b]; };
const mediana = a => quantil(ordenar(a), 0.5);
const media = a => { const v = a.filter(ok); return v.length ? v.reduce((x, y) => x + y, 0) / v.length : null; };
const desvio = a => { const v = a.filter(ok), m = media(v); return v.length > 1 ? Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1)) : null; };
const resumo = a => { const s = ordenar(a); return s.length ? { n: s.length, min: s[0], p10: quantil(s, 0.1), p25: quantil(s, 0.25), med: quantil(s, 0.5), p75: quantil(s, 0.75), p90: quantil(s, 0.9), max: s[s.length - 1], media: media(s), dp: desvio(s) } : { n: 0 }; };
const moda = a => { const c = {}; a.filter(Boolean).forEach(x => { c[x] = (c[x] || 0) + 1; }); return Object.entries(c).sort((x, y) => y[1] - x[1])[0]?.[0] || ''; };
function pearson(xs, ys) {
  const p = xs.map((x, i) => [x, ys[i]]).filter(([x, y]) => ok(x) && ok(y)); if (p.length < 6) return null;
  const mx = media(p.map(q => q[0])), my = media(p.map(q => q[1]));
  let sxy = 0, sxx = 0, syy = 0; p.forEach(([x, y]) => { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; });
  return sxx > 0 && syy > 0 ? { r: sxy / Math.sqrt(sxx * syy), n: p.length } : null;
}
const percentil = (s, v) => s.length ? s.filter(x => x < v).length / s.length + s.filter(x => x === v).length / s.length / 2 : null;
const distKm = (a, b, c, d) => { const R = 6371, r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
// Outliers robustos (mediana e desvio absoluto mediano) sobre o log do R$/m²
function marcarOutliers(recs) {
  const l = recs.filter(r => r.ok).map(r => Math.log(r.m2)), md = mediana(l), mad = mediana(l.map(x => Math.abs(x - md))) || 0.0001;
  recs.forEach(r => { r.z = r.ok ? 0.6745 * (Math.log(r.m2) - md) / mad : null; r.out = !r.ok || Math.abs(r.z) > 3.5; });
}

// Mínimos quadrados com estabilização leve (ridge) e erros-padrão. X já inclui a coluna do intercepto.
function ols(X, y, lambda = 1e-6) {
  const n = X.length, k = X[0].length; if (n < k + 3) return null;
  const A = Array.from({ length: k }, () => new Array(k).fill(0)), b = new Array(k).fill(0);
  for (let i = 0; i < n; i++) { const xi = X[i]; for (let a = 0; a < k; a++) { b[a] += xi[a] * y[i]; for (let c = a; c < k; c++) A[a][c] += xi[a] * xi[c]; } }
  for (let a = 0; a < k; a++) { for (let c = 0; c < a; c++) A[a][c] = A[c][a]; if (a) A[a][a] += lambda * n; }
  // inversa por Gauss-Jordan com pivô parcial
  const M = A.map((r, i) => r.concat(Array.from({ length: k }, (_, j) => i === j ? 1 : 0)));
  for (let c = 0; c < k; c++) {
    let p = c; for (let r = c + 1; r < k; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-10) return null;
    [M[c], M[p]] = [M[p], M[c]]; const d = M[c][c]; for (let j = 0; j < 2 * k; j++) M[c][j] /= d;
    for (let r = 0; r < k; r++) if (r !== c && M[r][c]) { const f = M[r][c]; for (let j = 0; j < 2 * k; j++) M[r][j] -= f * M[c][j]; }
  }
  const inv = M.map(r => r.slice(k)), beta = inv.map(r => r.reduce((s, v, j) => s + v * b[j], 0));
  const yh = X.map(xi => xi.reduce((s, v, j) => s + v * beta[j], 0)), res = y.map((v, i) => v - yh[i]);
  const my = media(y), sst = y.reduce((s, v) => s + (v - my) ** 2, 0), sse = res.reduce((s, v) => s + v * v, 0);
  const s2 = sse / Math.max(1, n - k), r2 = sst > 0 ? 1 - sse / sst : 0;
  return { beta, se: inv.map((r, i) => Math.sqrt(Math.max(0, r[i] * s2))), r2, r2aj: 1 - (1 - r2) * (n - 1) / Math.max(1, n - k), sigma: Math.sqrt(s2), n, k, res, smear: media(res.map(Math.exp)) || 1 };
}

/* ============================ motor de padrões ============================ */
// alvo: o produto do estudo { nome, mix:[{tipo,un,area,preco}], padrao, vagasUn, precoM2, ticket, vso, lat, lon, bairro }
// filtro: { bairros:[], dorms:[], padroes:[], desde:'AAAA-MM', ate:'AAAA-MM', raioKm, outliers }
function analisarPadroes(bases, alvo = {}, filtro = {}, macro = null, opt = {}) {
  const todos = registrosDe(bases, opt); marcarOutliers(todos);
  const geo = ok(alvo.lat) && ok(alvo.lon);
  todos.forEach(r => { r.dist = geo && r.lat != null ? distKm(alvo.lat, alvo.lon, r.lat, r.lon) : null; });
  const F = filtro || {};
  const passa = r => (!F.bairros?.length || F.bairros.includes(r.bairro || '—')) && (!F.dorms?.length || F.dorms.includes(r.dorms == null ? '—' : String(r.dorms >= 4 ? 4 : r.dorms)))
    && (!F.padroes?.length || F.padroes.includes(r.pad ? PAD_TXT[r.pad] : '—')) && (!F.desde || (r.data && mesDe(r.data) >= F.desde)) && (!F.ate || (r.data && mesDe(r.data) <= F.ate))
    && (!F.raioKm || (r.dist != null && r.dist <= F.raioKm));
  const filtrados = todos.filter(passa);
  const V = filtrados.filter(r => r.ok && (F.outliers || !r.out));
  const out = { total: todos.length, nFiltro: filtrados.length, n: V.length, nOut: filtrados.filter(r => r.ok && r.out).length, nInval: filtrados.filter(r => !r.ok).length, recs: V, todos };
  const tem = k => V.filter(r => r[k] != null && r[k] !== '').length;
  out.cobertura = Object.fromEntries(['nome', 'bairro', 'tipo', 'dorms', 'vagas', 'padrao', 'area', 'preco', 'm2', 'data', 'vso', 'estoque', 'total', 'vendidas', 'lat', 'incorp'].map(k => [k, V.length ? tem(k === 'padrao' ? 'pad' : k) / V.length : 0]));
  out.opcoes = { bairros: [...new Set(todos.map(r => r.bairro || '—'))].sort(), dorms: [...new Set(todos.map(r => r.dorms == null ? '—' : String(r.dorms >= 4 ? 4 : r.dorms)))].sort(), padroes: [...new Set(todos.map(r => r.pad ? PAD_TXT[r.pad] : '—'))], meses: [...new Set(todos.filter(r => r.data).map(r => mesDe(r.data)))].sort(), temGeo: todos.some(r => r.lat != null) && geo };
  out.nEmp = new Set(V.map(r => norm(r.nome)).filter(Boolean)).size;
  if (V.length < 3) { out.insights = [{ k: 'na', t: V.length ? 'Poucos registros válidos (' + V.length + ') para encontrar padrões. Importe ao menos 10 linhas com preço e área ou R$/m².' : 'Nenhum registro com preço por m² válido. Confira o mapeamento das colunas (preço, área ou R$/m²).' }]; return out; }

  out.est = { m2: resumo(V.map(r => r.m2)), area: resumo(V.map(r => r.area)), preco: resumo(V.map(r => r.preco)), vso: resumo(V.map(r => r.vso)), estoque: V.reduce((a, r) => a + (r.estoque || 0), 0), dorms: resumo(V.map(r => r.dorms)) };
  // histograma do R$/m² (P1 a P99 para não esticar o eixo)
  { const s = ordenar(V.map(r => r.m2)), lo = quantil(s, 0.01), hi = quantil(s, 0.99), nb = Math.min(14, Math.max(6, Math.round(Math.sqrt(s.length)))), w = (hi - lo) / nb || 1;
    const bins = Array.from({ length: nb }, (_, i) => ({ de: lo + i * w, ate: lo + (i + 1) * w, n: 0 })); s.forEach(v => { const i = Math.min(nb - 1, Math.max(0, Math.floor((v - lo) / w))); bins[i].n++; }); out.hist = bins; }

  // grupos
  const agrupar = (fk, min = 1) => {
    const G = {}; V.forEach(r => { const k = fk(r); if (k == null || k === '') return; (G[k] = G[k] || []).push(r); });
    return Object.entries(G).filter(([, l]) => l.length >= min).map(([k, l]) => { const est = l.reduce((a, r) => a + (r.estoque || 0), 0); const vs = l.map(r => r.vso).filter(ok);
      return { k, n: l.length, m2: mediana(l.map(r => r.m2)), area: mediana(l.map(r => r.area)), ticket: mediana(l.map(r => r.preco)), vso: vs.length ? mediana(vs) : null, estoque: est, vel: l.reduce((a, r) => a + (r.estoque && r.vso ? r.estoque * r.vso / 100 : 0), 0), dp: desvio(l.map(r => r.m2)) }; })
      .sort((a, b) => b.n - a.n);
  };
  const fDorm = r => r.dorms == null ? null : r.dorms === 0 ? 'Studio' : r.dorms >= 4 ? '4+ dorm.' : r.dorms + ' dorm.';
  out.grupos = { bairro: agrupar(r => r.bairro), dorms: agrupar(fDorm), padrao: agrupar(r => r.pad ? PAD_TXT[r.pad] : null), incorp: agrupar(r => r.incorp), status: agrupar(r => r.status) };
  // faixas de ticket (quartis)
  { const s = ordenar(V.map(r => r.preco)); if (s.length >= 8) { const q = [0, 0.25, 0.5, 0.75, 1].map(p => quantil(s, p));
    out.grupos.ticket = agrupar(r => r.preco == null ? null : String(r.preco <= q[1] ? 0 : r.preco <= q[2] ? 1 : r.preco <= q[3] ? 2 : 3)).sort((a, b) => a.k - b.k).map(g => ({ ...g, k: 'R$ ' + num(q[+g.k] / 1000) + ' a ' + num(q[+g.k + 1] / 1000) + ' mil', de: q[+g.k], ate: q[+g.k + 1] })); } }

  // curva área × R$/m² (potência): ln m2 = a + b ln área
  const VA = V.filter(r => r.area > 0);
  if (VA.length >= 6) { const f = ols(VA.map(r => [1, Math.log(r.area)]), VA.map(r => Math.log(r.m2))); if (f) out.curva = { a: f.beta[0], b: f.beta[1], r2: f.r2, se: f.se[1], n: f.n, at: x => Math.exp(f.beta[0] + f.beta[1] * Math.log(x)) * f.smear }; }

  // tendência no tempo
  const VT = V.filter(r => r.data);
  if (VT.length >= 6) {
    const t0 = Math.min(...VT.map(r => r.data)), t1 = Math.max(...VT.map(r => r.data)), meses = (t1 - t0) / (30.44 * 864e5);
    const trim = meses > 30, chave = r => { const d = new Date(r.data); return trim ? d.getUTCFullYear() + '-T' + (Math.floor(d.getUTCMonth() / 3) + 1) : mesDe(r.data); };
    const G = {}; VT.forEach(r => { (G[chave(r)] = G[chave(r)] || []).push(r); });
    const serie = Object.keys(G).sort().map(k => ({ k, rot: trim ? k.replace(/^(\d{4})-T(\d)$/, '$2T/$1').replace(/\/20(\d\d)$/, '/$1') : mesBR(k), n: G[k].length, m2: mediana(G[k].map(r => r.m2)), vso: mediana(G[k].map(r => r.vso).filter(ok)) }));
    let ano = null; if (meses >= 3) { const f = ols(VT.map(r => [1, (r.data - t0) / (365.25 * 864e5)]), VT.map(r => Math.log(r.m2))); if (f) ano = { g: Math.exp(f.beta[1]) - 1, t: f.se[1] > 0 ? f.beta[1] / f.se[1] : 0, n: f.n }; }
    out.tend = { serie, meses, ano, inicio: t0, fim: t1, trim };
    if (ano && macro) { if (macro.ipca) ano.real = (1 + ano.g) / (1 + macro.ipca.v / 100) - 1; if (macro.incc) ano.vsIncc = ano.g - macro.incc.v / 100; }
  }

  // modelo hedônico: ln(R$/m²) explicado por área, dormitórios, vagas, padrão, bairro, tempo e distância
  out.modelo = modeloPreco(V, alvo);

  // correlações entre variáveis numéricas
  { const VARS = [['m2', 'R$/m²'], ['area', 'Área'], ['preco', 'Ticket'], ['dorms', 'Dormitórios'], ['vagas', 'Vagas'], ['pad', 'Padrão'], ['vso', 'VSO'], ['estoque', 'Estoque'], ['data', 'Data'], ['dist', 'Distância']].filter(([k]) => V.filter(r => ok(r[k])).length >= 6 && new Set(V.map(r => r[k]).filter(ok)).size > 1);
    const mat = VARS.map(([a]) => VARS.map(([b]) => a === b ? { r: 1, n: V.length } : pearson(V.map(r => r[a]), V.map(r => r[b]))));
    const pares = []; VARS.forEach((a, i) => VARS.forEach((b, j) => { if (j > i && mat[i][j] && Math.abs(mat[i][j].r) >= 0.3) pares.push({ a: a[1], b: b[1], ka: a[0], kb: b[0], r: mat[i][j].r, n: mat[i][j].n }); }));
    out.corr = { vars: VARS, mat, pares: pares.sort((x, y) => Math.abs(y.r) - Math.abs(x.r)) }; }

  // o que puxa a VSO: prêmio de preço sobre a mediana do grupo (bairro ou geral)
  const VV = V.filter(r => ok(r.vso) && r.vso > 0);
  if (VV.length >= 8) {
    const medB = Object.fromEntries(out.grupos.bairro.filter(g => g.n >= 3).map(g => [g.k, g.m2])), mG = out.est.m2.med;
    const prem = VV.map(r => r.m2 / (medB[r.bairro] || mG) - 1), c = pearson(prem, VV.map(r => r.vso));
    const baratos = VV.filter((r, i) => prem[i] < -0.03), caros = VV.filter((r, i) => prem[i] > 0.03);
    out.vsoPreco = { r: c?.r ?? null, vBarato: baratos.length >= 3 ? mediana(baratos.map(r => r.vso)) : null, vCaro: caros.length >= 3 ? mediana(caros.map(r => r.vso)) : null, nB: baratos.length, nC: caros.length };
  }

  // espacial: gradiente de preço com a distância ao terreno
  const VD = V.filter(r => r.dist != null);
  if (VD.length >= 8) { const f = ols(VD.map(r => [1, r.dist]), VD.map(r => Math.log(r.m2))); const perto = VD.filter(r => r.dist <= 1.5);
    out.espacial = { n: VD.length, gradKm: f ? Math.exp(f.beta[1]) - 1 : null, t: f && f.se[1] > 0 ? f.beta[1] / f.se[1] : 0, r2: f?.r2, m2Perto: perto.length >= 3 ? mediana(perto.map(r => r.m2)) : null, nPerto: perto.length }; }

  // comparáveis: vizinhos mais parecidos com o produto do estudo
  out.comps = comparaveis(V, alvo);
  out.posicao = alvo.precoM2 > 0 ? { m2: percentil(ordenar(V.map(r => r.m2)), alvo.precoM2), ticket: alvo.ticket > 0 && out.est.preco.n ? percentil(ordenar(V.map(r => r.preco)), alvo.ticket) : null } : null;
  out.sugestao = sugerir(out, alvo);
  out.insights = insights(out, alvo, macro);
  return out;
}

function modeloPreco(V, alvo) {
  const base = V.filter(r => r.area > 0); if (base.length < 10) return null;
  const cob = k => base.filter(r => ok(r[k])).length / base.length, varia = k => new Set(base.map(r => r[k]).filter(ok)).size > 1;
  const med = k => mediana(base.map(r => r[k]));
  const feats = [{ k: 'lnArea', l: 'Área privativa (+10%)', f: r => Math.log(r.area), alvo: m => Math.log(m.area), efeito: b => Math.pow(1.1, b) - 1 }];
  const num1 = (k, l, alvoFn) => { if (cob(k) >= 0.7 && varia(k)) { const m = med(k); feats.push({ k, l, f: r => ok(r[k]) ? r[k] : m, alvo: alvoFn || (() => m), efeito: b => Math.exp(b) - 1 }); } };
  num1('dorms', 'Cada dormitório a mais', m => dormsDe(m.tipo) ?? med('dorms'));
  num1('vagas', 'Cada vaga a mais', () => ok(alvo.vagasUn) ? alvo.vagasUn : med('vagas'));
  num1('pad', 'Cada nível de padrão acima', () => padOrd(alvo.padrao) ?? med('pad'));
  const t0 = Math.min(...base.filter(r => r.data).map(r => r.data));
  if (cob('data') >= 0.7 && base.filter(r => r.data).length && (Math.max(...base.filter(r => r.data).map(r => r.data)) - t0) > 90 * 864e5) { const m = med('data'); feats.push({ k: 'ano', l: 'Por ano (valorização)', f: r => ((r.data ?? m) - t0) / (365.25 * 864e5), alvo: () => (Date.now() - t0) / (365.25 * 864e5), efeito: b => Math.exp(b) - 1 }); }
  if (cob('dist') >= 0.7 && varia('dist')) { const m = med('dist'); feats.push({ k: 'dist', l: 'Cada km mais longe do terreno', f: r => r.dist ?? m, alvo: () => 0, efeito: b => Math.exp(b) - 1 }); }
  // bairros: referência = o mais frequente; bairros com menos de 3 registros entram como "demais"
  const cont = {}; base.forEach(r => { if (r.bairro) cont[r.bairro] = (cont[r.bairro] || 0) + 1; });
  const ordB = Object.entries(cont).sort((a, b) => b[1] - a[1]); let refB = null, dumB = [];
  if (base.filter(r => r.bairro).length / base.length >= 0.7 && ordB.length >= 2) {
    refB = ordB[0][0]; dumB = ordB.slice(1).filter(([, n]) => n >= 3).slice(0, 10).map(([b]) => b);
    const raros = ordB.slice(1).filter(([b]) => !dumB.includes(b)).length;
    const alvoB = alvo.bairro ? ordB.map(x => x[0]).find(b => norm(b) === norm(alvo.bairro) || norm(b).includes(norm(alvo.bairro)) || norm(alvo.bairro).includes(norm(b))) : null;
    const share = b => base.filter(r => r.bairro === b).length / base.length;
    dumB.forEach(b => feats.push({ k: 'b:' + b, l: b, bairro: true, f: r => r.bairro === b ? 1 : 0, alvo: () => alvoB ? (alvoB === b ? 1 : 0) : share(b), efeito: x => Math.exp(x) - 1 }));
    if (raros) feats.push({ k: 'b:demais', l: 'Demais bairros', bairro: true, f: r => r.bairro && r.bairro !== refB && !dumB.includes(r.bairro) ? 1 : 0, alvo: () => alvoB ? (alvoB !== refB && !dumB.includes(alvoB) ? 1 : 0) : base.filter(r => r.bairro && r.bairro !== refB && !dumB.includes(r.bairro)).length / base.length, efeito: x => Math.exp(x) - 1 });
    feats.alvoB = alvoB;
  }
  // ajusta e, se a matriz for singular ou houver poucos graus de liberdade, retira variáveis do fim
  let F = feats.slice(), fit = null;
  while (F.length) { if (base.length >= F.length + 6) { fit = ols(base.map(r => [1].concat(F.map(f => f.f(r)))), base.map(r => Math.log(r.m2)), 1e-4); if (fit) break; } F = F.slice(0, -1); }
  if (!fit) return null;
  const coefs = F.map((f, i) => { const b = fit.beta[i + 1], se = fit.se[i + 1], t = se > 0 ? b / se : 0; return { k: f.k, l: f.l, bairro: !!f.bairro, b, se, t, efeito: f.efeito(b), sig: Math.abs(t) >= 2 ? 'forte' : Math.abs(t) >= 1.3 ? 'moderado' : 'fraco' }; });
  const prever = m => { const x = [1].concat(F.map(f => f.alvo(m))); const lp = x.reduce((s, v, j) => s + v * fit.beta[j], 0); return { m2: Math.exp(lp) * fit.smear, lo: Math.exp(lp - 1.2816 * fit.sigma) * fit.smear, hi: Math.exp(lp + 1.2816 * fit.sigma) * fit.smear }; };
  const mix = (alvo.mix || []).filter(m => m.area > 0).map(m => ({ ...m, ...prever(m), dif: m.preco > 0 ? m.preco / prever(m).m2 - 1 : null }));
  const unT = mix.reduce((a, m) => a + (m.un || 1) * m.area, 0) || 1;
  const prod = mix.length ? { m2: mix.reduce((a, m) => a + m.m2 * (m.un || 1) * m.area, 0) / unT, lo: mix.reduce((a, m) => a + m.lo * (m.un || 1) * m.area, 0) / unT, hi: mix.reduce((a, m) => a + m.hi * (m.un || 1) * m.area, 0) / unT } : null;
  return { r2: fit.r2, r2aj: fit.r2aj, n: fit.n, erro: Math.exp(fit.sigma) - 1, coefs, refBairro: refB, alvoBairro: feats.alvoB || null, mix, prod, confiavel: fit.r2aj >= 0.35 && fit.n >= 15 };
}

function comparaveis(V, alvo) {
  const mix = (alvo.mix || []).filter(m => m.area > 0); if (!mix.length) return null;
  const pesoT = mix.reduce((a, m) => a + (m.un || 1), 0) || 1;
  const area = Math.exp(mix.reduce((a, m) => a + Math.log(m.area) * (m.un || 1), 0) / pesoT);
  const ds = mix.map(m => dormsDe(m.tipo)).filter(ok), dorms = ds.length ? mediana(ds) : null, pad = padOrd(alvo.padrao);
  const score = r => {
    let d = (Math.log(r.area || area) - Math.log(area)) ** 2 / 0.06 + (r.area ? 0 : 1);
    if (dorms != null) d += r.dorms == null ? 0.5 : (r.dorms - dorms) ** 2;
    if (pad != null) d += r.pad == null ? 0.5 : (r.pad - pad) ** 2;
    if (r.dist != null) d += (r.dist / 2) ** 2; else if (alvo.bairro && r.bairro) d += norm(r.bairro) === norm(alvo.bairro) ? 0 : 1;
    if (r.data) d += Math.max(0, (Date.now() - r.data) / (365.25 * 864e5) - 1) * 0.5;
    return d;
  };
  const l = V.map(r => ({ r, d: score(r) })).sort((a, b) => a.d - b.d).slice(0, Math.min(12, Math.max(5, Math.round(V.length * 0.15))));
  if (l.length < 3) return null;
  const vs = l.map(x => x.r.vso).filter(ok);
  return { area, dorms, pad, lista: l.map(x => ({ ...x.r, sim: 1 / (1 + x.d) })), m2: mediana(l.map(x => x.r.m2)), p25: quantil(ordenar(l.map(x => x.r.m2)), 0.25), p75: quantil(ordenar(l.map(x => x.r.m2)), 0.75), vso: vs.length >= 3 ? mediana(vs) : null };
}

function sugerir(P, alvo) {
  const M = P.modelo, C = P.comps; let m2 = null, lo = null, hi = null, fonte = '';
  if (M?.prod && M.confiavel && C) { m2 = M.prod.m2 * 0.6 + C.m2 * 0.4; lo = Math.min(M.prod.lo, C.p25); hi = Math.max(M.prod.hi, C.p75); fonte = 'modelo de preço (60%) + comparáveis (40%)'; }
  else if (M?.prod && M.confiavel) { ({ m2, lo, hi } = M.prod); fonte = 'modelo de preço'; }
  else if (C) { m2 = C.m2; lo = C.p25; hi = C.p75; fonte = C.lista.length + ' comparáveis mais parecidos'; }
  else if (P.est?.m2?.n) { m2 = P.est.m2.med; lo = P.est.m2.p25; hi = P.est.m2.p75; fonte = 'mediana da base'; }
  const vso = C?.vso ?? (P.est?.vso?.n >= 3 ? P.est.vso.med : null);
  return m2 ? { m2, lo, hi, fonte, dif: alvo.precoM2 > 0 ? alvo.precoM2 / m2 - 1 : null, vso, difVso: vso && alvo.vso ? alvo.vso / vso - 1 : null, vsoFonte: C?.vso != null ? 'comparáveis' : 'mediana da base' } : null;
}

function insights(P, alvo, macro) {
  const I = [], add = (k, t, v) => I.push({ k, t, v }), E = P.est;
  add('na', 'Base com ' + num(P.n) + ' registros válidos' + (P.nEmp ? ' de ' + num(P.nEmp) + ' empreendimentos' : '') + (P.nOut ? '; ' + P.nOut + ' fora do padrão de preço foram separados' : '') + (P.nInval ? '; ' + P.nInval + ' sem preço por m² utilizável' : '') + '.', num(P.n));
  add('na', 'Preço mediano de ' + mil(E.m2.med) + '/m², com metade da base entre ' + mil(E.m2.p25) + ' e ' + mil(E.m2.p75) + ' (dispersão de ' + pct(E.m2.dp / E.m2.media, 0) + ').', mil(E.m2.med));
  const S = P.sugestao;
  if (S && alvo.precoM2 > 0) { const d = S.dif; add(Math.abs(d) <= 0.05 ? 'ok' : Math.abs(d) <= 0.12 ? 'at' : 'cr', 'Preço do estudo (' + mil(alvo.precoM2) + '/m²) está ' + pct(Math.abs(d)) + (d >= 0 ? ' acima' : ' abaixo') + ' do preço indicado pela base (' + mil(S.m2) + '/m², por ' + S.fonte + ').', (d >= 0 ? '+' : '−') + pct(Math.abs(d))); }
  if (P.posicao?.m2 != null) add(P.posicao.m2 >= 0.85 ? 'cr' : P.posicao.m2 >= 0.7 ? 'at' : 'ok', 'O R$/m² do estudo fica no percentil ' + Math.round(P.posicao.m2 * 100) + ' da base' + (P.posicao.ticket != null ? ' e o ticket no percentil ' + Math.round(P.posicao.ticket * 100) : '') + '.', 'P' + Math.round(P.posicao.m2 * 100));
  if (P.curva && Math.abs(P.curva.b / (P.curva.se || 1)) >= 2) add('na', P.curva.b < 0 ? 'Efeito escala: unidades 10% maiores têm R$/m² ' + pct(1 - Math.pow(1.1, P.curva.b)) + ' menor. Plantas compactas cobram mais por m².' : 'Unidades maiores têm R$/m² mais alto (' + pct(Math.pow(1.1, P.curva.b) - 1) + ' a cada +10% de área): produto maior é o segmento premium da região.', 'b = ' + num(P.curva.b, 2));
  const Mo = P.modelo;
  if (Mo) {
    add(Mo.confiavel ? 'ok' : 'at', 'O modelo de preço explica ' + pct(Mo.r2aj, 0) + ' da variação do R$/m² (' + Mo.n + ' registros, erro típico de ' + pct(Mo.erro, 0) + ')' + (Mo.confiavel ? '.' : '; use como referência, não como preço.'), 'R² ' + pct(Mo.r2aj, 0));
    Mo.coefs.filter(c => !c.bairro && c.k !== 'lnArea' && c.sig !== 'fraco').forEach(c => add('na', c.l + ': ' + (c.efeito >= 0 ? '+' : '−') + pct(Math.abs(c.efeito)) + ' no R$/m², mantidos os demais atributos.', (c.efeito >= 0 ? '+' : '−') + pct(Math.abs(c.efeito))));
    const bs = Mo.coefs.filter(c => c.bairro && c.sig !== 'fraco').sort((a, b) => b.efeito - a.efeito);
    if (bs.length) add('na', 'Bairro mais valorizado: ' + bs[0].l + ' (' + (bs[0].efeito >= 0 ? '+' : '−') + pct(Math.abs(bs[0].efeito)) + ' sobre ' + Mo.refBairro + ')' + (bs.length > 1 && bs.at(-1).efeito < 0 ? '; mais barato: ' + bs.at(-1).l + ' (−' + pct(Math.abs(bs.at(-1).efeito)) + ')' : '') + '.', bs[0].l);
  }
  const T = P.tend;
  if (T?.ano) { const g = T.ano.g, sig = Math.abs(T.ano.t) >= 2; add(!sig ? 'na' : T.ano.real != null && T.ano.real < 0 ? 'at' : g < 0 ? 'cr' : 'ok', (sig ? 'Preços ' + (g >= 0 ? 'sobem ' : 'caem ') + pct(Math.abs(g)) + ' ao ano na base' : 'Sem tendência clara de preço no período (' + (g >= 0 ? '+' : '−') + pct(Math.abs(g)) + ' a.a., estatisticamente fraco)') + (T.ano.real != null && sig ? ', ' + (T.ano.real >= 0 ? pct(T.ano.real) + ' acima' : pct(-T.ano.real) + ' abaixo') + ' da inflação (IPCA)' : '') + (T.ano.vsIncc != null && sig ? (T.ano.vsIncc >= 0 ? '; supera o INCC, a margem tende a melhorar' : '; abaixo do INCC, o custo sobe mais que o preço') : '') + '.', (g >= 0 ? '+' : '−') + pct(Math.abs(g)) + ' a.a.'); }
  if (P.vsoPreco?.vBarato != null && P.vsoPreco?.vCaro != null) { const d = P.vsoPreco.vBarato - P.vsoPreco.vCaro; add(Math.abs(d) < 0.3 ? 'na' : 'at', Math.abs(d) < 0.3 ? 'Preço acima da média do bairro não reduz a VSO de forma relevante: o mercado absorve diferenciação.' : 'Quem cobra acima da mediana do bairro vende ' + num(P.vsoPreco.vCaro, 1) + '% a.m.; quem cobra abaixo, ' + num(P.vsoPreco.vBarato, 1) + '% a.m.' + (d > 0 ? ' Preço é sensível à velocidade.' : ''), num(P.vsoPreco.vBarato, 1) + ' × ' + num(P.vsoPreco.vCaro, 1)); }
  const tk = (P.grupos.ticket || []).filter(g => g.vso != null);
  if (tk.length >= 3) { const best = tk.slice().sort((a, b) => b.vso - a.vso)[0]; const noss = alvo.ticket > 0 ? P.grupos.ticket.find(g => alvo.ticket >= g.de && alvo.ticket <= g.ate) : null; add(noss ? (noss === best ? 'ok' : 'at') : 'na', 'Faixa de ticket mais líquida: ' + best.k + ' (VSO ' + num(best.vso, 1) + '% a.m.)' + (noss && noss !== best ? '; o ticket do estudo está na faixa ' + noss.k + ' (VSO ' + num(noss.vso, 1) + '%).' : noss ? '; o estudo está nessa faixa.' : '.'), num(best.vso, 1) + '%'); }
  const dg = P.grupos.dorms.filter(g => g.vso != null && g.n >= 3);
  if (dg.length >= 2 && E.vso.n) { const totE = dg.reduce((a, g) => a + g.estoque, 0) || dg.reduce((a, g) => a + g.n, 0); const op = dg.map(g => ({ ...g, share: (totE ? (g.estoque || g.n) / totE : 0) })).filter(g => g.vso > E.vso.med * 1.1 && g.share < 1 / dg.length).sort((a, b) => b.vso - a.vso)[0]; if (op) add('ok', 'Oportunidade: ' + op.k + ' vende ' + num(op.vso, 1) + '% a.m. (acima da mediana de ' + num(E.vso.med, 1) + '%) e tem só ' + pct(op.share, 0) + ' da oferta.', op.k); }
  if (S?.vso && alvo.vso > 0) { const d = S.difVso; add(d <= 0.05 ? 'ok' : d <= 0.25 ? 'at' : 'cr', 'VSO adotada de ' + num(alvo.vso, 1) + '% a.m. ' + (d <= 0 ? 'está no nível ou abaixo' : 'está ' + pct(d, 0) + ' acima') + ' da VSO dos ' + S.vsoFonte + ' (' + num(S.vso, 1) + '% a.m.).', num(S.vso, 1) + '%'); }
  if (P.espacial?.gradKm != null && Math.abs(P.espacial.t) >= 2) add('na', 'Cada km de distância do terreno ' + (P.espacial.gradKm < 0 ? 'reduz' : 'aumenta') + ' o R$/m² em ' + pct(Math.abs(P.espacial.gradKm)) + (P.espacial.m2Perto ? '; num raio de 1,5 km a mediana é ' + mil(P.espacial.m2Perto) + '/m² (' + P.espacial.nPerto + ' registros)' : '') + '.', pct(P.espacial.gradKm));
  const TAM = ['area', 'preco', 'dorms', 'vagas'], top = P.corr?.pares.find(p => !(TAM.includes(p.ka) && TAM.includes(p.kb)) && !(p.ka === 'm2' && p.kb === 'preco'));
  if (top) add('na', 'Correlação ' + (Math.abs(top.r) >= 0.6 ? 'forte' : 'moderada') + ' ' + (top.r > 0 ? 'positiva' : 'negativa') + ' entre ' + top.a + ' e ' + top.b + ' (r = ' + num(top.r, 2) + ', ' + top.n + ' registros).', 'r ' + num(top.r, 2));
  const faltas = [['data', 'datas (sem tendência no tempo)'], ['vso', 'VSO ou vendidas/total (sem análise de velocidade)'], ['bairro', 'bairro (sem efeito de localização)'], ['lat', 'coordenadas (sem análise espacial)']].filter(([k]) => P.cobertura[k] < 0.3).map(x => x[1]);
  if (faltas.length) add('na', 'Para mais padrões, inclua na planilha: ' + faltas.join(', ') + '.', '');
  return I;
}

// Produto do estudo no formato do motor de padrões
function alvoDoEstudo(st, M, real) {
  const PR = M.PR, D = M.D, g = (real || {}).geo;
  return { nome: PR.nome, mix: PR.mix.map((m, idx) => ({ idx, tipo: m.tipo, un: m.un, area: m.area, preco: m.preco })), padrao: PR.padrao, vagasUn: D.un ? PR.vagas / D.unT : null, precoM2: D.preco, ticket: M.R.ticket, vso: PR.vso, lat: g?.lat, lon: g?.lon, bairro: g?.bairro || '' };
}
const padroesDoEstudo = (st, M, real) => st.bases && st.bases.some(b => b.ativa !== false) ? analisarPadroes(st.bases, alvoDoEstudo(st, M, real), st.basesFiltro, (real || {}).macro) : null;

// Agrupa os registros por empreendimento no formato da tabela de concorrência (mais parecidos com o produto primeiro).
function concorrentesDaBase(P, max = 12) {
  const V = P.recs, chave = r => norm(r.nome) || 'reg-' + r.base + '-' + r.i, G = {};
  V.forEach(r => { (G[chave(r)] = G[chave(r)] || []).push(r); });
  const sim = new Map((P.comps?.lista || []).map(r => [chave(r), r.sim]));
  return Object.values(G).map(l => {
    const tipos = [...new Set(l.map(r => r.tipo || (r.dorms != null ? (r.dorms ? r.dorms + ' dorm.' : 'studio') : '')).filter(Boolean))];
    const est = l.reduce((a, r) => a + (r.estoque || 0), 0), vs = l.map(r => r.vso).filter(ok);
    return { nome: l[0].nome || (l[0].bairro ? 'Registro · ' + l[0].bairro : 'Registro ' + (l[0].i + 1)), tipo: tipos.slice(0, 2).join(' / '), padrao: l[0].padrao || (l[0].pad ? PAD_TXT[l[0].pad] : ''), m2: Math.round(mediana(l.map(r => r.m2))), ticket: Math.round((mediana(l.map(r => r.preco)) || 0) / 1000), vso: vs.length ? Math.round(mediana(vs) * 10) / 10 : 0, estoque: est || (l.length > 1 ? l.length : 0), _s: Math.max(0, ...l.map(r => sim.get(chave(r)) || 0)), _d: Math.min(...l.map(r => r.dist ?? 99)) };
  }).sort((a, b) => b._s - a._s || a._d - b._d || b.estoque - a.estoque).slice(0, max).map(({ _s, _d, ...c }) => ({ id: uid(), ...c }));
}

// Resumo compacto para o assistente de IA
function resumoPadroesIA(P) {
  if (!P || P.n < 3) return null;
  const g = l => (l || []).slice(0, 8).map(x => x.k + ': ' + x.n + ' reg., ' + mil(x.m2) + '/m²' + (x.vso != null ? ', VSO ' + num(x.vso, 1) + '%' : ''));
  return {
    registros: P.n, empreendimentos: P.nEmp, foraDoPadrao: P.nOut,
    precoM2: { mediana: Math.round(P.est.m2.med), p25: Math.round(P.est.m2.p25), p75: Math.round(P.est.m2.p75) }, ticketMediano: P.est.preco.n ? mil(P.est.preco.med) : null, vsoMediana: P.est.vso.n ? num(P.est.vso.med, 1) : null,
    porBairro: g(P.grupos.bairro), porTipologia: g(P.grupos.dorms), porPadrao: g(P.grupos.padrao), porFaixaDeTicket: g(P.grupos.ticket),
    tendencia: P.tend?.ano ? { variacaoAnual: pct(P.tend.ano.g), significativa: Math.abs(P.tend.ano.t) >= 2, real: P.tend.ano.real != null ? pct(P.tend.ano.real) : null } : null,
    modeloDePreco: P.modelo ? { r2: pct(P.modelo.r2aj, 0), registros: P.modelo.n, confiavel: P.modelo.confiavel, efeitos: P.modelo.coefs.map(c => c.l + ': ' + (c.efeito >= 0 ? '+' : '−') + pct(Math.abs(c.efeito)) + ' (' + c.sig + ')'), bairroReferencia: P.modelo.refBairro, precoPrevistoPorTipologia: P.modelo.mix.map(m => m.tipo + ' ' + num(m.area) + ' m²: ' + mil(m.m2) + '/m² (' + mil(m.lo) + ' a ' + mil(m.hi) + ')') } : null,
    comparaveis: P.comps ? P.comps.lista.slice(0, 8).map(r => [r.nome, r.bairro, r.tipo, r.area && num(r.area) + ' m²', mil(r.m2) + '/m²', r.vso != null && num(r.vso, 1) + '% VSO'].filter(Boolean).join(' · ')) : null,
    sugestao: P.sugestao ? { precoM2: Math.round(P.sugestao.m2), faixa: mil(P.sugestao.lo) + ' a ' + mil(P.sugestao.hi), fonte: P.sugestao.fonte, vso: P.sugestao.vso && num(P.sugestao.vso, 1) } : null,
    padroesEncontrados: P.insights.map(i => i.t)
  };
}

/* ============================ exportação e modelo ============================ */
function exportarPadroes(P, nomeEstudo) {
  const X = window.XLSX; if (!X) throw new Error('Biblioteca de planilha não carregou.');
  const wb = X.utils.book_new(), add = (n, aoa, w) => { const ws = X.utils.aoa_to_sheet(aoa); ws['!cols'] = (w || aoa[0].map(() => 16)).map(x => ({ wch: x })); X.utils.book_append_sheet(wb, ws, n.slice(0, 31)); };
  const r0 = v => ok(v) ? Math.round(v) : '', r1 = v => ok(v) ? Math.round(v * 10) / 10 : '';
  add('Padrões', [['Padrão encontrado', 'Indicador']].concat(P.insights.map(i => [i.t, i.v || ''])), [110, 18]);
  if (P.sugestao) add('Sugestão', [['Item', 'Valor'], ['Preço sugerido (R$/m²)', r0(P.sugestao.m2)], ['Faixa inferior', r0(P.sugestao.lo)], ['Faixa superior', r0(P.sugestao.hi)], ['Fonte', P.sugestao.fonte], ['VSO sugerida (% a.m.)', r1(P.sugestao.vso)]].concat((P.modelo?.mix || []).map(m => ['Modelo · ' + m.tipo + ' (' + num(m.area) + ' m²)', r0(m.m2)])), [44, 22]);
  add('Dados tratados', [['Empreendimento', 'Bairro', 'Cidade', 'Incorporadora', 'Tipologia', 'Dormitórios', 'Vagas', 'Padrão', 'Área (m²)', 'Preço (R$)', 'R$/m²', 'Data', 'VSO (% a.m.)', 'Estoque', 'Distância (km)', 'Fora do padrão', 'Campos calculados']]
    .concat(P.todos.map(r => [r.nome, r.bairro, r.cidade, r.incorp, r.tipo, r.dorms ?? '', r.vagas ?? '', r.pad ? PAD_TXT[r.pad] : r.padrao, r1(r.area), r0(r.preco), r0(r.m2), r.data ? isoDia(r.data) : '', r1(r.vso), r.estoque ?? '', r.dist != null ? Math.round(r.dist * 100) / 100 : '', !r.ok ? 'sem R$/m²' : r.out ? 'sim' : '', r.der.join(', ')])));
  const grp = (n, l) => l && l.length && add(n, [['Grupo', 'Registros', 'R$/m² mediano', 'Área mediana', 'Ticket mediano', 'VSO mediana', 'Estoque']].concat(l.map(g => [g.k, g.n, r0(g.m2), r1(g.area), r0(g.ticket), r1(g.vso), g.estoque || ''])), [28, 11, 15, 13, 15, 13, 10]);
  grp('Por bairro', P.grupos.bairro); grp('Por tipologia', P.grupos.dorms); grp('Por padrão', P.grupos.padrao); grp('Por faixa de ticket', P.grupos.ticket); grp('Por incorporadora', P.grupos.incorp);
  if (P.tend) add('Tendência', [['Período', 'Registros', 'R$/m² mediano', 'VSO mediana']].concat(P.tend.serie.map(s => [s.rot, s.n, r0(s.m2), r1(s.vso)])));
  if (P.modelo) add('Modelo de preço', [['Atributo', 'Efeito no R$/m²', 'Coeficiente', 'Estatística t', 'Confiança'], ['R² ajustado', pct(P.modelo.r2aj, 1), '', '', ''], ['Registros', P.modelo.n, '', '', ''], ['Bairro de referência', P.modelo.refBairro || '—', '', '', '']].concat(P.modelo.coefs.map(c => [c.l, pct(c.efeito, 1), Math.round(c.b * 1e4) / 1e4, Math.round(c.t * 100) / 100, c.sig])), [36, 16, 13, 13, 12]);
  if (P.comps) add('Comparáveis', [['Empreendimento', 'Bairro', 'Tipologia', 'Área', 'R$/m²', 'VSO', 'Distância (km)', 'Similaridade']].concat(P.comps.lista.map(r => [r.nome, r.bairro, r.tipo, r1(r.area), r0(r.m2), r1(r.vso), r.dist != null ? Math.round(r.dist * 100) / 100 : '', Math.round(r.sim * 100) + '%'])));
  X.writeFile(wb, 'PREDIC - padrões de mercado - ' + String(nomeEstudo || 'estudo').replace(/[\\/:*?"<>|]+/g, '-').slice(0, 60) + '.xlsx');
}
const MODELO_COLS = ['Empreendimento', 'Bairro', 'Cidade', 'Incorporadora', 'Tipologia', 'Dormitórios', 'Vagas', 'Padrão', 'Área privativa (m²)', 'Preço (R$)', 'R$/m²', 'Data de lançamento', 'Unidades totais', 'Unidades vendidas', 'Estoque', 'VSO (% a.m.)', 'Latitude', 'Longitude'];
function baixarModeloBase() {
  const X = window.XLSX; if (!X) throw new Error('Biblioteca de planilha não carregou.');
  const wb = X.utils.book_new();
  const lm = X.utils.aoa_to_sheet([['PREDIC · modelo de base de mercado'], [''], ['Uma linha por unidade, tipologia ou empreendimento pesquisado. Nenhuma coluna é obrigatória, mas cada uma libera um padrão:'], ['• Preço + Área (ou R$/m²): distribuição de preço, efeito escala, comparáveis e preço sugerido.'], ['• Bairro: efeito da localização no preço.  • Dormitórios, Vagas, Padrão: quanto cada atributo agrega.'], ['• Data: tendência de preço no tempo, comparada ao IPCA e ao INCC.'], ['• VSO, ou Unidades totais + vendidas + data de lançamento: velocidade de vendas por faixa de preço e tipologia.'], ['• Latitude e Longitude: gradiente de preço pela distância até o terreno.'], [''], ['Os títulos podem ter outros nomes e as colunas podem vir em qualquer ordem: o PREDIC reconhece sozinho e você ajusta o mapeamento depois.'], ['Pode importar várias planilhas (pesquisas de meses diferentes, por exemplo): elas se somam na mesma análise.']]);
  lm['!cols'] = [{ wch: 120 }]; X.utils.book_append_sheet(wb, lm, 'Leia-me');
  const ws = X.utils.aoa_to_sheet([MODELO_COLS, ['Residencial Exemplo', 'Marco', 'Belém', 'Construtora X', '2 dorm. suíte', 2, 1, 'médio', 68, 612000, '', '2025-03-01', 120, 54, 66, '', -1.4312, -48.4569], ['Residencial Exemplo', 'Marco', 'Belém', 'Construtora X', '3 dorm.', 3, 2, 'médio', 92, 805000, '', '2025-03-01', 60, 31, 29, '', -1.4312, -48.4569], ['Torre Norte', 'Umarizal', 'Belém', 'Incorporadora Y', '3 dorm. suíte', 3, 2, 'alto', 118, '', 12400, '2024-11-01', '', '', 40, 2.8, '', '']]);
  ws['!cols'] = MODELO_COLS.map(c => ({ wch: Math.max(11, c.length + 2) })); X.utils.book_append_sheet(wb, ws, 'Base de mercado');
  X.writeFile(wb, 'PREDIC - modelo de base de mercado.xlsx');
}
// Base sintética (determinística) coerente com o estudo de exemplo, para conhecer os recursos.
function baseExemplo(lat = -1.371, lon = -48.444) {
  let s = 7; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; }, gauss = () => { let u = 0; for (let i = 0; i < 6; i++) u += rnd(); return u - 3; };
  const bairros = [['Parque Verde', 1.0, 0.012, -0.004], ['Marambaia', 0.93, -0.018, 0.010], ['Coqueiro', 0.88, 0.030, 0.022], ['Castanheira', 1.05, -0.028, -0.020], ['Val-de-Cans', 0.97, -0.010, -0.032], ['Mangueirão', 0.91, 0.022, -0.014]];
  const incs = ['Construtora Norte', 'Vertical Incorporações', 'Grupo Amazônia', 'Habitar', 'Lumen Empreendimentos'], nomes = ['Vista', 'Jardins', 'Reserva', 'Mirante', 'Parque', 'Solar', 'Terrazzo', 'Bosque', 'Praça', 'Alto'], sufs = ['Montenegro', 'Augusto', 'do Lago', 'Verde', 'Imperial', 'das Palmeiras', 'Prime', 'Club'];
  const pads = [['econômico', 0.78], ['médio', 1.0], ['médio-alto', 1.11], ['alto', 1.26]], hoje = new Date(), rows = [];
  for (let e = 0; e < 34; e++) {
    const b = bairros[Math.floor(rnd() * bairros.length)], pd = pads[Math.min(3, Math.floor(rnd() * 4.3))], meses = Math.floor(rnd() * 34) + 2;
    const lanc = new Date(Date.UTC(hoje.getFullYear(), hoje.getMonth() - meses, 1)), nome = nomes[Math.floor(rnd() * nomes.length)] + ' ' + sufs[Math.floor(rnd() * sufs.length)];
    const la = lat + b[2] + gauss() * 0.004, lo = lon + b[3] + gauss() * 0.004, dk = distKm(lat, lon, la, lo), inc = incs[Math.floor(rnd() * incs.length)];
    const tips = pd[0] === 'econômico' ? [[2, 48], [2, 55]] : pd[0] === 'alto' ? [[3, 112], [4, 148]] : [[2, 68], [3, 92]];
    tips.forEach(([d, a0]) => {
      const area = Math.round(a0 * (1 + gauss() * 0.06)), vagas = d >= 4 ? 3 : d === 3 ? 2 : pd[0] === 'econômico' ? 1 : rnd() > 0.6 ? 2 : 1;
      const m2 = 9300 * b[1] * pd[1] * Math.pow(area / 75, -0.12) * (1 + 0.035 * vagas) * Math.pow(1.065, -meses / 12) * Math.exp(-0.025 * dk) * Math.exp(gauss() * 0.05);
      const total = Math.round(40 + rnd() * 90), vso = Math.max(0.8, 4.6 - (m2 / 9300 - 1) * 9 + gauss() * 0.7 + (d === 3 ? 0.6 : 0)), vend = Math.min(total, Math.round(total * Math.min(0.97, vso / 100 * meses)));
      rows.push([nome, b[0], 'Belém', inc, d + ' dorm.' + (d >= 3 ? ' suíte' : ''), d, vagas, pd[0], area, Math.round(m2 * area / 1000) * 1000, '', isoDia(lanc.getTime()), total, vend, total - vend, '', Math.round(la * 1e5) / 1e5, Math.round(lo * 1e5) / 1e5]);
    });
  }
  rows.push(['Edifício Atípico', 'Marambaia', 'Belém', 'Habitar', '2 dorm.', 2, 1, 'médio', 60, 1980000, '', isoDia(Date.UTC(hoje.getFullYear(), hoje.getMonth() - 5, 1)), 40, 2, 38, '', '', '']);
  return novaBase({ nome: '', cols: MODELO_COLS, rows }, 'Base de exemplo (sintética)');
}
