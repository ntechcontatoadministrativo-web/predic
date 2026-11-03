'use strict';
/* PREDIC · seção Projeto 3D e implantação: lote e estruturas no mapa, volumetria 3D e plantas baixas */

function Projeto({ ctx }) {
  const { st, M, real, printAll } = ctx; const PR = M.PR, E = st.estudo;
  const P = useMemo(() => projetoPreliminar(st, PR, real.geo), [st.estudo, PR, real.geo]);
  const [aba, setAba] = useState('implantacao');
  const kChk = t => (P.checks.find(c => c.t.startsWith(t)) || {}).k;
  const tk2 = k => ({ ok: 'g', at: 'y', cr: 'r' })[k] || 'n';
  return html`<div className="grid">
    <div className="grid g6">
      <${Kpi} s="TERRENO" v=${num(P.areaLote) + ' m²'} l=${P.fonte === 'mapa' ? 'desenhado no mapa' : 'estimado · desenhe no mapa'} t=${P.fonte === 'mapa' ? 'g' : 'n'} help="" />
      <${Kpi} s="TAXA DE OCUPAÇÃO" v=${pct(P.to, 0)} l=${E.to ? 'máximo ' + num(E.to) + '%' : 'informe a TO em Localização'} t=${tk2(kChk('Taxa'))} help="Projeção das edificações sobre a área do terreno." />
      <${Kpi} s="ÁREA COMPUTÁVEL" v=${num(P.computavel) + ' m²'} l=${P.pot ? 'potencial ' + num(P.pot) + ' m²' : 'informe o CA em Localização'} t=${tk2(kChk('Área computável'))} help="Soma das lajes dos pavimentos-tipo (ou das casas) comparada a área do terreno × CA." />
      <${Kpi} s="ALTURA" v=${num(P.altura, 1) + ' m'} l=${E.gabarito ? 'gabarito ' + num(E.gabarito) + ' m' : P.casas ? 'casas' : num(P.NP) + ' pavimentos + térreo e ático'} t=${tk2(kChk('Altura'))} help="Térreo de 4,5 m, pavimentos de 2,88 m piso a piso e ático de 3,2 m." />
      <${Kpi} s="UNIDADES" v=${num(P.unProj)} l=${'mix do produto: ' + num(M.D.unT)} t=${tk2(kChk('Unidades'))} help="" />
      <${Kpi} s="VAGAS" v=${num(P.vagasOfertadas)} l=${P.casas ? '1 por casa' : P.nSub ? P.nSub + ' subsolo(s) · ' + num(P.porNivel) + '/nível' : 'sem subsolo'} t=${P.casas ? 'n' : tk2(kChk('Vagas'))} help="Vagas de 2,5 × 5,0 m com vias de 5,5 m, 2% PcD e 5% idosos." />
    </div>
    ${printAll ? null : html`<div className="noprint" style=${{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      <${Seg} opts=${[['implantacao', 'Implantação no mapa'], ['3d', 'Modelo 3D'], ['plantas', 'Plantas baixas']]} value=${aba} onChange=${setAba} />
      <span className="sub">Gerado de ${PR.nome}: ${PR.tipoEdif}, ${num(P.NP)} pavimento(s), ${num(PR.unAndar)} un./andar, ${num(PR.vagas)} vagas. Altere em Característica do produto.</span>
    </div>`}
    ${printAll || aba === 'implantacao' ? html`<${ImplantacaoMapa} ctx=${ctx} P=${P} />` : null}
    ${printAll || aba === '3d' ? html`<${Card} title="Modelo 3D do empreendimento" sub="volumetria gerada das especificações · arraste para girar, role para aproximar, Shift + arraste para mover">
      <${Vista3D} P=${P} ctx=${ctx} /><//>` : null}
    ${printAll || aba === 'plantas' ? html`<${Plantas} P=${P} ctx=${ctx} />` : null}
    <${Card} title="Conferências do projeto" sub="estudo de massa · confirme com o projeto de arquitetura e a legislação do município">
      ${P.checks.map((c, i) => html`<div key=${i} className="kv"><span style=${{ display: 'flex', alignItems: 'center', gap: 8 }}><${Pill} k=${c.k}>${{ ok: 'ok', at: 'atenção', cr: 'ajustar', na: 'informar' }[c.k]}<//>${c.t}</span><b style=${{ textAlign: 'right' }}>${c.v}</b></div>`)}
    <//>
  </div>`;
}

/* ============================ implantação no mapa ============================ */
const escH = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
function ImplantacaoMapa({ ctx, P }) {
  const { st, setE, setProd, real, M } = ctx; const E = st.estudo, I = E.implant || {}, PR = M.PR;
  const [modo, setModo] = useState('ver'), [pts, setPts] = useState([]), [sel, setSel] = useState(null), [base, setBase] = useState('sat'), [novoTipo, setNovoTipo] = useState('bloco');
  const ref = useRef(), mp = useRef(), G = useRef({}), centrado = useRef(false);
  const S = useRef(); S.current = { P, I, modo, pts };
  const it = P.itens.find(i => i.id === sel);

  // posições atuais (automáticas ou não) viram a implantação manual do produto
  const salvar = fn => {
    const l = S.current.P.itens.map(i => ({ id: i.id, tipo: i.tipo, nome: i.nome, x: i.x, y: i.y, rot: i.rot, ...(i.tipo !== 'torre' && i.tipo !== 'casa' ? { w: i.w, d: i.d, h: i.h } : {}) }));
    setProd({ implant: { manual: true, itens: fn(l) } });
  };
  const upd = (id, p) => salvar(l => l.map(x => x.id === id ? { ...x, ...p } : x));
  const setI = p => setE({ implant: { ...S.current.I, ...p } });
  const concluir = () => {
    const l = S.current.pts; if (l.length < 3) return;
    const o = I.origem || (real.geo && ok(real.geo.lat) ? [real.geo.lat, real.geo.lon] : [l.reduce((a, p) => a + p[0], 0) / l.length, l.reduce((a, p) => a + p[1], 0) / l.length]);
    setE({ implant: { ...I, lote: l, origem: o, frente: null } }); setPts([]); setModo('ver');
    toast('Terreno desenhado: ' + num(G2.area(l.map(p => GEO.paraM(o, p)))) + ' m². Escolha a frente do lote ao lado.');
  };

  useEffect(() => {
    if (!window.L || mp.current) return;
    const m = mp.current = L.map(ref.current, { scrollWheelZoom: true, doubleClickZoom: false, maxZoom: 21 });
    G.current.osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 21, maxNativeZoom: 19, attribution: '© OpenStreetMap' });
    G.current.sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 21, maxNativeZoom: 19, attribution: 'Imagens © Esri, Maxar, Earthstar Geographics' });
    G.current.lote = L.layerGroup().addTo(m); G.current.itens = L.layerGroup().addTo(m); G.current.tmp = L.layerGroup().addTo(m);
    const o = S.current.P.origem;
    if (o) { m.setView(o, 18); centrado.current = true; } else m.setView([-14.2, -51.9], 4);
    m.on('click', e => { if (S.current.modo === 'desenhar') setPts(p => p.concat([[e.latlng.lat, e.latlng.lng]])); else setSel(null); });
    const t = setTimeout(() => m.invalidateSize(), 80);
    return () => { clearTimeout(t); m.remove(); mp.current = null; };
  }, []);
  useEffect(() => { const m = mp.current; if (!m) return; const g = G.current; [g.osm, g.sat].forEach(l => m.removeLayer(l)); (base === 'sat' ? g.sat : g.osm).addTo(m); }, [base]);
  useEffect(() => { if (P.origem && mp.current && !centrado.current) { mp.current.setView(P.origem, 18); centrado.current = true; } }, [P.origem]);
  useEffect(() => { if (mp.current) mp.current.getContainer().style.cursor = modo === 'desenhar' ? 'crosshair' : ''; }, [modo]);

  // desenho das camadas
  useEffect(() => {
    const m = mp.current, g = G.current; if (!m) return;
    g.lote.clearLayers(); g.itens.clearLayers(); g.tmp.clearLayers();
    if (modo === 'desenhar') {
      if (pts.length) L.polyline(pts.concat(pts.length > 2 ? [pts[0]] : []), { color: '#FFD60A', weight: 2.5, dashArray: '6 5' }).addTo(g.tmp);
      pts.forEach((p, i) => { const c = L.circleMarker(p, { radius: i === 0 ? 8 : 5, color: '#1D1D1F', weight: 2, fillColor: '#FFD60A', fillOpacity: 1 }).addTo(g.tmp); if (i === 0 && pts.length > 2) c.bindTooltip('Clique para fechar o terreno').on('click', ev => { L.DomEvent.stopPropagation(ev); concluir(); }); });
      return;
    }
    const o = P.origem; if (!o) return;
    const LL = q => GEO.paraLL(o, q);
    const loteLL = P.lote.map(LL);
    const pl = L.polygon(loteLL, { color: '#FFD60A', weight: 2.5, fillOpacity: 0.07, dashArray: P.fonte === 'mapa' ? null : '8 6', interactive: false }).addTo(g.lote);
    L.polygon(P.recuoPoly.map(LL), { color: '#FFD60A', weight: 1, dashArray: '3 5', fill: false, interactive: false }).addTo(g.lote);
    L.polyline([loteLL[P.frente], loteLL[(P.frente + 1) % loteLL.length]], { color: '#FF9F0A', weight: 6, opacity: 0.9 }).bindTooltip('Frente do lote').addTo(g.lote);
    if (modo === 'editar' && P.fonte === 'mapa') {
      const vs = I.lote.slice();
      vs.forEach((v, i) => {
        const mk = L.marker(v, { draggable: true, icon: L.divIcon({ className: 'impl-v', iconSize: [14, 14] }) }).addTo(g.lote);
        mk.bindTooltip('Arraste · duplo clique remove');
        mk.on('drag', ev => { const ll = ev.target.getLatLng(); vs[i] = [ll.lat, ll.lng]; pl.setLatLngs(vs); });
        mk.on('dragend', () => setI({ lote: vs.slice() }));
        mk.on('dblclick', ev => { L.DomEvent.stopPropagation(ev); if (vs.length > 3) setI({ lote: vs.filter((_, j) => j !== i), frente: null }); });
      });
      vs.forEach((v, i) => {
        const w = vs[(i + 1) % vs.length], mid = [(v[0] + w[0]) / 2, (v[1] + w[1]) / 2];
        L.marker(mid, { icon: L.divIcon({ className: 'impl-mid', iconSize: [10, 10] }) }).bindTooltip('Inserir vértice').on('click', ev => { L.DomEvent.stopPropagation(ev); const l = vs.slice(); l.splice(i + 1, 0, mid); setI({ lote: l, frente: null }); }).addTo(g.lote);
      });
    }
    P.itens.forEach(x => {
      const T = IMPL_TIPOS[x.tipo] || IMPL_TIPOS.bloco, erro = x.fora || x.colide, on = sel === x.id;
      const pg = L.polygon(x.poly.map(LL), { color: erro ? '#FF3B30' : on ? '#0A84FF' : '#FFFFFF', weight: on || erro ? 3 : 1.5, fillColor: T.cor, fillOpacity: 0.88 }).addTo(g.itens);
      pg.on('click', ev => { L.DomEvent.stopPropagation(ev); setSel(x.id); });
      pg.bindTooltip(x.nome + (x.tipo === 'torre' ? ' · ' + x.pav + ' pav. · ' + num(x.w, 1) + ' × ' + num(x.d, 1) + ' m' : '') + (x.fora ? ' · fora do lote/recuo' : x.colide ? ' · sobreposta' : ''));
      let nuc = null;
      if (x.nucleoPoly) nuc = L.polygon(x.nucleoPoly.map(LL), { color: '#3A3A3C', weight: 1, fillColor: '#8E8E93', fillOpacity: 0.95, interactive: false }).addTo(g.itens);
      const rot = x.tipo === 'casa' ? x.nome.replace('Casa ', '') : x.nome;
      const mk = L.marker(LL([x.x, x.y]), { draggable: modo === 'ver', icon: L.divIcon({ className: 'impl-h' + (on ? ' on' : '') + (erro ? ' erro' : ''), html: '<span>' + escH(rot) + '</span>', iconSize: null }) }).addTo(g.itens);
      mk.on('click', ev => { L.DomEvent.stopPropagation(ev); setSel(x.id); });
      mk.on('dragstart', () => setSel(x.id));
      mk.on('drag', ev => {
        const q = GEO.paraM(o, [ev.latlng.lat, ev.latlng.lng]), dx = q[0] - x.x, dy = q[1] - x.y;
        pg.setLatLngs(x.poly.map(p => LL([p[0] + dx, p[1] + dy]))); if (nuc) nuc.setLatLngs(x.nucleoPoly.map(p => LL([p[0] + dx, p[1] + dy])));
      });
      mk.on('dragend', ev => { const ll = ev.target.getLatLng(), q = GEO.paraM(o, [ll.lat, ll.lng]); upd(x.id, { x: q[0], y: q[1] }); });
    });
  }, [P, modo, pts, sel]);

  const tipos = Object.entries(IMPL_TIPOS).filter(([k]) => k !== 'casa' && (k !== 'torre' || !P.casas));
  const adicionar = () => {
    const c = G2.centro(P.lote), T = IMPL_TIPOS[novoTipo], n = P.itens.filter(i => i.tipo === novoTipo).length + 1, id = novoTipo + '-' + uid();
    salvar(l => l.concat([{ id, tipo: novoTipo, nome: novoTipo === 'torre' ? 'Torre ' + String.fromCharCode(64 + n) : T.l + (n > 1 ? ' ' + n : ''), x: c[0], y: c[1], rot: P.thD, ...(novoTipo !== 'torre' ? { w: T.w, d: T.d, h: T.h } : {}) }]));
    setSel(id);
  };
  const semMapa = !P.origem && modo !== 'desenhar';
  return html`<div className="grid g21">
    <${Card} title="Implantação no terreno" sub=${P.fonte === 'mapa' ? 'terreno desenhado · arraste as estruturas pelos rótulos' : 'terreno estimado pela área do estudo (tracejado) · desenhe o lote real'}
      right=${html`<div className="noprint"><${Seg} opts=${[['sat', 'Satélite'], ['osm', 'Mapa']]} value=${base} onChange=${setBase} /></div>`}>
      <div className="map lg"><div ref=${ref} style=${{ position: 'absolute', inset: 0 }}></div>
        ${semMapa ? html`<div className="ph" style=${{ flexDirection: 'column', gap: 10, padding: 20, textAlign: 'center' }}>Localize o endereço em Localização para centralizar o mapa, ou navegue até o terreno e desenhe o lote.<button className="btn pri sm" onClick=${() => setModo('desenhar')}>Desenhar terreno</button></div>` : null}
        ${modo === 'desenhar' ? html`<div className="impl-aviso noprint">Clique nos vértices do terreno. ${pts.length > 2 ? 'Clique no primeiro ponto ou em Concluir.' : pts.length + ' ponto(s).'}</div>` : null}
      </div>
      <${Src}>${base === 'sat' ? 'Esri World Imagery' : '© OpenStreetMap contributors'} · posições em metros a partir da origem do terreno<//>
    <//>
    <div className="grid" style=${{ alignContent: 'start' }}>
      <${Card} title="Terreno" sub=${num(P.areaLote) + ' m² · ' + P.lote.length + ' lados' + (E.area ? ' · estudo: ' + num(E.area) + ' m²' : '')}>
        <div className="noprint" style=${{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          ${modo === 'desenhar' ? html`
            <button className="btn pri sm" disabled=${pts.length < 3} onClick=${concluir}>Concluir (${pts.length})</button>
            <button className="btn sm" disabled=${!pts.length} onClick=${() => setPts(p => p.slice(0, -1))}>Desfazer ponto</button>
            <button className="btn sm" onClick=${() => { setPts([]); setModo('ver'); }}>Cancelar</button>`
          : html`
            <button className="btn pri sm" onClick=${() => { setPts([]); setSel(null); setModo('desenhar'); }}>${P.fonte === 'mapa' ? 'Redesenhar terreno' : 'Desenhar terreno'}</button>
            ${P.fonte === 'mapa' ? html`<button className=${'btn sm' + (modo === 'editar' ? ' pri' : '')} onClick=${() => setModo(modo === 'editar' ? 'ver' : 'editar')}>${modo === 'editar' ? 'Concluir edição' : 'Editar vértices'}</button>
              <button className="btn sm" onClick=${() => { if (confirmar('Apagar o terreno desenhado?')) setE({ implant: { ...I, lote: null, frente: null } }); }}>Apagar</button>` : null}`}
        </div>
        ${P.fonte === 'mapa' && E.area > 0 && Math.abs(P.areaLote / E.area - 1) > 0.01 ? html`<div className="alert at noprint" style=${{ marginBottom: 8 }}>Área desenhada difere da área do estudo. <button className="btn sm" style=${{ marginLeft: 6 }} onClick=${() => setE({ area: Math.round(P.areaLote) })}>Usar ${num(P.areaLote)} m² no estudo</button></div>` : null}
        ${P.fonte === 'mapa' && !(E.area > 0) ? html`<button className="btn sm noprint" style=${{ marginBottom: 8 }} onClick=${() => setE({ area: Math.round(P.areaLote) })}>Usar ${num(P.areaLote)} m² como área do terreno</button>` : null}
        <div className="grid g2">
          <${Field} label="Frente do lote (acesso)"><select className="in box" value=${P.frente} onChange=${e => setI({ frente: +e.target.value })}>${P.lados.map((l, i) => html`<option key=${i} value=${i}>Lado ${i + 1} · ${num(l, 1)} m</option>`)}</select><//>
          <${Field} label="Recuo indicativo (m)"><${Num} className="box" value=${P.recuo} onChange=${v => setI({ recuo: v })} min=${0} max=${30} /><//>
        </div>
      <//>
      <${Card} title="Estruturas" sub=${P.itens.length + ' itens · ' + (P.manual ? 'posições ajustadas por você' : 'implantação automática')}
        right=${P.manual ? html`<button className="btn sm noprint" onClick=${() => { if (confirmar('Descartar as posições ajustadas e refazer a implantação automática?')) { setProd({ implant: null }); setSel(null); } }}>Automática</button>` : null}>
        <div className="impl-lista">${P.itens.map(x => html`<button key=${x.id} className=${'impl-row' + (sel === x.id ? ' on' : '')} onClick=${() => setSel(sel === x.id ? null : x.id)}>
          <span className="dot" style=${{ background: (IMPL_TIPOS[x.tipo] || IMPL_TIPOS.bloco).cor }}></span><span style=${{ flex: 1, textAlign: 'left' }}>${x.nome}</span>
          <${Pill} k=${x.fora || x.colide ? 'cr' : 'ok'}>${x.fora ? 'fora' : x.colide ? 'sobreposta' : 'ok'}<//></button>`)}</div>
        ${it ? html`<div className="impl-ed">
          <div className="grid g2">
            <${Field} label="Nome"><${Txt} className="box" value=${it.nome} onChange=${v => upd(it.id, { nome: v })} /><//>
            ${it.tipo === 'torre' ? html`<${Field} label="Pavimentos-tipo · un./andar"><div style=${{ display: 'flex', gap: 4 }}><${Num} className="box" value=${PR.pavimentos} onChange=${v => setProd({ pavimentos: v })} min=${1} /><${Num} className="box" value=${PR.unAndar} onChange=${v => setProd({ unAndar: v })} min=${1} /></div><//>`
              : it.tipo === 'casa' ? html`<${Field} label="Projeção"><div className="in box" style=${{ display: 'flex', alignItems: 'center' }}>${num(it.w, 1)} × ${num(it.d, 1)} m · ${it.pav} pav.</div><//>`
              : html`<${Field} label="Largura × profundidade (m)"><div style=${{ display: 'flex', gap: 4 }}><${Num} className="box" value=${it.w} onChange=${v => upd(it.id, { w: v })} min=${1} /><${Num} className="box" value=${it.d} onChange=${v => upd(it.id, { d: v })} min=${1} /></div><//>`}
          </div>
          <div className="field" style=${{ marginTop: 8 }}><label>Rotação · <span className="mono">${num(((it.rot - P.thD) % 360 + 540) % 360 - 180)}° em relação à frente</span></label>
            <div style=${{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="range" min="-180" max="180" step="1" value=${Math.round(((it.rot - P.thD) % 360 + 540) % 360 - 180)} style=${{ flex: 1 }} onChange=${e => upd(it.id, { rot: P.thD + +e.target.value })} />
              <button className="btn sm" onClick=${() => upd(it.id, { rot: it.rot + 90 })}>+90°</button></div></div>
          <div style=${{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }} className="noprint">
            <button className="btn sm" onClick=${() => { upd(it.id, { rot: P.thD }); }}>Alinhar à frente</button>
            <button className="btn sm" onClick=${() => { salvar(l => l.filter(x => x.id !== it.id)); setSel(null); }}>Remover</button>
          </div>
        </div>` : html`<div className="note" style=${{ marginTop: 8 }}>Selecione uma estrutura na lista ou no mapa para girar, redimensionar ou remover. Arraste o rótulo no mapa para mover.</div>`}
        <div className="noprint" style=${{ display: 'flex', gap: 6, marginTop: 12 }}>
          <select className="in box" value=${novoTipo} onChange=${e => setNovoTipo(e.target.value)}>${tipos.map(([k, t]) => html`<option key=${k} value=${k}>${t.l}</option>`)}</select>
          <button className="btn sm" onClick=${adicionar}>+ Adicionar</button>
        </div>
      <//>
    </div>
  </div>`;
}

/* ============================ modelo 3D (canvas, sem dependências) ============================ */
const V3 = {
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  norm: a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
};
// Posição do sol (aproximação de Cooper; hora solar local). Vetor em (leste, norte, cima).
function posSol(lat, dia, hora) {
  const r = Math.PI / 180, dec = 23.44 * r * Math.sin(2 * Math.PI * (284 + dia) / 365), H = (hora - 12) * 15 * r, la = lat * r;
  const sa = Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(H), alt = Math.asin(lim(sa, -1, 1));
  let az = Math.acos(lim((Math.sin(dec) - sa * Math.sin(la)) / ((Math.cos(alt) * Math.cos(la)) || 1e-9), -1, 1)); if (H > 0) az = 2 * Math.PI - az;
  return { alt, az, v: [Math.sin(az) * Math.cos(alt), Math.cos(az) * Math.cos(alt), Math.sin(alt)] };
}
function envoltoria(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]); if (p.length < 3) return p;
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.slice().reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
function cena3D(P) {
  const pr = [], sombra = [], rot = [];
  const prisma = (base, z0, z1, cor, op = {}) => pr.push({ base, z0, z1, cor, ...op });
  P.itens.forEach(x => {
    const T = IMPL_TIPOS[x.tipo] || IMPL_TIPOS.bloco;
    if (x.tipo === 'torre') {
      prisma(x.poly, 0, PJ.peTerreo, '#BDB6AA', { vidro: true });
      for (let k = 0; k < P.NP; k++) { const z0 = PJ.peTerreo + k * PJ.peTipo; prisma(x.poly, z0, z0 + PJ.peTipo, T.cor, { janelas: true, topo: k === P.NP - 1 }); }
      prisma(x.nucleoPoly, P.hTorre, P.hTorre + PJ.atico, '#C9C3B8', { topo: true });
      sombra.push({ base: x.poly, h: P.hTorre + PJ.atico });
      rot.push({ p: [x.x, x.y, P.hTorre + PJ.atico + 4], t: x.nome });
    } else if (x.tipo === 'casa') {
      for (let k = 0; k < x.pav; k++) prisma(x.poly, k * 3, (k + 1) * 3, T.cor, { janelas: true, topo: k === x.pav - 1 });
      sombra.push({ base: x.poly, h: x.h });
    } else {
      prisma(x.poly, 0, Math.max(0.06, x.h), T.cor, { topo: true, plano: x.h < 0.5 });
      if (x.h >= 0.5) sombra.push({ base: x.poly, h: x.h });
    }
  });
  const sub = [];
  for (let k = 1; k <= P.nSub; k++) sub.push({ base: P.lote, z0: -k * PJ.peSub, z1: -(k - 1) * PJ.peSub + (k === 1 ? -0.05 : 0), cor: '#8E8E93', alpha: 0.28, topo: true });
  return { pr, sub, sombra, rot };
}
function faces(lista) {
  const F = [];
  lista.forEach(p => {
    const b = p.base, n = b.length;
    for (let i = 0; i < n; i++) {
      const a = b[i], c = b[(i + 1) % n], dx = c[0] - a[0], dy = c[1] - a[1], len = Math.hypot(dx, dy); if (len < 1e-6) continue;
      const nr = [dy / len, -dx / len, 0], pts = [[a[0], a[1], p.z0], [c[0], c[1], p.z0], [c[0], c[1], p.z1], [a[0], a[1], p.z1]];
      const win = [];
      if ((p.janelas || p.vidro) && len > 1.6) {
        const nw = p.vidro ? 1 : Math.max(1, Math.round(len / 3.2)), e = 0.04;
        const zA = p.vidro ? p.z0 + 0.25 : p.z0 + 0.9, zB = p.vidro ? p.z1 - 0.7 : p.z0 + 2.35;
        for (let j = 0; j < nw; j++) {
          const t0 = (j + (p.vidro ? 0.03 : 0.2)) / nw, t1 = (j + (p.vidro ? 0.97 : 0.8)) / nw;
          const P0 = [a[0] + dx * t0 + nr[0] * e, a[1] + dy * t0 + nr[1] * e], P1 = [a[0] + dx * t1 + nr[0] * e, a[1] + dy * t1 + nr[1] * e];
          win.push([[P0[0], P0[1], zA], [P1[0], P1[1], zA], [P1[0], P1[1], zB], [P0[0], P0[1], zB]]);
        }
      }
      F.push({ pts, n: nr, cor: p.cor, alpha: p.alpha, win });
    }
    if (p.topo !== false && (p.topo || p.plano)) F.push({ pts: b.map(q => [q[0], q[1], p.z1]), n: [0, 0, 1], cor: p.cor, alpha: p.alpha, topo: true });
  });
  return F;
}
const rgb = h => { const v = parseInt(h.slice(1), 16); return [v >> 16 & 255, v >> 8 & 255, v & 255]; };
const tom = (h, k, a = 1) => { const c = rgb(h).map(x => Math.round(lim(x * k, 0, 255))); return a < 1 ? 'rgba(' + c.join(',') + ',' + a + ')' : 'rgb(' + c.join(',') + ')'; };
const temaEscuro = () => { const t = document.documentElement.dataset.theme; return t === 'dark' || (!t && matchMedia('(prefers-color-scheme: dark)').matches); };

function Vista3D({ P, ctx }) {
  const { real, M, printAll } = ctx;
  const lat = P.origem ? P.origem[0] : real.geo?.lat ?? -15;
  const [op, setOp] = useState({ sub: false, sombras: true, hora: 15, dia: 355 });
  const cv = useRef(), box = useRef(), cam = useRef(null), raf = useRef(0), drag = useRef(null);
  const cena = useMemo(() => { const c = cena3D(P); return { ...c, F: faces(c.pr), FS: faces(c.sub) }; }, [P]);
  const bb = G2.bbox(P.lote), ext = Math.max(bb.x1 - bb.x0, bb.y1 - bb.y0, 20), hMax = P.casas ? 8 : P.hTorre + PJ.atico;
  const ctr = G2.centro(P.lote);
  const vista = k => {
    const fr = P.th - Math.PI / 2; // direção da rua (para fora da frente)
    const base = { t: [ctr[0], ctr[1], hMax * 0.32], dist: Math.max(ext, hMax) * 2 };
    cam.current = k === 'topo' ? { ...base, yaw: fr, pitch: 1.5 } : k === 'frente' ? { ...base, yaw: fr, pitch: 0.14 } : { ...base, yaw: fr - 0.75, pitch: 0.5 };
    pedir();
  };
  if (!cam.current) vista('persp');

  const desenhar = () => {
    const c = cv.current; if (!c) return; const g = c.getContext('2d'), W = c.width, H = c.height, dpr = window.devicePixelRatio || 1;
    const k = cam.current, cp = Math.cos(k.pitch), eye = [k.t[0] + k.dist * cp * Math.cos(k.yaw), k.t[1] + k.dist * cp * Math.sin(k.yaw), k.t[2] + k.dist * Math.sin(k.pitch)];
    const f = V3.norm(V3.sub(k.t, eye)), r = V3.norm(V3.cross(f, [0, 0, 1])), u = V3.cross(r, f), foc = H / (2 * Math.tan(0.42));
    const pj = p => { const v = V3.sub(p, eye), z = V3.dot(v, f); if (z < 0.5) return null; return [W / 2 + V3.dot(v, r) * foc / z, H / 2 - V3.dot(v, u) * foc / z]; };
    const escuro = temaEscuro();
    const sol = posSol(lat, op.dia, op.hora), solOn = op.sombras && sol.alt > 0.03;
    const Lz = solOn ? sol.v : V3.norm([0.35, -0.55, 0.75]);
    const ceu = g.createLinearGradient(0, 0, 0, H);
    if (escuro) { ceu.addColorStop(0, '#0B1526'); ceu.addColorStop(1, '#1C2533'); } else { ceu.addColorStop(0, solOn || !op.sombras ? '#9CC7EE' : '#3A4A66'); ceu.addColorStop(1, '#E9F1F8'); }
    g.fillStyle = ceu; g.fillRect(0, 0, W, H);
    const poli = (pts, fill, stroke, lw = 1) => {
      const q = pts.map(pj); if (q.some(x => !x)) return;
      g.beginPath(); q.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath();
      if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw * dpr; g.stroke(); }
    };
    const desenhaFaces = (L) => {
      const vis = L.filter(fc => { const c0 = fc.pts[0]; return V3.dot(fc.n, V3.sub(c0, eye)) < 0; })
        .map(fc => { const cx = fc.pts.reduce((a, p) => [a[0] + p[0], a[1] + p[1], a[2] + p[2]], [0, 0, 0]).map(v => v / fc.pts.length); return [V3.dot(V3.sub(cx, eye), V3.sub(cx, eye)), fc]; })
        .sort((a, b) => b[0] - a[0]);
      vis.forEach(([, fc]) => {
        const luz = 0.58 + 0.42 * Math.max(0, V3.dot(fc.n, Lz)) * (solOn || !op.sombras ? 1 : 0.5);
        poli(fc.pts, tom(fc.cor, luz * (escuro ? 0.85 : 1), fc.alpha ?? 1), fc.alpha ? 'rgba(255,255,255,.25)' : 'rgba(0,0,0,.16)', 0.6);
        (fc.win || []).forEach(w => poli(w, tom(escuro ? '#3E5A78' : '#6F93B5', 0.75 + 0.35 * Math.max(0, V3.dot(fc.n, Lz))), null));
      });
    };
    // entorno e subsolos
    const R = ext * 3, chao = [[ctr[0] - R, ctr[1] - R, 0], [ctr[0] + R, ctr[1] - R, 0], [ctr[0] + R, ctr[1] + R, 0], [ctr[0] - R, ctr[1] + R, 0]];
    if (op.sub && cena.FS.length) desenhaFaces(cena.FS);
    poli(chao, escuro ? 'rgba(52,54,58,' + (op.sub ? .55 : 1) + ')' : 'rgba(214,211,203,' + (op.sub ? .55 : 1) + ')');
    poli(P.lote.map(q => [q[0], q[1], 0.01]), escuro ? 'rgba(58,84,52,' + (op.sub ? .55 : 1) + ')' : 'rgba(156,190,126,' + (op.sub ? .6 : 1) + ')', '#FFD60A', 1.6);
    poli(P.recuoPoly.map(q => [q[0], q[1], 0.02]), null, 'rgba(255,214,10,.55)', 0.8);
    (P.vias || []).forEach(y => { const bF = G2.bbox(P.loteF); const v = [[bF.x0, y], [bF.x1, y], [bF.x1, y + PJ.viaCasas], [bF.x0, y + PJ.viaCasas]].map(P.Fi); poli(v.map(q => [q[0], q[1], 0.02]), escuro ? '#4A4A4E' : '#BDBAB2'); });
    if (solOn) {
      g.beginPath();
      cena.sombra.forEach(s => {
        const hz = Math.hypot(sol.v[0], sol.v[1]) || 1, len = Math.min(s.h / Math.tan(Math.max(sol.alt, 0.05)), 600), off = [-sol.v[0] / hz * len, -sol.v[1] / hz * len];
        const env = envoltoria(s.base.concat(s.base.map(q => [q[0] + off[0], q[1] + off[1]]))).map(q => pj([q[0], q[1], 0.03]));
        if (env.some(x => !x)) return; env.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath();
      });
      g.fillStyle = 'rgba(0,0,0,.24)'; g.fill('nonzero');
    }
    desenhaFaces(cena.F);
    g.font = '600 ' + 12 * dpr + 'px ' + getComputedStyle(document.body).fontFamily; g.textAlign = 'center';
    cena.rot.forEach(t => { const p = pj(t.p); if (!p) return; const w = g.measureText(t.t).width + 14 * dpr; g.fillStyle = 'rgba(29,29,31,.78)'; g.beginPath(); g.roundRect ? g.roundRect(p[0] - w / 2, p[1] - 11 * dpr, w, 22 * dpr, 11 * dpr) : g.rect(p[0] - w / 2, p[1] - 11 * dpr, w, 22 * dpr); g.fill(); g.fillStyle = '#fff'; g.fillText(t.t, p[0], p[1] + 4 * dpr); });
    // rosa dos ventos
    const n0 = pj([ctr[0], ctr[1], 0]), n1 = pj([ctr[0], ctr[1] + 10, 0]);
    if (n0 && n1) {
      const a = Math.atan2(n1[1] - n0[1], n1[0] - n0[0]), cx = W - 34 * dpr, cy = 34 * dpr, s = 16 * dpr;
      g.save(); g.translate(cx, cy); g.fillStyle = 'rgba(29,29,31,.6)'; g.beginPath(); g.arc(0, 0, s + 8 * dpr, 0, 7); g.fill();
      g.rotate(a + Math.PI / 2); g.fillStyle = '#FF453A'; g.beginPath(); g.moveTo(0, -s); g.lineTo(5 * dpr, 2 * dpr); g.lineTo(-5 * dpr, 2 * dpr); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.moveTo(0, s); g.lineTo(5 * dpr, 2 * dpr); g.lineTo(-5 * dpr, 2 * dpr); g.fill(); g.rotate(-(a + Math.PI / 2));
      g.fillStyle = '#fff'; g.font = '700 ' + 10 * dpr + 'px sans-serif'; g.fillText('N', Math.cos(a) * (s + 1 * dpr), Math.sin(a) * (s + 1 * dpr) + 3.5 * dpr); g.restore();
    }
  };
  // listeners registrados uma vez chamam sempre o desenho da renderização mais recente
  const atual = useRef(); atual.current = { desenhar, ext, hMax };
  function pedir() { cancelAnimationFrame(raf.current); raf.current = requestAnimationFrame(() => atual.current && atual.current.desenhar()); }
  useEffect(() => { pedir(); });
  useEffect(() => {
    const c = cv.current, b = box.current; if (!c || !b) return;
    const ajustar = () => { const dpr = window.devicePixelRatio || 1; c.width = Math.max(10, b.clientWidth * dpr); c.height = Math.max(10, b.clientHeight * dpr); pedir(); };
    ajustar(); const ro = new ResizeObserver(ajustar); ro.observe(b);
    const roda = e => { e.preventDefault(); const a = atual.current; cam.current.dist = lim(cam.current.dist * Math.exp(e.deltaY * 0.0012), 8, a.ext * 12 + a.hMax * 6); pedir(); };
    c.addEventListener('wheel', roda, { passive: false });
    return () => { ro.disconnect(); c.removeEventListener('wheel', roda); cancelAnimationFrame(raf.current); };
  }, []);
  const down = e => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, pan: e.shiftKey || e.button === 2 || e.button === 1 }; };
  const move = e => {
    const d = drag.current; if (!d) return; const dx = e.clientX - d.x, dy = e.clientY - d.y; d.x = e.clientX; d.y = e.clientY; const k = cam.current;
    if (d.pan) { const s = k.dist * 0.0016, cy = Math.cos(k.yaw), sy = Math.sin(k.yaw); k.t = [k.t[0] + (sy * dx + cy * dy) * s, k.t[1] + (-cy * dx + sy * dy) * s, k.t[2]]; }
    else { k.yaw -= dx * 0.008; k.pitch = lim(k.pitch + dy * 0.006, 0.04, 1.54); }
    pedir();
  };
  const baixar = () => { const a = document.createElement('a'); a.href = cv.current.toDataURL('image/png'); a.download = 'PREDIC - modelo 3D - ' + (ctx.st.estudo.nome || 'estudo') + '.png'; a.click(); };
  const salvarImg = () => cv.current.toBlob(b => { if (!b) return; ctx.addImg({ prodId: M.PR.id, blob: b, prompt: 'Volumetria 3D gerada pelo PREDIC', provider: 'modelo 3D', em: Date.now() }); toast('Vista salva nas imagens do produto.'); });
  const hh = h => String(Math.floor(h)).padStart(2, '0') + ':' + String(Math.round(h % 1 * 60)).padStart(2, '0');
  const sol = posSol(lat, op.dia, op.hora);
  return html`<div>
    ${printAll ? null : html`<div className="noprint" style=${{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
      <div className="seg"><button onClick=${() => vista('persp')}>Perspectiva</button><button onClick=${() => vista('frente')}>Frente</button><button onClick=${() => vista('topo')}>Topo</button></div>
      <button className=${'chip' + (op.sombras ? ' on' : '')} onClick=${() => setOp(o => ({ ...o, sombras: !o.sombras }))}>Sol e sombras</button>
      ${P.nSub ? html`<button className=${'chip' + (op.sub ? ' on' : '')} onClick=${() => setOp(o => ({ ...o, sub: !o.sub }))}>Subsolos (${P.nSub})</button>` : null}
      <span className="sp" style=${{ flex: 1 }}></span>
      <button className="btn sm" onClick=${salvarImg}><${Icon} n="img" s=${14} />Salvar como imagem do produto</button>
      <button className="btn sm" onClick=${baixar}><${Icon} n="down" s=${14} />PNG</button>
    </div>`}
    <div className="v3d" ref=${box}><canvas ref=${cv} onPointerDown=${down} onPointerMove=${move} onPointerUp=${() => { drag.current = null; }} onContextMenu=${e => e.preventDefault()} />
      ${op.sombras ? html`<div className="hint">${hh(op.hora)} (hora solar) · sol a ${num(sol.alt * 180 / Math.PI)}° de altura${sol.alt <= 0.03 ? ' · abaixo do horizonte' : ''}</div>` : null}</div>
    ${op.sombras && !printAll ? html`<div className="noprint" style=${{ display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 10 }}>
      <div className="field" style=${{ flex: '1 1 260px' }}><label>Hora do dia · <span className="mono">${hh(op.hora)}</span></label><input type="range" min="6" max="18" step="0.25" value=${op.hora} onChange=${e => setOp(o => ({ ...o, hora: +e.target.value }))} /></div>
      <${Field} label="Data"><select className="in box" value=${op.dia} onChange=${e => setOp(o => ({ ...o, dia: +e.target.value }))}><option value="355">21 de dezembro</option><option value="80">21 de março / setembro</option><option value="172">21 de junho</option></select><//>
    </div>` : null}
    <div className="note" style=${{ marginTop: 8 }}>${P.casas ? num(P.itens.filter(i => i.tipo === 'casa').length) + ' casas' : num(P.itens.filter(i => i.tipo === 'torre').length) + ' torre(s) de ' + num(P.NP) + ' pavimentos-tipo, placa de ' + num(P.plate.W, 1) + ' × ' + num(P.plate.D, 1) + ' m'} · altura estimada ${num(P.altura, 1)} m. Sombras para a latitude do terreno${P.origem ? '' : ' (aproximada)'}; não considera o relevo nem os vizinhos.</div>
  </div>`;
}

/* ============================ plantas baixas (SVG em metros) ============================ */
const PLANTA_CSS = `.pl text{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;fill:#1d1d1f;text-anchor:middle;dominant-baseline:central}
.pl .piso{fill:#EDEBE7}.pl .contorno{fill:none;stroke:#1d1d1f;stroke-width:2.4}.pl .verde{fill:#DCEAD0}.pl .recuo{fill:none;stroke:#C0392B;stroke-width:1;stroke-dasharray:6 4}
.pl .via{fill:#D3D1CB}.pl .vaga{fill:#fff;stroke:#5a5a5e;stroke-width:.8}.pl .vaga.pne{fill:#CFE3FF}.pl .vaga.idoso{fill:#FFE6BF}.pl .vaga.sobra{fill:#F6F6F6;stroke:#bbb;stroke-dasharray:3 2}
.pl .rampa{fill:#B9B7B1;stroke:#555;stroke-width:1}.pl .nucleo{fill:#8E8E93;stroke:#333;stroke-width:1}.pl .item{stroke:#333;stroke-width:1.3}
.pl .t-torre{fill:#E9E3D8}.pl .t-casa{fill:#EADBC6}.pl .t-piscina{fill:#9ED8F5}.pl .t-quadra{fill:#B7D7A8}.pl .t-salao{fill:#F1EBE2}.pl .t-playground{fill:#F7D3A3}.pl .t-guarita{fill:#DDD6CB}.pl .t-rampa{fill:#B9B7B1}.pl .t-bloco{fill:#E2E2E6}.pl .erro{stroke:#FF3B30;stroke-width:3}
.pl .laje{fill:#F7F6F3;stroke:#1d1d1f;stroke-width:2.6}.pl .comodo{fill:#fff;stroke:#555;stroke-width:1}.pl .k-molh{fill:#E6F0F8}.pl .k-ext{fill:#EEF5E7}.pl .k-circ{fill:#F2F1EE}
.pl .unid{fill:none;stroke:#1d1d1f;stroke-width:2.4}.pl .circ{fill:#F0EFEC;stroke:#888;stroke-width:.8}.pl .nuc{fill:#D9D7D2;stroke:#444;stroke-width:1}.pl .k-elev{fill:#C4C2BD}.pl .k-escada{fill:#E4E2DD}.pl .k-shaft{fill:#BDBBB6}.pl .k-maq{fill:#CFCDC8}
.pl .shaft{fill:#E6E4DF;stroke:#888;stroke-width:.8}.pl .cob{fill:#ECEAE5;stroke:#1d1d1f;stroke-width:2.4}.pl .cota line{stroke:#666;stroke-width:.8}.pl .cota text{fill:#444}
.pl .tit{fill:#333;font-weight:600}.pl .frente{fill:#C0392B;font-weight:700;letter-spacing:.08em}.pl .lsub{fill:#6e6e73}.pl .nucleo+text,.pl .lbl-esc{fill:#fff}.pl .esc rect{fill:#1d1d1f}.pl .esc text{fill:#333}`;
function PlantaSVG({ nivel, titulo }) {
  const id = useMemo(() => 'pl' + uid(), []);
  const pr = nivel.prims;
  const pts = []; pr.forEach(p => {
    if (p.t === 'poly' || p.t === 'clip') pts.push(...p.pts); else if (p.t === 'rect') pts.push([p.x, p.y], [p.x + p.w, p.y + p.h]);
    else if (p.t === 'text') pts.push([p.x, p.y]); else if (p.t === 'cota') { const n = cotaN(p); pts.push([p.a[0] + n[0], p.a[1] + n[1]], [p.b[0] + n[0], p.b[1] + n[1]]); }
  });
  const x0 = Math.min(...pts.map(q => q[0])), y0 = Math.min(...pts.map(q => q[1])), x1 = Math.max(...pts.map(q => q[0])), y1 = Math.max(...pts.map(q => q[1]));
  const w = x1 - x0, h = y1 - y0, pad = Math.max(w, h) * 0.05 + 1, fsT = Math.max(w, h) / 45;
  const vb = [x0 - pad, y0 - pad - fsT * 2.6, w + 2 * pad, h + 2 * pad + fsT * 5.2];
  const cabe = (t, fs, ww, hh) => String(t).length * fs * 0.56 <= ww * 0.94 && fs * 1.15 <= hh;
  const rotulo = (cx, cy, ww, hh, p) => {
    if (!p.label) return null; let fs = p.fs || 0.4;
    const linhas = [p.label].concat(p.sub ? [p.sub] : []);
    for (let k = 0; k < 3 && !(linhas.every(l => cabe(l, fs, ww, hh / linhas.length)) ); k++) fs *= 0.8;
    if (!linhas.every(l => cabe(l, fs, ww, hh / linhas.length))) { if (cabe(p.label, fs, ww, hh)) return html`<text x=${cx} y=${cy} style=${{ fontSize: fs, fontWeight: 600 }}>${p.label}</text>`; return null; }
    return html`<g>${linhas.map((l, i) => html`<text key=${i} x=${cx} y=${cy + (i - (linhas.length - 1) / 2) * fs * 1.2} className=${i ? 'lsub' : (/nucleo/.test(p.c) ? 'lbl-esc' : '')} style=${{ fontSize: fs * (i ? 0.88 : 1), fontWeight: i ? 400 : 600 }}>${l}</text>`)}</g>`;
  };
  const escala = [1, 2, 5, 10, 20, 50, 100, 200].find(v => v >= w / 6) || 200;
  return html`<svg xmlns="http://www.w3.org/2000/svg" className="pl" viewBox=${vb.join(' ')} preserveAspectRatio="xMidYMid meet" style=${{ background: '#fff' }}>
    <style>${PLANTA_CSS}</style>
    <defs>${pr.filter(p => p.t === 'clip').map((p, i) => html`<clipPath key=${i} id=${id + 'c'}><polygon points=${p.pts.map(q => q.join(',')).join(' ')} /></clipPath>`)}</defs>
    <text x=${vb[0] + pad} y=${y0 - pad - fsT * 1.3} style=${{ fontSize: fsT * 1.15, fontWeight: 700, textAnchor: 'start' }}>${titulo}</text>
    ${pr.map((p, i) => {
      if (p.t === 'poly') { const c = G2.centro(p.pts.map(q => [q[0], -q[1]])); const bb = G2.bbox(p.pts); return html`<g key=${i}><polygon points=${p.pts.map(q => q.join(',')).join(' ')} className=${p.c} vectorEffect="non-scaling-stroke" clipPath=${p.clip ? 'url(#' + id + 'c)' : undefined} />${rotulo(c[0], -c[1], (bb.x1 - bb.x0) * 0.8, (bb.y1 - bb.y0) * 0.8, p)}</g>`; }
      if (p.t === 'rect') return html`<g key=${i}><rect x=${p.x} y=${p.y} width=${p.w} height=${p.h} className=${p.c} vectorEffect="non-scaling-stroke" />${rotulo(p.x + p.w / 2, p.y + p.h / 2, p.w, p.h, p)}</g>`;
      if (p.t === 'text') return html`<text key=${i} x=${p.x} y=${p.y} className=${p.c} style=${{ fontSize: p.fs }}>${p.s}</text>`;
      if (p.t === 'cota') {
        // cotas sempre alinhadas aos eixos: texto acima (horizontal) ou à esquerda, girado (vertical)
        const n = cotaN(p), a = [p.a[0] + n[0], p.a[1] + n[1]], b = [p.b[0] + n[0], p.b[1] + n[1]], fs = Math.max(w, h) / 75, tk = fs * 0.45;
        const hor = Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]), mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
        const tx = hor ? mx : mx - fs * 0.9, ty = hor ? my - fs * 0.9 : my;
        return html`<g key=${i} className="cota"><line x1=${a[0]} y1=${a[1]} x2=${b[0]} y2=${b[1]} vectorEffect="non-scaling-stroke" />
          ${[a, b].map((q, j) => html`<line key=${j} x1=${q[0] - tk} y1=${q[1] + tk} x2=${q[0] + tk} y2=${q[1] - tk} vectorEffect="non-scaling-stroke" />`)}
          <text x=${tx} y=${ty} transform=${hor ? undefined : 'rotate(-90 ' + tx + ' ' + ty + ')'} style=${{ fontSize: fs }}>${p.txt}</text></g>`;
      }
      return null;
    })}
    <g className="esc" transform=${'translate(' + (vb[0] + pad) + ',' + (y1 + pad + fsT * 1.2) + ')'}>
      ${[0, 1, 2, 3].map(k => html`<rect key=${k} x=${k * escala / 4} y=${0} width=${escala / 4} height=${fsT * 0.35} style=${{ fill: k % 2 ? '#fff' : '#1d1d1f', stroke: '#1d1d1f' }} vectorEffect="non-scaling-stroke" />`)}
      <text x=${0} y=${fsT * 1.1} style=${{ fontSize: fsT * 0.7 }}>0</text><text x=${escala} y=${fsT * 1.1} style=${{ fontSize: fsT * 0.7 }}>${escala} m</text>
    </g>
    ${nivel.norte != null ? html`<g transform=${'translate(' + (vb[0] + vb[2] - pad - fsT * 1.5) + ',' + (y0 - pad + fsT * 0.6) + ') rotate(' + nivel.norte + ')'}>
      <circle r=${fsT * 1.3} style=${{ fill: '#fff', stroke: '#1d1d1f' }} vectorEffect="non-scaling-stroke" /><path d=${'M0 ' + (-fsT * 1.1) + ' L' + fsT * 0.45 + ' ' + fsT * 0.5 + ' L0 ' + fsT * 0.15 + ' L' + (-fsT * 0.45) + ' ' + fsT * 0.5 + 'Z'} style=${{ fill: '#1d1d1f' }} />
      <text y=${-fsT * 1.75} style=${{ fontSize: fsT * 0.75, fontWeight: 700 }}>N</text></g>` : null}
  </svg>`;
}
function cotaN(p) { if (!p.off) return [0, 0]; const dx = p.b[0] - p.a[0], dy = p.b[1] - p.a[1], l = Math.hypot(dx, dy) || 1; return [-dy / l * p.off, dx / l * p.off]; }

function Plantas({ P, ctx }) {
  const { printAll, st } = ctx;
  const [k, setK] = useState(P.niveis.some(n => n.k === 'tipo') ? 'tipo' : 'terreo');
  const nivel = P.niveis.find(n => n.k === k) || P.niveis[0];
  const box = useRef();
  const lista = printAll ? P.niveis : [nivel];
  const baixarSVG = () => { const s = box.current?.querySelector('svg'); if (!s) return; baixar('PREDIC - ' + nomeArq(st.estudo.nome) + ' - ' + nomeArq(nivel.nome) + '.svg', '<?xml version="1.0" encoding="UTF-8"?>\n' + s.outerHTML, 'image/svg+xml'); };
  return html`<${Card} title="Plantas baixas" sub=${P.niveis.length + ' níveis gerados das especificações do produto · estudo de massa, não substitui o projeto arquitetônico'}
    right=${printAll ? null : html`<button className="btn sm noprint" onClick=${baixarSVG}><${Icon} n="down" s=${14} />Baixar SVG</button>`}>
    ${printAll ? null : html`<div className="noprint" style=${{ marginBottom: 10 }}><${Seg} opts=${P.niveis.map(n => [n.k, n.nome])} value=${nivel.k} onChange=${setK} /></div>`}
    ${lista.map(n => html`<div key=${n.k} className="planta-l" ref=${printAll ? null : box}>
      <div className="planta"><${PlantaSVG} nivel=${n} titulo=${(st.estudo.nome || 'Estudo') + ' · ' + n.nome} /></div>
      <div>
        <div className="eyebrow" style=${{ marginBottom: 6 }}>${n.nome.toUpperCase()}</div>
        ${n.resumo.map((r, i) => html`<div key=${i} className="kv"><span>${r[0]}</span><b style=${{ textAlign: 'right' }}>${r[1]}</b></div>`)}
        ${n.k === 'tipo' ? html`<div className="sub" style=${{ margin: '12px 0 4px' }}>Unidades do pavimento</div>
          ${P.plate.uns.map(u => html`<div key=${u.n} className="kv"><span>Apto x${u.n} · ${u.tipo}<div className="sub">${u.comodos.filter(r => r.k !== 'circ').map(r => r.n).join(', ')}</div></span><b>${num(u.area, 1)} m²</b></div>`)}` : null}
        ${/^s\d/.test(n.k) ? html`<div style=${{ marginTop: 10 }}><${Legend} items=${[{ l: 'Vaga comum', color: '#fff' }, { l: 'PcD', color: '#CFE3FF' }, { l: 'Idoso', color: '#FFE6BF' }, { l: 'Excedente', color: '#F0F0F0' }].map(x => ({ ...x, h: 10 }))} /></div>` : null}
      </div>
    </div>`)}
    <div className="note" style=${{ marginTop: 10 }}>Dimensões indicativas: unidades com a área privativa do mix, vagas de 2,5 × 5,0 m e vias de 5,5 m, núcleo com escada e elevadores conforme o número de pavimentos. Valide com o código de obras, as normas de acessibilidade e incêndio e o projeto de arquitetura.</div>
  <//>`;
}
