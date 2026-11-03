'use strict';
/* PREDIC · projeto preliminar: implantação no terreno, volumetria e plantas baixas geradas a partir do produto */
/* Estudo de massa para a viabilidade: dimensões indicativas, não substituem o projeto de arquitetura. */

const PJ = { peTipo: 2.88, peTerreo: 4.5, peSub: 3, atico: 3.2, corredor: 1.6, vagaL: 2.5, vagaC: 5, via: 5.5, recuo: 3, maxSub: 6, viaCasas: 6 };
const IMPL_TIPOS = {
  torre: { l: 'Torre', cor: '#D9D3C7' },
  casa: { l: 'Casa', cor: '#E4D3BC' },
  guarita: { l: 'Guarita / portaria', w: 4, d: 3, h: 3, cor: '#C9C1B5' },
  rampa: { l: 'Rampa da garagem', w: 3.6, d: 18, h: 0.05, cor: '#7C7C82' },
  piscina: { l: 'Piscina', w: 12, d: 6, h: 0.05, cor: '#5AC8FA' },
  quadra: { l: 'Quadra poliesportiva', w: 14, d: 26, h: 0.05, cor: '#7FB77E' },
  salao: { l: 'Salão de festas / gourmet', w: 12, d: 8, h: 3.5, cor: '#E6DFD3' },
  playground: { l: 'Playground', w: 8, d: 8, h: 0.3, cor: '#F2B66D' },
  bloco: { l: 'Outro bloco', w: 10, d: 8, h: 3.5, cor: '#D8D8DC' }
};
const lim = (v, a, b) => Math.max(a, Math.min(b, v));
const m1 = v => Math.round(v * 10) / 10;

/* ============================ geometria 2D (metros, y para o norte) ============================ */
const G2 = {
  area2: p => p.reduce((a, q, i) => { const r = p[(i + 1) % p.length]; return a + q[0] * r[1] - r[0] * q[1]; }, 0) / 2,
  area: p => Math.abs(G2.area2(p)),
  ccw: p => G2.area2(p) < 0 ? p.slice().reverse() : p,
  centro(p) {
    const a = G2.area2(p);
    if (Math.abs(a) < 1e-9) return [p.reduce((s, q) => s + q[0], 0) / p.length, p.reduce((s, q) => s + q[1], 0) / p.length];
    let cx = 0, cy = 0;
    p.forEach((q, i) => { const r = p[(i + 1) % p.length], f = q[0] * r[1] - r[0] * q[1]; cx += (q[0] + r[0]) * f; cy += (q[1] + r[1]) * f; });
    return [cx / (6 * a), cy / (6 * a)];
  },
  dentro(pt, p) {
    let c = false;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const [xi, yi] = p[i], [xj, yj] = p[j]; if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) c = !c; }
    return c;
  },
  rot: (pt, a) => { const c = Math.cos(a), s = Math.sin(a); return [pt[0] * c - pt[1] * s, pt[0] * s + pt[1] * c]; },
  bbox: p => ({ x0: Math.min(...p.map(q => q[0])), y0: Math.min(...p.map(q => q[1])), x1: Math.max(...p.map(q => q[0])), y1: Math.max(...p.map(q => q[1])) }),
  // retângulo girado: {x, y, w, d, rot em graus}; folga expande todos os lados
  ret(it, folga = 0) {
    const a = (it.rot || 0) * Math.PI / 180, hw = it.w / 2 + folga, hd = it.d / 2 + folga;
    return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(q => { const r = G2.rot(q, a); return [r[0] + it.x, r[1] + it.y]; });
  },
  // separação de eixos (polígonos convexos); encostar não conta como sobreposição
  sobrepoe(A, B) {
    for (const P of [A, B]) for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length], nx = a[1] - b[1], ny = b[0] - a[0];
      const pa = A.map(q => q[0] * nx + q[1] * ny), pb = B.map(q => q[0] * nx + q[1] * ny);
      const tol = 1e-6 * Math.hypot(nx, ny);
      if (Math.max(...pa) <= Math.min(...pb) + tol || Math.max(...pb) <= Math.min(...pa) + tol) return false;
    }
    return true;
  },
  contido(r, p) {
    const meios = r.map((q, i) => { const s = r[(i + 1) % r.length]; return [(q[0] + s[0]) / 2, (q[1] + s[1]) / 2]; });
    return r.concat(meios).every(q => G2.dentro(q, p)) && !p.some(v => G2.dentro(v, r));
  },
  // deslocamento para dentro de um polígono anti-horário (recuo)
  inset(p, d) {
    const n = p.length;
    const L = p.map((a, i) => { const b = p[(i + 1) % n], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l * d, ny = dx / l * d; return [[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny]]; });
    return p.map((_, i) => {
      const [p1, p2] = L[(i - 1 + n) % n], [p3, p4] = L[i];
      const den = (p1[0] - p2[0]) * (p3[1] - p4[1]) - (p1[1] - p2[1]) * (p3[0] - p4[0]);
      if (Math.abs(den) < 1e-9) return p3;
      const t = ((p1[0] - p3[0]) * (p3[1] - p4[1]) - (p1[1] - p3[1]) * (p3[0] - p4[0])) / den;
      return [p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1])];
    });
  }
};
// lat/lon <-> metros em torno de uma origem (equiretangular: erro desprezível na escala de um lote)
const GEO = {
  paraM: (o, ll) => [(ll[1] - o[1]) * 111320 * Math.cos(o[0] * Math.PI / 180), (ll[0] - o[0]) * 110574],
  paraLL: (o, m) => [o[0] + m[1] / 110574, o[1] + m[0] / (111320 * Math.cos(o[0] * Math.PI / 180))]
};

/* ============================ unidades e cômodos ============================ */
function programaUnidade(m) {
  const t = norm(m.tipo), a = +m.area || 60;
  const studio = /studio|kitnet|kit |loft/.test(t) || a < 32;
  const n = t.match(/(\d)\s*(d|q|dorm|quart|suite)/);
  const q = studio ? 0 : n ? lim(+n[1], 1, 5) : a < 48 ? 1 : a < 80 ? 2 : a < 120 ? 3 : 4;
  return { q, suite: q >= 1 && (/suite/.test(t) || q >= 3 || a >= 85), varanda: a >= 45 && !/sem varanda/.test(t), studio };
}
// Divide a unidade em cômodos. Coordenadas locais: y = 0 na porta (corredor), y = d na fachada.
function comodos(w, d, u) {
  const R = [], add = (n, x, y, ww, hh, k = 'seco') => { if (ww > 0.2 && hh > 0.2) R.push({ n, x, y, w: ww, h: hh, k }); };
  const vd = u.varanda ? Math.min(1.8, d * 0.18) : 0;
  if (u.q === 0) {
    const bw = Math.min(2.4, w * 0.45), bh = Math.min(2.6, d * 0.35);
    add('Banho', 0, 0, bw, bh, 'molh'); add('Cozinha', bw, 0, w - bw, bh, 'molh');
    add('Estar / dormir', 0, bh, w, d - bh - vd); if (vd) add('Varanda', 0, d - vd, w, vd, 'ext');
    return R;
  }
  let ws = lim(w * (u.q === 1 ? 0.5 : u.q === 2 ? 0.44 : 0.38), 3.2, w);
  if (w - ws < 2.6) ws = w * 0.5;
  const wi = w - ws, dc = lim(d * 0.32, 2.4, 3.4);
  add('Cozinha / serviço', 0, 0, ws, dc, 'molh');
  add(u.q >= 3 ? 'Estar / jantar' : 'Sala', 0, dc, ws, d - dc - vd);
  if (vd) add(u.q >= 3 ? 'Varanda gourmet' : 'Varanda', 0, d - vd, ws, vd, 'ext');
  // ala íntima: dormitórios na fachada; banhos e dormitórios restantes na faixa interna
  const nf = Math.max(1, Math.min(u.q, Math.floor(wi / 2.7)));
  const hf = lim(d * 0.48, 3, 4.4), hc = 1, hb = d - hf - hc;
  const nomeQ = i => u.suite && i === 0 ? 'Suíte' : 'Dorm. ' + (i + 1);
  for (let i = 0; i < nf; i++) add(nomeQ(i), ws + i * wi / nf, d - hf, wi / nf, hf);
  add('Circulação', ws, hb, wi, hc, 'circ');
  const nb = 1 + (u.suite ? 1 : 0) + (u.q >= 4 ? 1 : 0);
  const fila = [];
  for (let i = nf; i < u.q; i++) fila.push([nomeQ(i), 2.8, 'seco']);
  for (let b = 0; b < nb; b++) fila.push([u.suite ? (b === 0 ? 'Banho suíte' : b === 1 ? 'Banho social' : 'Banho ' + (b + 1)) : nb > 1 ? 'Banho ' + (b + 1) : 'Banho', 1.8, 'molh']);
  const k = wi / fila.reduce((a, f) => a + f[1], 0); let x = ws;
  fila.forEach(f => { add(f[0], x, 0, f[1] * k, hb, f[2]); x += f[1] * k; });
  return R;
}
const molhado = n => /banho|cozinha|lavabo|servi/i.test(n);

/* ============================ pavimento-tipo ============================ */
// Planta em corredor central: unidades nas duas fachadas, núcleo (escada, elevadores, shafts) na fileira mais curta.
// Coordenadas da placa: x para a direita, y para baixo, origem no canto superior esquerdo.
function pavimentoTipo(PR) {
  const UA = Math.max(1, Math.round(PR.unAndar || 4)), NP = Math.max(1, Math.round(PR.pavimentos || 1));
  const mix = (PR.mix || []).filter(m => m.un > 0 && m.area > 0), tot = mix.reduce((a, m) => a + m.un, 0) || 1;
  const q = mix.map(m => m.un / tot * UA), c = q.map(Math.floor); let falta = UA - c.reduce((a, b) => a + b, 0);
  q.map((v, i) => [v - c[i], i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (falta > 0) { c[i]++; falta--; } });
  const lista = []; mix.forEach((m, i) => { for (let k = 0; k < c[i]; k++) lista.push(m); });
  while (lista.length < UA) lista.push({ tipo: 'Unidade', area: 60 });
  lista.sort((a, b) => b.area - a.area);
  const amed = lista.reduce((a, m) => a + m.area, 0) / lista.length;
  const ud = m1(lim(Math.sqrt(amed * 1.1), 7, 11)), cw = PJ.corredor;
  const nEl = NP <= 4 ? 0 : NP * UA > 120 || NP > 20 ? 3 : 2;
  const coreW = m1(2.8 + nEl * 2.2 + 1.2);
  // núcleo na fileira de cima; unidades distribuídas para equilibrar as larguras
  const linhas = [[], []], larg = [coreW, 0];
  lista.forEach(m => { const i = larg[0] <= larg[1] ? 0 : 1; linhas[i].push(m); larg[i] += m.area / ud; });
  const W = m1(Math.max(larg[0], larg[1], coreW + 4));
  // cada fileira tem a profundidade que mantém a área exata do mix; abaixo de 6 m sobra área técnica
  const prof = linhas.map((l, i) => { const a = l.reduce((s, m) => s + m.area, 0), livre = W - (i === 0 ? coreW : 0); return a ? m1(Math.max(6, Math.min(ud, a / livre))) : ud; });
  const D = m1(prof[0] + cw + prof[1]);
  const uns = [], fill = []; let nucleo = null, n = 0;
  [0, 1].forEach(i => {
    const h = prof[i], l = linhas[i].map(m => ({ m, w: m.area / h })), livre = W - (i === 0 ? coreW : 0), soma = l.reduce((a, u) => a + u.w, 0);
    if (soma && (soma > livre || livre - soma <= 0.3)) l.forEach(u => { u.w *= livre / soma; });
    else if (livre - soma > 0) l.push({ filler: true, w: livre - soma });
    if (i === 0) l.splice(Math.ceil(l.filter(b => !b.filler).length / 2), 0, { nucleo: true, w: coreW });
    let x = 0; const y0 = i === 0 ? 0 : prof[0] + cw;
    l.forEach((b, j) => {
      if (b.nucleo) nucleo = { x, y: y0, w: b.w, h, partes: partesNucleo(x, y0, b.w, h, nEl, i === 0) };
      else if (b.filler) fill.push({ x, y: y0, w: b.w, h });
      else {
        const u = programaUnidade(b.m), esp = j % 2 === 1;
        const cm = comodos(b.w, h, u).map(r => ({ ...r, x: x + (esp ? b.w - r.x - r.w : r.x), y: i === 0 ? y0 + h - r.y - r.h : y0 + r.y }));
        n++; uns.push({ n: String(n).padStart(2, '0'), tipo: b.m.tipo, areaMix: b.m.area, area: b.w * h, x, y: y0, w: b.w, h, comodos: cm, prog: u, fachadaY: i === 0 ? 0 : D });
      }
      x += b.w;
    });
  });
  return { W, D, ud: prof[0], ud2: prof[1], cw, UA, NP, uns, nucleo, fill, nEl, area: W * D, priv: uns.reduce((a, u) => a + u.area, 0) };
}
function partesNucleo(x, y, w, h, nEl, topo) {
  const P = [], eh = Math.min(2.4, h * 0.4), ey = topo ? y + h - eh : y;
  P.push({ n: 'Escada', x, y, w: 2.8, h, k: 'escada' });
  for (let k = 0; k < nEl; k++) P.push({ n: 'Elev.', x: x + 2.8 + k * 2.2, y: ey, w: 2.2, h: eh, k: 'elev' });
  if (nEl) P.push({ n: 'Hall', x: x + 2.8, y: topo ? y : y + eh, w: nEl * 2.2, h: h - eh, k: 'circ' });
  P.push({ n: 'Shafts', x: x + 2.8 + nEl * 2.2, y, w: w - 2.8 - nEl * 2.2, h, k: 'shaft' });
  return P;
}

/* ============================ casas ============================ */
function casaTipo(PR) {
  const mix = (PR.mix || []).filter(m => m.un > 0 && m.area > 0);
  const m = mix.slice().sort((a, b) => b.un - a.un)[0] || { tipo: 'Casa', area: 90 };
  const u = programaUnidade(m), pav = m.area > 95 ? 2 : 1, fp = m.area / pav * 1.08;
  const w = m1(lim(Math.sqrt(fp * 0.75), 5, 11)), d = m1(fp / w);
  return { m, u, pav, w, d, area: m.area };
}
// Pavimentos da casa: cômodos em coordenadas locais (y = 0 na frente)
function pavimentosCasa(K) {
  const { w, d, u } = K;
  if (K.pav === 1) return [{ nome: 'Casa tipo · térreo', comodos: comodos(w, d, u) }];
  const t = [], s = [], hf = d * 0.55;
  t.push({ n: 'Estar / jantar', x: 0, y: 0, w, h: hf, k: 'seco' });
  t.push({ n: 'Cozinha / serviço', x: 0, y: hf, w: w * 0.55, h: d - hf, k: 'molh' });
  t.push({ n: 'Lavabo', x: w * 0.55, y: hf, w: Math.min(1.5, w * 0.2), h: d - hf, k: 'molh' });
  t.push({ n: 'Escada', x: w * 0.55 + Math.min(1.5, w * 0.2), y: hf, w: w * 0.45 - Math.min(1.5, w * 0.2), h: d - hf, k: 'escada' });
  const q = Math.max(1, u.q), nf = Math.ceil(q / 2), hq = d * 0.42, hc = 1.1, hb = d - hq - hc;
  const nomeQ = i => u.suite && i === 0 ? 'Suíte' : 'Dorm. ' + (i + 1);
  for (let i = 0; i < nf; i++) s.push({ n: nomeQ(i), x: i * w / nf, y: 0, w: w / nf, h: hq, k: 'seco' });
  s.push({ n: 'Circulação', x: 0, y: hq, w, h: hc, k: 'circ' });
  const fila = [];
  for (let i = nf; i < q; i++) fila.push([nomeQ(i), 2.8, 'seco']);
  fila.push([u.suite ? 'Banho suíte' : 'Banho', 1.8, 'molh']); if (u.suite) fila.push(['Banho social', 1.8, 'molh']);
  const k = w / fila.reduce((a, f) => a + f[1], 0); let x = 0;
  fila.forEach(f => { s.push({ n: f[0], x, y: hq + hc, w: f[1] * k, h: hb, k: f[2] }); x += f[1] * k; });
  return [{ nome: 'Casa tipo · térreo', comodos: t }, { nome: 'Casa tipo · superior', comodos: s }];
}

/* ============================ garagem em subsolo ============================ */
// Faixas no eixo y do referencial do lote: [vagas][via][vagas][vagas][via][vagas]..., via de ligação junto à rampa.
function layoutGaragem(loteF, excl, rampa) {
  const bb = G2.bbox(loteF), m = 0.3, V = PJ.vagaL, C = PJ.vagaC, A = PJ.via;
  const xr = rampa ? Math.max(bb.x0 + m, G2.bbox(rampa).x1) : bb.x0 + m;
  const cruz = [[xr, bb.y0], [xr + A, bb.y0], [xr + A, bb.y1], [xr, bb.y1]];
  const faixas = [], vias = []; let y = bb.y0 + m;
  while (y + C + A <= bb.y1 - m + 1e-6) {
    faixas.push({ y, via: y + C });
    vias.push([[bb.x0, y + C], [bb.x1, y + C], [bb.x1, y + C + A], [bb.x0, y + C + A]]);
    if (y + 2 * C + A <= bb.y1 - m + 1e-6) faixas.push({ y: y + C + A, via: y + C });
    y += 2 * C + A;
  }
  const bloq = excl.concat(rampa ? [rampa] : [], [cruz]);
  const vagas = [];
  faixas.forEach(f => {
    for (let x = bb.x0 + m; x + V <= bb.x1 - m + 1e-6; x += V) {
      const r = [[x, f.y], [x + V, f.y], [x + V, f.y + C], [x, f.y + C]];
      if (!r.every(q => G2.dentro(q, loteF)) || loteF.some(v => G2.dentro(v, r))) continue;
      if (bloq.some(b => G2.sobrepoe(r, b))) continue;
      const cv = [x + V / 2, f.via + A / 2];
      if (!G2.dentro(cv, loteF) || excl.some(b => G2.dentro(cv, b))) continue;
      vagas.push({ x, y: f.y, w: V, h: C });
    }
  });
  return { vagas, vias, cruz };
}

/* ============================ implantação automática ============================ */
// Busca em grade, no referencial do lote (frente no eixo x, y para dentro), a posição válida mais próxima do alvo.
function buscarPosicao(it, alvo, loteF, folga, ocupados, gap) {
  const bb = G2.bbox(loteF), passo = lim(Math.min(it.w, it.d) / 5, 0.5, 2);
  let best = null, bd = Infinity;
  for (let x = bb.x0; x <= bb.x1; x += passo) for (let y = bb.y0; y <= bb.y1; y += passo) {
    const dd = (x - alvo[0]) ** 2 + (y - alvo[1]) ** 2; if (dd >= bd) continue;
    const c = { ...it, x, y, rot: 0 };
    if (!G2.contido(G2.ret(c, folga), loteF)) continue;
    const r = G2.ret(c, gap); if (ocupados.some(o => G2.sobrepoe(r, o))) continue;
    best = c; bd = dd;
  }
  return best;
}
function implantacaoAuto({ loteF, Fi, thD, plate, nT, casa, PR, recuo, unT }) {
  const bb = G2.bbox(loteF), out = [], ocup = [];
  const pos = (id, tipo, nome, c, rotF = 0) => { const p = Fi([c.x, c.y]); out.push({ id, tipo, nome, x: p[0], y: p[1], rot: thD + rotF, w: c.w, d: c.d }); ocup.push(G2.ret({ ...c, rot: rotF })); };
  if (casa) {
    // fileiras de casas geminadas pelos fundos, com via interna a cada duas fileiras
    let y = bb.y0 + recuo + PJ.viaCasas, k = 0;
    const vias = [];
    while (k < unT && y < bb.y1) {
      vias.push(y - PJ.viaCasas);
      for (const lado of [0, 1]) {
        const yc = lado === 0 ? y + 5.5 + casa.d / 2 : y + 5.5 + casa.d + 1 + casa.d / 2;
        for (let x = bb.x0 + recuo + casa.w / 2; x + casa.w / 2 <= bb.x1 - recuo && k < unT; x += casa.w + 1.5) {
          const c = { x, y: yc, w: casa.w, d: casa.d };
          if (!G2.contido(G2.ret({ ...c, rot: 0 }, 0.5), loteF)) continue;
          k++; pos('casa-' + k, 'casa', 'Casa ' + k, c, lado === 0 ? 0 : 180);
        }
      }
      y += 5.5 + 2 * casa.d + 1 + 5.5 + PJ.viaCasas;
    }
    return { itens: out, vias };
  }
  const T = { w: plate.W, d: plate.D }, cy = (bb.y0 + bb.y1) / 2 + (bb.y1 - bb.y0) * 0.08;
  const alvos = nT === 2 ? [[-(T.w / 2 + 6), cy], [T.w / 2 + 6, cy]] : [[0, cy]];
  alvos.forEach((a, i) => {
    const c = buscarPosicao(T, a, loteF, recuo, ocup, 4);
    if (c) pos('torre-' + (i + 1), 'torre', 'Torre ' + 'AB'[i], c);
  });
  const extra = (id, tipo, alvo, folga = 0.5, gap = 1.5) => { const d = IMPL_TIPOS[tipo]; const c = buscarPosicao({ w: d.w, d: d.d }, alvo, loteF, folga, ocup, gap); if (c) pos(id, tipo, d.l, c); };
  if (PR.vagas > 0) extra('rampa', 'rampa', [bb.x0, bb.y0], 0.3, 1);
  extra('guarita', 'guarita', [(bb.x0 + bb.x1) / 2, bb.y0], 0.3, 1);
  const lz = (PR.lazer || []).map(norm);
  if (lz.some(x => /piscina/.test(x))) extra('piscina', 'piscina', [0, bb.y1]);
  if (lz.some(x => /festa|gourmet/.test(x))) extra('salao', 'salao', [bb.x1, bb.y1]);
  if (lz.some(x => /quadra/.test(x))) extra('quadra', 'quadra', [bb.x0, bb.y1]);
  if (lz.some(x => /brinque|playground|infantil/.test(x))) extra('playground', 'playground', [bb.x1, (bb.y0 + bb.y1) / 2]);
  return { itens: out, vias: [] };
}

/* ============================ projeto completo ============================ */
function projetoPreliminar(st, PR, geo) {
  const E = st.estudo || {}, I = E.implant || {}, PI = PR.implant || {};
  const origem = I.origem || (geo && ok(geo.lat) && ok(geo.lon) ? [geo.lat, geo.lon] : null);
  const tipoE = norm(PR.tipoEdif), casas = /casas/.test(tipoE), nT = /duas torres/.test(tipoE) ? 2 : 1, misto = /misto/.test(tipoE);
  const DV = derive(PR), NP = Math.max(1, Math.round(PR.pavimentos || 1));
  const plate = casas ? null : pavimentoTipo(PR), casa = casas ? casaTipo(PR) : null;

  // lote: desenhado no mapa ou retângulo estimado pela área do estudo
  let lote, fonte = 'estimado';
  if (origem && Array.isArray(I.lote) && I.lote.length >= 3) { lote = I.lote.map(p => GEO.paraM(origem, p)); fonte = 'mapa'; }
  else { const A = E.area > 0 ? E.area : 2500, w = Math.sqrt(A * 1.4), d = A / w; lote = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]]; }
  lote = G2.ccw(lote);
  const areaLote = G2.area(lote), c = G2.centro(lote);
  const lados = lote.map((a, i) => { const b = lote[(i + 1) % lote.length]; return Math.hypot(b[0] - a[0], b[1] - a[1]); });
  const frente = ok(I.frente) && I.frente < lote.length ? I.frente : lados.indexOf(Math.max(...lados));
  const a0 = lote[frente], b0 = lote[(frente + 1) % lote.length], th = Math.atan2(b0[1] - a0[1], b0[0] - a0[0]), thD = th * 180 / Math.PI;
  // referencial do lote: frente sobre o eixo x, interior para +y
  const F = p => G2.rot([p[0] - c[0], p[1] - c[1]], -th), Fi = q => { const r = G2.rot(q, th); return [r[0] + c[0], r[1] + c[1]]; };
  const loteF = lote.map(F), recuo = ok(I.recuo) ? I.recuo : PJ.recuo;

  const hTorre = PJ.peTerreo + NP * PJ.peTipo;
  const dimensionar = it => {
    const T = IMPL_TIPOS[it.tipo] || IMPL_TIPOS.bloco;
    if (it.tipo === 'torre') return { ...it, w: plate.W, d: plate.D, h: hTorre, pav: NP, folga: recuo };
    if (it.tipo === 'casa') return { ...it, w: casa.w, d: casa.d, h: casa.pav * 3, pav: casa.pav, folga: 0.5 };
    return { ...it, w: +it.w > 0 ? +it.w : T.w, d: +it.d > 0 ? +it.d : T.d, h: ok(it.h) ? it.h : T.h, folga: 0.3 };
  };
  const auto = implantacaoAuto({ loteF, Fi, thD, plate, nT, casa, PR, recuo, unT: DV.unT });
  const manual = !!(PI.manual && Array.isArray(PI.itens) && PI.itens.length);
  const itens = (manual ? PI.itens : auto.itens).filter(it => it.tipo !== 'torre' || plate).map(dimensionar);
  itens.forEach(it => { it.poly = G2.ret(it); it.polyF = it.poly.map(F); it.rotF = (it.rot || 0) - thD; });
  itens.forEach((it, i) => {
    it.fora = !G2.contido(G2.ret(it, it.folga), lote);
    it.colide = itens.some((o, j) => j !== i && G2.sobrepoe(it.poly, o.poly));
  });
  const torres = itens.filter(i => i.tipo === 'torre'), casasIt = itens.filter(i => i.tipo === 'casa');
  // ponto da placa (x para a direita, y para baixo) -> referencial local da torre
  const placaLocal = (it, px, py) => { const r = G2.rot([px - plate.W / 2, plate.D / 2 - py], (it.rot || 0) * Math.PI / 180); return [r[0] + it.x, r[1] + it.y]; };
  const retPlaca = (it, r) => [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]].map(q => placaLocal(it, q[0], q[1])).reverse();
  torres.forEach(t => { t.nucleoPoly = retPlaca(t, plate.nucleo); });

  // subsolos
  let gar = null, nSub = 0, porNivel = 0;
  const vagasMeta = Math.round(PR.vagas || 0);
  if (!casas && vagasMeta > 0) {
    const rampa = itens.find(i => i.tipo === 'rampa');
    gar = layoutGaragem(loteF, torres.map(t => t.nucleoPoly.map(F)), rampa ? rampa.polyF : null);
    porNivel = gar.vagas.length;
    nSub = porNivel ? Math.min(PJ.maxSub, Math.ceil(vagasMeta / porNivel)) : 0;
    const nucleosF = torres.map(t => G2.centro(t.nucleoPoly.map(F)));
    const dist = v => Math.min(...nucleosF.map(n => Math.hypot(v.x + v.w / 2 - n[0], v.y + v.h / 2 - n[1])), 1e9);
    const ord = gar.vagas.map((v, i) => [dist(v), i]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
    const nPne = Math.max(1, Math.ceil(vagasMeta * 0.02)), nIdo = Math.max(1, Math.ceil(vagasMeta * 0.05));
    ord.forEach((i, j) => { gar.vagas[i].esp = j < nPne ? 'pne' : j < nPne + nIdo ? 'idoso' : ''; });
  }
  const vagasOfertadas = casas ? casasIt.length : nSub * porNivel;

  /* ---------- desenhos dos níveis (metros, y para baixo) ---------- */
  const Y = p => [p[0], -p[1]], YP = pts => pts.map(Y);
  const ext = Math.max(G2.bbox(loteF).x1 - G2.bbox(loteF).x0, G2.bbox(loteF).y1 - G2.bbox(loteF).y0);
  const fsS = lim(ext / 70, 0.6, 3);
  const norte = thD; // giro horário da seta de norte na planta (frente do lote embaixo)
  const bbF = G2.bbox(loteF);
  const cotasLote = [{ t: 'cota', a: Y([bbF.x0, bbF.y0]), b: Y([bbF.x1, bbF.y0]), off: fsS * 4, txt: num(bbF.x1 - bbF.x0, 1) + ' m' }, { t: 'cota', a: Y([bbF.x0, bbF.y1]), b: Y([bbF.x0, bbF.y0]), off: fsS * 4, txt: num(bbF.y1 - bbF.y0, 1) + ' m' }];
  const recuoF = G2.inset(loteF, recuo);
  const niveis = [];

  for (let s = nSub; s >= 1; s--) {
    const prims = [{ t: 'clip', pts: YP(loteF) }, { t: 'poly', pts: YP(loteF), c: 'piso' }];
    gar.vias.forEach(v => prims.push({ t: 'poly', pts: YP(v), c: 'via', clip: true }));
    prims.push({ t: 'poly', pts: YP(gar.cruz), c: 'via', clip: true });
    const restantes = vagasMeta - (s - 1) * porNivel;
    gar.vagas.forEach((v, i) => {
      const usada = i < restantes, esp = s === 1 ? v.esp : '';
      prims.push({ t: 'rect', x: v.x, y: -(v.y + v.h), w: v.w, h: v.h, c: !usada ? 'vaga sobra' : esp === 'pne' ? 'vaga pne' : esp === 'idoso' ? 'vaga idoso' : 'vaga', label: esp === 'pne' ? 'PcD' : esp === 'idoso' ? '60+' : String(i + 1), fs: 0.55 });
    });
    const rampa = itens.find(i => i.tipo === 'rampa'); if (rampa) prims.push({ t: 'poly', pts: YP(rampa.polyF), c: 'rampa', label: 'Rampa', fs: fsS * 0.8 });
    torres.forEach(t => prims.push({ t: 'poly', pts: YP(t.nucleoPoly.map(F)), c: 'nucleo', label: 'Núcleo ' + t.nome.replace('Torre ', ''), fs: fsS * 0.7 }));
    prims.push({ t: 'poly', pts: YP(loteF), c: 'contorno' }, ...cotasLote);
    niveis.push({ k: 's' + s, nome: s + 'º subsolo', cota: -s * PJ.peSub, area: areaLote, norte, prims,
      resumo: [['Cota do piso', num(-s * PJ.peSub, 2) + ' m'], ['Vagas neste nível', num(Math.min(porNivel, Math.max(0, restantes)))], ['Capacidade do nível', num(porNivel) + ' vagas'], ['Área do pavimento', num(areaLote) + ' m²']] });
  }

  // térreo / implantação
  {
    const prims = [{ t: 'clip', pts: YP(loteF) }, { t: 'poly', pts: YP(loteF), c: 'verde' }, { t: 'poly', pts: YP(recuoF), c: 'recuo' }];
    auto.vias.forEach(y => prims.push({ t: 'poly', pts: YP([[bbF.x0, y], [bbF.x1, y], [bbF.x1, y + PJ.viaCasas], [bbF.x0, y + PJ.viaCasas]]), c: 'via', clip: true }));
    itens.forEach(it => {
      const cls = 'item t-' + it.tipo + (it.fora || it.colide ? ' erro' : '');
      if (it.tipo === 'casa') {
        const vg = G2.ret({ x: 0, y: -(it.d / 2 + 2.75), w: 2.5, d: 5, rot: 0 }).map(q => { const r = G2.rot(q, it.rotF * Math.PI / 180); return [r[0], r[1]]; });
        const cF = F([it.x, it.y]); prims.push({ t: 'poly', pts: YP(vg.map(q => [q[0] + cF[0], q[1] + cF[1]])), c: 'vaga' });
      }
      if (it.tipo !== 'torre') { prims.push({ t: 'poly', pts: YP(it.polyF), c: cls, label: it.tipo === 'casa' ? it.nome.replace('Casa ', '') : it.nome, fs: it.tipo === 'casa' ? fsS * 0.6 : fsS }); return; }
      // torre: rótulo abaixo do núcleo para não ficar encoberto
      const cF = F([it.x, it.y]);
      prims.push({ t: 'poly', pts: YP(it.polyF), c: cls }, { t: 'poly', pts: YP(it.nucleoPoly.map(F)), c: 'nucleo' },
        { t: 'text', x: cF[0], y: -cF[1] + it.d * 0.3, s: it.nome, fs: fsS * 1.1, c: 'tit' },
        { t: 'text', x: cF[0], y: -cF[1] + it.d * 0.3 + fsS * 1.5, s: (misto ? 'lojas + hall · ' : 'hall + pilotis · ') + num(it.w, 1) + ' × ' + num(it.d, 1) + ' m', fs: fsS * 0.8, c: 'lsub' });
    });
    prims.push({ t: 'poly', pts: YP(loteF), c: 'contorno' });
    const fa = Y([(loteF[frente][0] + loteF[(frente + 1) % loteF.length][0]) / 2, (loteF[frente][1] + loteF[(frente + 1) % loteF.length][1]) / 2]);
    prims.push({ t: 'text', x: fa[0], y: fa[1] + fsS * 1.4, s: 'FRENTE · ACESSO', fs: fsS * 0.9, c: 'frente' }, ...cotasLote);
    niveis.push({ k: 'terreo', nome: casas ? 'Implantação' : 'Térreo / implantação', cota: 0, area: areaLote, norte, prims,
      resumo: [['Área do lote', num(areaLote) + ' m² (' + (fonte === 'mapa' ? 'desenhado no mapa' : 'estimado') + ')'], ['Recuo indicativo', num(recuo, 1) + ' m'], ['Estruturas', num(itens.length)], ['Projeção edificada', num(itens.filter(i => i.h >= 2.5).reduce((a, i) => a + i.w * i.d, 0)) + ' m²']] });
  }

  if (plate) {
    const P = plate, prims = [{ t: 'rect', x: 0, y: 0, w: P.W, h: P.D, c: 'laje' }, { t: 'rect', x: 0, y: P.ud, w: P.W, h: P.cw, c: 'circ', label: 'Circulação', fs: 0.32 }];
    P.fill.forEach(f => prims.push({ t: 'rect', ...f, c: 'shaft', label: 'Área técnica', fs: 0.32 }));
    P.uns.forEach(u => {
      u.comodos.forEach(r => prims.push({ t: 'rect', x: r.x, y: r.y, w: r.w, h: r.h, c: 'comodo k-' + r.k, label: r.n, sub: num(r.w * r.h, 1) + ' m²', fs: 0.3 }));
      prims.push({ t: 'rect', x: u.x, y: u.y, w: u.w, h: u.h, c: 'unid' });
      prims.push({ t: 'text', x: u.x + u.w / 2, y: u.fachadaY === 0 ? -0.9 : P.D + 1.1, s: 'Apto x' + u.n + ' · ' + u.tipo + ' · ' + num(u.area, 0) + ' m²', fs: 0.36, c: 'tit' });
    });
    P.nucleo.partes.forEach(p => prims.push({ t: 'rect', x: p.x, y: p.y, w: p.w, h: p.h, c: 'nuc k-' + p.k, label: p.n, fs: 0.3 }));
    prims.push({ t: 'cota', a: [0, -2.2], b: [P.W, -2.2], off: 0, txt: num(P.W, 2) + ' m' }, { t: 'cota', a: [-1.2, P.D], b: [-1.2, 0], off: 0, txt: num(P.D, 2) + ' m' });
    P.uns.filter(u => u.fachadaY === P.D).forEach(u => prims.push({ t: 'cota', a: [u.x, P.D + 2.4], b: [u.x + u.w, P.D + 2.4], off: 0, txt: num(u.w, 2) }));
    const pavTxt = NP > 1 ? '1º ao ' + NP + 'º pavimento' : '1º pavimento';
    niveis.push({ k: 'tipo', nome: 'Pavimento-tipo (' + pavTxt + ')', cota: PJ.peTerreo, area: P.area, norte: null, prims,
      resumo: [['Unidades por andar', num(P.UA)], ['Área do pavimento', num(P.area) + ' m²'], ['Privativa no andar', num(P.priv) + ' m²'], ['Eficiência', pct(P.priv / P.area, 0)], ['Elevadores', num(P.nEl)], ['Pé-direito piso a piso', num(PJ.peTipo, 2) + ' m'], ['Torres × pavimentos', num(torres.length) + ' × ' + num(NP)]] });

    const pessoas = P.uns.reduce((a, u) => a + (u.prog.q ? u.prog.q * 2 : 2), 0) * NP;
    const consumo = pessoas * 200 / 1000, sup = consumo * 2 * 0.4 + 15;
    const pc = [{ t: 'rect', x: 0, y: 0, w: P.W, h: P.D, c: 'cob' },
      { t: 'rect', x: P.nucleo.x, y: P.nucleo.y, w: P.nucleo.w, h: P.nucleo.h, c: 'nuc k-maq', label: 'Casa de máquinas', sub: 'reservatório ≈ ' + num(sup, 0) + ' m³', fs: 0.7 },
      { t: 'cota', a: [0, -2.2], b: [P.W, -2.2], off: 0, txt: num(P.W, 2) + ' m' }, { t: 'cota', a: [-1.2, P.D], b: [-1.2, 0], off: 0, txt: num(P.D, 2) + ' m' }];
    niveis.push({ k: 'cob', nome: 'Cobertura / ático', cota: hTorre, area: P.area, norte: null, prims: pc,
      resumo: [['Cota da cobertura', num(hTorre, 2) + ' m'], ['Altura com ático', num(hTorre + PJ.atico, 1) + ' m'], ['População estimada por torre', num(pessoas) + ' pessoas'], ['Consumo de água', num(consumo, 0) + ' m³/dia (200 L/pessoa)'], ['Reservatório superior', '≈ ' + num(sup, 0) + ' m³ (40% de 2 dias + reserva de incêndio)'], ['Reservatório inferior', '≈ ' + num(consumo * 2 * 0.6, 0) + ' m³']] });
  }

  if (casa) pavimentosCasa(casa).forEach((pv, i) => {
    const prims = [{ t: 'rect', x: 0, y: 0, w: casa.w, h: casa.d, c: 'laje' }];
    pv.comodos.forEach(r => prims.push({ t: 'rect', x: r.x, y: casa.d - r.y - r.h, w: r.w, h: r.h, c: 'comodo k-' + r.k, label: r.n, sub: num(r.w * r.h, 1) + ' m²', fs: 0.3 }));
    if (i === 0) prims.push({ t: 'rect', x: 0.3, y: casa.d, w: 2.5, h: 5, c: 'vaga', label: 'Vaga', fs: 0.35 });
    prims.push({ t: 'rect', x: 0, y: 0, w: casa.w, h: casa.d, c: 'unid' }, { t: 'cota', a: [0, -1.4], b: [casa.w, -1.4], off: 0, txt: num(casa.w, 2) + ' m' }, { t: 'cota', a: [-1.2, casa.d], b: [-1.2, 0], off: 0, txt: num(casa.d, 2) + ' m' });
    niveis.push({ k: 'casa' + i, nome: pv.nome, cota: i * 3, area: casa.w * casa.d, norte: null, prims,
      resumo: [['Tipologia', casa.m.tipo + ' · ' + num(casa.area) + ' m²'], ['Pavimentos', num(casa.pav)], ['Projeção', num(casa.w, 1) + ' × ' + num(casa.d, 1) + ' m'], ['Casas implantadas', num(casasIt.length) + ' de ' + num(DV.unT)]] });
  });

  /* ---------- indicadores e conferências ---------- */
  const projEdif = itens.filter(i => i.h >= 2.5).reduce((a, i) => a + i.w * i.d, 0);
  const areaLegal = E.area > 0 ? E.area : areaLote;
  const to = projEdif / (areaLegal || 1);
  const computavel = casas ? casasIt.length * casa.w * casa.d * casa.pav : torres.length * NP * plate.area;
  const pot = (E.ca || 0) * areaLegal;
  const altura = casas ? casa.pav * 3 + 1.5 : hTorre + PJ.atico;
  const unProj = casas ? casasIt.length : torres.length * NP * plate.UA;
  const chk = [];
  const add = (t, v, k) => chk.push({ t, v, k });
  add('Taxa de ocupação', pct(to, 0) + (E.to ? ' · máx. ' + num(E.to) + '%' : ''), !E.to ? 'na' : to <= E.to / 100 ? 'ok' : 'cr');
  add('Área computável dos pavimentos', num(computavel) + ' m²' + (pot ? ' · potencial ' + num(pot) + ' m²' : ''), !pot ? 'na' : computavel <= pot ? 'ok' : computavel <= pot * 1.1 ? 'at' : 'cr');
  add('Altura estimada', num(altura, 1) + ' m' + (E.gabarito ? ' · gabarito ' + num(E.gabarito) + ' m' : ''), !E.gabarito ? 'na' : altura <= E.gabarito ? 'ok' : 'cr');
  add('Unidades no projeto × mix', num(unProj) + ' × ' + num(DV.unT), unProj === DV.unT ? 'ok' : Math.abs(unProj - DV.unT) <= Math.max(2, DV.unT * 0.05) ? 'at' : 'cr');
  if (!casas) add('Vagas que cabem nos subsolos', num(vagasOfertadas) + ' × ' + num(vagasMeta) + ' previstas' + (nSub ? ' · ' + nSub + ' subsolo(s) de ' + num(porNivel) : ''), !vagasMeta ? 'na' : vagasOfertadas >= vagasMeta ? 'ok' : 'cr');
  if (!casas && torres.length < nT) add('Torres implantadas', num(torres.length) + ' de ' + nT + ': o lote não comporta a projeção com o recuo', 'cr');
  const ruins = itens.filter(i => i.fora || i.colide);
  add('Estruturas dentro do lote e sem sobreposição', ruins.length ? ruins.map(i => i.nome + (i.fora ? ' (fora do lote/recuo)' : ' (sobreposta)')).join(', ') : 'todas ok', ruins.length ? 'cr' : 'ok');
  if (fonte === 'mapa' && E.area > 0) { const dif = areaLote / E.area - 1; add('Área desenhada × área do estudo', num(areaLote) + ' × ' + num(E.area) + ' m² (' + (dif > 0 ? '+' : '') + pct(dif, 1) + ')', Math.abs(dif) <= 0.03 ? 'ok' : Math.abs(dif) <= 0.1 ? 'at' : 'cr'); }
  if (fonte !== 'mapa') add('Terreno', 'retângulo estimado pela área do estudo; desenhe o lote real no mapa', 'na');

  return { origem, fonte, lote, loteF, areaLote, lados, frente, th, thD, F, Fi, recuo, recuoPoly: G2.inset(lote, recuo), casas, nT, misto, NP, plate, casa, itens, manual, vias: auto.vias,
    garagem: gar, nSub, porNivel, vagasMeta, vagasOfertadas, hTorre, altura, to, computavel, pot, unProj, niveis, checks: chk };
}
