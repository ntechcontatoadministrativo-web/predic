'use strict';
/* PREDIC · seção Base de dados e padrões: importação de planilhas, mapeamento, filtros, gráficos e aplicação ao estudo */

const CORES_Q = ['#64D2FF', '#30D158', '#FFD60A', '#FF9F0A', '#FF453A'];
const sinal = v => (Math.abs(v) < 0.0005 ? '' : v >= 0 ? '+' : '−') + pct(Math.abs(v));
const milK = v => ok(v) ? 'R$ ' + num(v / 1000, v >= 1e6 ? 0 : 0) + ' mil' : '—';
// Marcas "redondas" para eixos
function marcas(lo, hi, n = 5) {
  if (!(hi > lo)) return [lo];
  const passo0 = (hi - lo) / n, p10 = Math.pow(10, Math.floor(Math.log10(passo0))), f = passo0 / p10, passo = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p10;
  const out = []; for (let v = Math.ceil(lo / passo) * passo; v <= hi + 1e-9; v += passo) out.push(v); return out;
}

/* ============================ gráficos ============================ */
// Dispersão área × R$/m² com curva ajustada, grupos coloridos e as tipologias do estudo em destaque.
function Dispersao({ P, cor, mix }) {
  const W = 640, H = 300, L = 54, R = 12, T = 12, B = 30;
  const pts = P.recs.filter(r => r.area > 0), fora = P.todos.filter(r => r.ok && r.out && r.area > 0 && !P.recs.includes(r));
  const grupo = r => cor === 'padrao' ? (r.pad ? PAD_TXT[r.pad] : null) : cor === 'dorms' ? (r.dorms == null ? null : r.dorms >= 4 ? '4+ dorm.' : r.dorms + ' dorm.') : r.bairro || null;
  const cont = {}; pts.forEach(r => { const g = grupo(r); if (g) cont[g] = (cont[g] || 0) + 1; });
  const top = Object.entries(cont).sort((a, b) => b[1] - a[1]).slice(0, 5).map(x => x[0]);
  const cores = Object.fromEntries(top.map((g, i) => [g, CAT[i % CAT.length]]));
  const xs = pts.map(r => r.area).concat(mix.map(m => m.area)), ys = pts.map(r => r.m2).concat(mix.map(m => m.preco).filter(v => v > 0));
  const sx = ordenar(xs), sy = ordenar(ys);
  const x0 = Math.max(0, quantil(sx, 0) * 0.9), x1 = quantil(sx, 1) * 1.05, y0 = quantil(sy, 0) * 0.92, y1 = quantil(sy, 1) * 1.05;
  const X = v => L + (v - x0) / (x1 - x0 || 1) * (W - L - R), Y = v => T + (1 - (v - y0) / (y1 - y0 || 1)) * (H - T - B);
  const curva = P.curva ? Array.from({ length: 40 }, (_, i) => x0 + (x1 - x0) * i / 39).map(a => [X(a), Y(P.curva.at(a))]).filter(p => p[1] >= T - 2 && p[1] <= H - B + 2) : [];
  return html`<div>
    <svg viewBox=${'0 0 ' + W + ' ' + H} style=${{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label="Dispersão entre área privativa e preço por metro quadrado">
      ${marcas(y0, y1, 5).map(v => html`<g key=${'y' + v}><line x1=${L} x2=${W - R} y1=${Y(v)} y2=${Y(v)} style=${{ stroke: 'var(--grid)' }} /><text x=${L - 6} y=${Y(v) + 3} textAnchor="end" className="axl">${num(v / 1000, 1)} mil</text></g>`)}
      ${marcas(x0, x1, 6).map(v => html`<g key=${'x' + v}><line x1=${X(v)} x2=${X(v)} y1=${T} y2=${H - B} style=${{ stroke: 'var(--grid)' }} /><text x=${X(v)} y=${H - B + 14} textAnchor="middle" className="axl">${num(v)} m²</text></g>`)}
      ${fora.map((r, i) => html`<g key=${'o' + i}><path d=${`M${X(r.area) - 3} ${Y(Math.min(r.m2, y1)) - 3}l6 6m0 -6l-6 6`} style=${{ stroke: 'var(--r2)' }} strokeWidth="1.3" /><title>${(r.nome || 'Registro') + ' · fora do padrão · ' + mil(r.m2) + '/m²'}</title></g>`)}
      ${curva.length > 1 ? html`<path d=${curva.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ')} fill="none" style=${{ stroke: 'var(--ink2)' }} strokeWidth="1.6" strokeDasharray="5 4" />` : null}
      ${pts.map((r, i) => { const g = grupo(r); return html`<circle key=${i} cx=${X(r.area)} cy=${Y(r.m2)} r="4" style=${{ fill: cores[g] || 'var(--zero)' }} fillOpacity=".72" stroke="var(--card)" strokeWidth="1"><title>${[r.nome, r.bairro, r.tipo].filter(Boolean).join(' · ') + '\n' + num(r.area, 0) + ' m² · ' + mil(r.m2) + '/m²' + (r.preco ? ' · ' + milK(r.preco) : '') + (r.vso != null ? ' · VSO ' + num(r.vso, 1) + '%' : '')}</title></circle>`; })}
      ${mix.filter(m => m.preco > 0).map((m, i) => html`<g key=${'m' + i}><path d=${`M${X(m.area)} ${Y(m.preco) - 7}l7 7-7 7-7-7z`} style=${{ fill: 'var(--ink)' }} stroke="var(--card)" strokeWidth="1.5" /><title>${'Este estudo · ' + m.tipo + ' · ' + num(m.area) + ' m² · ' + mil(m.preco) + '/m²'}</title></g>`)}
    </svg>
    <${Legend} items=${top.map(g => ({ l: g, color: cores[g], h: 8 })).concat(Object.keys(cont).length > top.length || pts.some(r => !grupo(r)) ? [{ l: 'outros', color: 'var(--zero)', h: 8 }] : [], [{ l: 'este estudo', color: 'var(--ink)', h: 8 }], P.curva ? [{ l: 'curva ajustada', color: 'var(--ink2)' }] : [], fora.length ? [{ l: 'fora do padrão', color: 'var(--r2)' }] : [])} />
  </div>`;
}
function Histograma({ P, marcadores }) {
  const W = 640, H = 220, L = 8, R = 8, T = 50, B = 24, bins = P.hist, mx = Math.max(...bins.map(b => b.n)) || 1;
  const x0 = bins[0].de, x1 = bins.at(-1).ate, X = v => L + (Math.min(Math.max(v, x0), x1) - x0) / (x1 - x0 || 1) * (W - L - R), bw = (W - L - R) / bins.length;
  return html`<svg viewBox=${'0 0 ' + W + ' ' + H} style=${{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label="Distribuição do preço por metro quadrado">
    ${bins.map((b, i) => { const h = b.n / mx * (H - T - B); return html`<g key=${i}><rect x=${L + i * bw + 1.5} width=${bw - 3} y=${H - B - h} height=${Math.max(h, 0.5)} rx="3" style=${{ fill: 'var(--g2)' }} opacity=".55" /><title>${mil(b.de) + ' a ' + mil(b.ate) + '/m²: ' + b.n + ' registros'}</title></g>`; })}
    ${bins.filter((_, i) => i % 2 === 0).map((b, i) => html`<text key=${'t' + i} x=${X(b.de)} y=${H - 8} textAnchor="start" className="axl">${num(b.de / 1000, 1)} mil</text>`)}
    ${marcadores.filter(m => ok(m.v)).map((m, i) => { const x = X(m.v), dir = x > W * 0.7; return html`<g key=${'k' + i}><line x1=${x} x2=${x} y1=${8 + i * 13} y2=${H - B} style=${{ stroke: m.cor }} strokeWidth="2" strokeDasharray=${m.dash || ''} /><text x=${x + (dir ? -5 : 5)} y=${16 + i * 13} textAnchor=${dir ? 'end' : 'start'} className="axl" style=${{ fill: m.cor, fontWeight: 700 }}>${m.l} ${num(m.v / 1000, 1)} mil</text></g>`; })}
  </svg>`;
}
function MapaCorrelacao({ C }) {
  if (!C || C.vars.length < 3) return html`<div className="alert na">Poucas variáveis numéricas para cruzar.</div>`;
  const bg = r => r == null ? 'transparent' : r >= 0 ? `rgba(16,166,115,${Math.abs(r) * 0.75})` : `rgba(224,100,74,${Math.abs(r) * 0.75})`;
  return html`<div className="tblwrap"><table className="corr"><thead><tr><th></th>${C.vars.map(v => html`<th key=${v[0]} className="num">${v[1]}</th>`)}</tr></thead>
    <tbody>${C.vars.map((v, i) => html`<tr key=${v[0]}><th>${v[1]}</th>${C.mat[i].map((c, j) => html`<td key=${j} className="num" style=${{ background: i === j ? 'var(--track)' : bg(c?.r), color: c && Math.abs(c.r) > 0.6 && i !== j ? '#fff' : undefined }} title=${c ? 'r = ' + num(c.r, 2) + ' · ' + c.n + ' registros' : 'dados insuficientes'}>${i === j ? '' : c ? num(c.r, 2) : '·'}</td>`)}</tr>`)}</tbody></table></div>`;
}
// Mapa dos registros com coordenadas, coloridos por quintil de R$/m²
function MapaPontos({ P, lat, lon }) {
  const ref = useRef(), m = useRef(), layer = useRef();
  const pts = P.recs.filter(r => r.lat != null);
  useEffect(() => {
    if (!window.L || !ref.current || !pts.length) return;
    if (!m.current) { m.current = L.map(ref.current, { scrollWheelZoom: false }); L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(m.current); layer.current = L.layerGroup().addTo(m.current); }
    const g = layer.current; g.clearLayers();
    const s = ordenar(pts.map(r => r.m2)), q = [0.2, 0.4, 0.6, 0.8].map(p => quantil(s, p)), ci = v => q.filter(x => v > x).length;
    pts.forEach(r => L.circleMarker([r.lat, r.lon], { radius: 6, color: '#fff', weight: 1.2, fillColor: CORES_Q[ci(r.m2)], fillOpacity: 0.9 }).bindTooltip([r.nome, r.bairro, r.tipo].filter(Boolean).join(' · ') + '<br>' + mil(r.m2) + '/m²' + (r.dist != null ? ' · ' + num(r.dist, 1) + ' km' : '')).addTo(g));
    const b = L.latLngBounds(pts.map(r => [r.lat, r.lon]));
    if (ok(lat) && ok(lon)) { L.circleMarker([lat, lon], { radius: 9, color: '#fff', weight: 2.5, fillColor: '#0A84FF', fillOpacity: 1 }).bindTooltip('Terreno').addTo(g); b.extend([lat, lon]); }
    m.current.fitBounds(b.pad(0.12));
    const t = setTimeout(() => m.current && m.current.invalidateSize(), 60); return () => clearTimeout(t);
  }, [P, lat, lon]);
  useEffect(() => () => { if (m.current) { m.current.remove(); m.current = null; } }, []);
  return html`<div><div className="map"><div ref=${ref} style=${{ position: 'absolute', inset: 0 }}></div></div>
    <${Legend} items=${['20% mais baratos', '', 'mediana', '', '20% mais caros'].map((l, i) => ({ l: l || ' ', color: CORES_Q[i], h: 8 }))} /></div>`;
}

/* ============================ mapeamento de colunas ============================ */
function MapearModal({ base, onSalvar, onClose }) {
  const [cols, setCols] = useState(base.cols); const [nome, setNome] = useState(base.nome);
  const prev = useMemo(() => { const r = registrosDe([{ ...base, cols, ativa: true }]); return { ok: r.filter(x => x.ok).length, n: r.length, m2: mediana(r.filter(x => x.ok).map(x => x.m2)) }; }, [cols]);
  const ex = i => base.rows.map(r => r[i]).filter(v => v !== '' && v != null).slice(0, 3).map(String).join(' · ');
  const setPapel = (i, p) => setCols(cs => cs.map((c, j) => j === i ? { ...c, papel: p } : p !== 'ignorar' && c.papel === p ? { ...c, papel: 'ignorar' } : c));
  return html`<${Modal} title="Mapear colunas da planilha" icon="sliders" lg onClose=${onClose} footer=${html`<span className="note" style=${{ flex: 1 }}>${prev.ok} de ${prev.n} linhas com R$/m² válido${prev.m2 ? ' · mediana ' + mil(prev.m2) + '/m²' : ''}</span><button className="btn" onClick=${onClose}>Cancelar</button><button className="btn pri" onClick=${() => { onSalvar({ ...base, nome: nome.trim() || base.nome, cols }); onClose(); }}>Salvar mapeamento</button>`}>
    <div className="note" style=${{ marginBottom: 10 }}>O PREDIC reconheceu as colunas pelo título e pelo conteúdo. Ajuste o que estiver errado: basta preço + área, ou o R$/m², para gerar os padrões. Cada papel vale para uma coluna só.</div>
    <${Field} label="Nome da base"><input className="in box" value=${nome} onChange=${e => setNome(e.target.value)} /><//>
    <div className="tblwrap" style=${{ marginTop: 10, maxHeight: '52vh', overflowY: 'auto' }}><table><thead><tr><th>COLUNA DA PLANILHA</th><th>EXEMPLOS</th><th style=${{ width: 220 }}>SIGNIFICA</th></tr></thead><tbody>
      ${cols.map((c, i) => html`<tr key=${i}><td><b>${c.h}</b></td><td className="sub" style=${{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${ex(i)}</td>
        <td><select className="in box" value=${c.papel} onChange=${e => setPapel(i, e.target.value)} style=${{ fontWeight: c.papel === 'ignorar' ? 400 : 600 }}>${PAPEIS.map(p => html`<option key=${p[0]} value=${p[0]}>${p[1]}</option>`)}</select></td></tr>`)}
    </tbody></table></div>
  <//>`;
}
function ColarModal({ onImportar, onClose }) {
  const [t, setT] = useState('');
  return html`<${Modal} title="Colar dados" icon="copy" onClose=${onClose} footer=${html`<button className="btn" onClick=${onClose}>Cancelar</button><button className="btn pri" disabled=${t.trim().split('\n').length < 2} onClick=${() => { onImportar(t); onClose(); }}>Importar</button>`}>
    <div className="note" style=${{ marginBottom: 8 }}>Copie as células no Excel ou Google Planilhas (com a linha de títulos) e cole aqui. Também aceita CSV separado por ponto e vírgula ou vírgula.</div>
    <textarea className="in box" rows="12" style=${{ width: '100%', fontFamily: 'var(--mono)', fontSize: 11 }} value=${t} onChange=${e => setT(e.target.value)} placeholder=${'Empreendimento\tBairro\tÁrea\tPreço\nResidencial A\tCentro\t72\t650.000'} autoFocus />
  <//>`;
}

/* ============================ seção ============================ */
function BaseDados({ ctx }) {
  const { st, set, setProd, setL, M, real, printAll } = ctx; const { PR, D } = M;
  const bases = st.bases || [], F = st.basesFiltro || {};
  const [mapear, setMapear] = useState(null); const [colar, setColar] = useState(false); const [over, setOver] = useState(false);
  const [cor, setCor] = useState('bairro'); const [grp, setGrp] = useState('bairro'); const [verTudo, setVerTudo] = useState(false);
  const fileRef = useRef();
  const stD = useDeferredValue(bases), fD = useDeferredValue(F);
  const P = useMemo(() => { try { return stD.some(b => b.ativa !== false) ? analisarPadroes(stD, alvoDoEstudo(st, M, real), fD, real.macro) : null; } catch (e) { console.error(e); return null; } }, [stD, fD, M, real.geo, real.macro]);
  const setBases = fn => set(s => ({ bases: fn(s.bases || []) }));
  const setF = p => set(s => ({ basesFiltro: { ...(s.basesFiltro || {}), ...p } }));

  // importação
  const adicionar = (novas, origem) => {
    if (!novas.length) return;
    const usadas = bases.reduce((a, b) => a + b.rows.length, 0); let livre = MAX_LINHAS - usadas, cortou = false;
    const ok2 = novas.map(b => { if (b.rows.length > livre) { cortou = true; b = { ...b, rows: b.rows.slice(0, Math.max(0, livre)) }; } livre -= b.rows.length; return b; }).filter(b => b.rows.length);
    if (!ok2.length) { toast('Limite de ' + num(MAX_LINHAS) + ' linhas por estudo atingido. Remova uma base antes de importar outra.', true); return; }
    setBases(l => l.concat(ok2));
    const semPreco = ok2.find(b => !registrosDe([b]).some(r => r.ok));
    toast(ok2.length + (ok2.length > 1 ? ' bases importadas' : ' base importada') + ' de ' + origem + ' · ' + num(ok2.reduce((a, b) => a + b.rows.length, 0)) + ' linhas' + (cortou ? ' (cortada no limite de ' + num(MAX_LINHAS) + ')' : '') + (semPreco ? '. Confira o mapeamento: não achei preço por m².' : '.'), cortou || !!semPreco);
    if (semPreco) setMapear(semPreco.id);
  };
  const deAbas = (abas, arq) => { const l = abas.map(a => novaBase(a, arq)); const uteis = l.filter(b => b.cols.some(c => ['m2', 'preco', 'area'].includes(c.papel))); return uteis.length ? uteis : l.sort((a, b) => b.rows.length - a.rows.length).slice(0, 1); };
  const importarArquivos = async files => {
    const novas = [];
    for (const f of Array.from(files || [])) {
      try { const abas = /\.(csv|tsv|txt)$/i.test(f.name) ? lerPlanilhaLivre(await f.text()) : lerPlanilhaLivre(await f.arrayBuffer()); if (!abas.length) throw new Error('nenhuma tabela encontrada'); novas.push(...deAbas(abas, f.name)); }
      catch (e) { toast(f.name + ': ' + e.message, true); }
    }
    adicionar(novas, files.length > 1 ? files.length + ' arquivos' : files[0]?.name || 'arquivo');
  };
  const importarTexto = t => { try { const abas = lerPlanilhaLivre(t); if (!abas.length) throw new Error('não reconheci a tabela: inclua a linha de títulos'); adicionar(deAbas(abas, ''), 'dados colados'); } catch (e) { toast(e.message, true); } };
  const exemplo = () => { const g = real.geo; adicionar([baseExemplo(g?.lat ?? -1.371, g?.lon ?? -48.444)], 'exemplo sintético'); };

  // ações sobre o estudo
  const S = P?.sugestao, Mo = P?.modelo;
  const arred = v => Math.round(v / 10) * 10;
  const aplicarPrecos = () => {
    if (Mo?.confiavel && Mo.mix.length) { setProd({ mix: PR.mix.map((m, i) => { const p = Mo.mix.find(x => x.idx === i); return p ? { ...m, preco: arred(p.m2) } : m; }) }); toast('Preços do mix ajustados pelo modelo da base. Ctrl+Z desfaz.'); }
    else if (S && D.preco > 0) { const f = S.m2 / D.preco; setProd({ mix: PR.mix.map(m => ({ ...m, preco: arred(m.preco * f) })) }); toast('Preços do mix ajustados em ' + sinal(f - 1) + ' para o preço indicado. Ctrl+Z desfaz.'); }
  };
  const aplicarUm = (i, v) => { setProd({ mix: PR.mix.map((m, j) => j === i ? { ...m, preco: arred(v) } : m) }); };
  const aplicarVso = () => { setProd({ vso: Math.round(S.vso * 10) / 10 }); toast('VSO do ' + PR.nome + ' ajustada para ' + num(S.vso, 1) + '% a.m.'); };
  const levarConcs = substituir => { const novos = concorrentesDaBase(P, 12); set(s => { const ex = new Set(s.concs.map(c => norm(c.nome))); return { concs: substituir ? novos : s.concs.concat(novos.filter(c => !ex.has(norm(c.nome)))) }; }); toast(novos.length + ' empreendimentos da base levados à concorrência (Estudo de mercado).'); };
  const levarRiscos = () => { const l = P.insights.filter(i => i.k === 'cr' || i.k === 'at'); if (!l.length) return; setL({ riscosMercado: st.listas.riscosMercado.concat(l.filter(i => !st.listas.riscosMercado.some(r => r.t === i.t)).map(i => ({ id: uid(), t: i.t, v: i.v || '', k: i.k }))) }); toast(l.length + ' alerta(s) da base levados aos riscos de mercado.'); };
  const perguntarIA = () => ctx.perguntar('Interprete os padrões da base de dados de mercado que importei (veja "mercado.baseDeDados" no contexto): o que eles dizem sobre o preço, a velocidade de vendas e o produto do ' + PR.nome + '? Aponte riscos, oportunidades de tipologia e de faixa de ticket, e proponha ajustes de premissas com números.');

  const drop = html`<label className=${'drop noprint' + (over ? ' over' : '')} onDragOver=${e => { e.preventDefault(); setOver(true); }} onDragLeave=${() => setOver(false)} onDrop=${e => { e.preventDefault(); setOver(false); importarArquivos(e.dataTransfer.files); }}>
    <${Icon} n="up" s=${22} /><b style=${{ color: 'var(--ink)' }}>Arraste planilhas aqui ou clique para escolher</b><span>.xlsx, .xls, .ods ou .csv · várias abas e vários arquivos de uma vez · até ${num(MAX_LINHAS)} linhas</span>
    <input type="file" ref=${fileRef} multiple accept=".xlsx,.xls,.xlsm,.ods,.csv,.tsv,.txt" style=${{ display: 'none' }} onChange=${e => { const f = e.target.files; importarArquivos(f).finally(() => { e.target.value = ''; }); }} />
  </label>`;
  const botoes = html`<div className="noprint" style=${{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
    <button className="btn sm" onClick=${() => setColar(true)}><${Icon} n="copy" s=${13} />Colar dados</button>
    <button className="btn sm" onClick=${() => { try { baixarModeloBase(); } catch (e) { toast(e.message, true); } }}><${Icon} n="down" s=${13} />Modelo de planilha</button>
    ${!bases.length ? html`<button className="btn sm" onClick=${exemplo}><${Icon} n="spark" s=${13} />Carregar base de exemplo</button>` : null}</div>`;
  const modais = html`${mapear && bases.some(b => b.id === mapear) ? html`<${MapearModal} base=${bases.find(b => b.id === mapear)} onClose=${() => setMapear(null)} onSalvar=${nb => setBases(l => l.map(b => b.id === nb.id ? nb : b))} />` : null}${colar ? html`<${ColarModal} onClose=${() => setColar(false)} onImportar=${importarTexto} />` : null}`;

  if (!bases.length) return html`<div className="grid">
    <${Card} title="Absorva dados de mercado e descubra padrões" sub="pesquisas de campo, tabelas de vendas, books de concorrentes, exportações de portais ou bases de inteligência imobiliária">
      ${printAll ? html`<div className="alert na">Nenhuma base de dados importada neste estudo.</div>` : drop}
      <div className="grid g3" style=${{ marginTop: 14 }}>
        ${[['chart', 'Preço justo por tipologia', 'Modelo hedônico estima quanto área, dormitórios, vagas, padrão, bairro, data e distância pesam no R$/m², e sugere o preço de cada unidade do mix.'],
          ['spark', 'Padrões em linguagem clara', 'Efeito escala, tendência de preço contra IPCA e INCC, faixa de ticket mais líquida, tipologias com pouca oferta e muita venda, outliers.'],
          ['target', 'Aplicação no estudo', 'Leve preços, VSO, comparáveis e alertas para o estudo num clique (tudo desfazível) e peça à IA a interpretação dos padrões.']].map(([i, t, d]) => html`<div key=${t} className="kv" style=${{ flexDirection: 'column', alignItems: 'flex-start', gap: 4, border: 0 }}><b style=${{ display: 'flex', gap: 6, alignItems: 'center', fontFamily: 'var(--sans)', fontWeight: 700 }}><${Icon} n=${i} s=${15} />${t}</b><span className="sub">${d}</span></div>`)}
      </div>
      <div style=${{ marginTop: 12 }}>${botoes}</div>
    <//>
    ${modais}
  </div>`;

  const nLinhas = bases.reduce((a, b) => a + b.rows.length, 0);
  const listaBases = html`<${Card} title="Bases importadas" sub=${bases.length + ' base(s) · ' + num(nLinhas) + ' linhas · as bases ativas se somam na análise'} right=${botoes} className="noprint">
    <div className="tblwrap"><table><thead><tr><th style=${{ width: 30 }}></th><th>BASE</th><th className="num">LINHAS</th><th>COLUNAS RECONHECIDAS</th><th>IMPORTADA</th><th style=${{ width: 150 }}></th></tr></thead><tbody>
      ${bases.map(b => html`<tr key=${b.id} style=${{ opacity: b.ativa === false ? 0.55 : 1 }}>
        <td><input type="checkbox" checked=${b.ativa !== false} title="Usar na análise" onChange=${e => setBases(l => l.map(x => x.id === b.id ? { ...x, ativa: e.target.checked } : x))} /></td>
        <td><b>${b.nome}</b>${b.arquivo && b.arquivo !== b.nome ? html`<div className="sub">${b.arquivo}${b.aba ? ' · aba ' + b.aba : ''}</div>` : null}</td>
        <td className="num">${num(b.rows.length)}</td>
        <td className="sub">${b.cols.filter(c => c.papel !== 'ignorar').map(c => PAPEL[c.papel][1]).join(', ') || 'nenhuma'}</td>
        <td className="sub">${horaBR(b.em)}</td>
        <td style=${{ textAlign: 'right', whiteSpace: 'nowrap' }}><button className="btn sm" onClick=${() => setMapear(b.id)}><${Icon} n="sliders" s=${13} />Colunas</button> <button className="btn sm danger" title="Remover base" onClick=${() => { if (confirmar('Remover a base "' + b.nome + '" deste estudo?')) setBases(l => l.filter(x => x.id !== b.id)); }}><${Icon} n="trash" s=${13} /></button></td></tr>`)}
    </tbody></table></div>
    <div style=${{ marginTop: 10 }}>${drop}</div>
  <//>`;

  if (!P || P.n < 3) return html`<div className="grid">${listaBases}
    ${P ? html`<${Filtros} P=${P} F=${F} setF=${setF} />` : null}
    <div className=${'alert ' + (P ? 'at' : 'na')}>${P ? P.insights[0].t : 'Ative ao menos uma base para gerar os padrões.'}</div>${modais}</div>`;

  const E = P.est, mixAlvo = PR.mix.map(m => ({ tipo: m.tipo, area: m.area, preco: m.preco }));
  const G = P.grupos[grp] || [], gmx = Math.max(...G.map(g => g.m2 || 0)) || 1;
  const GRUPOS = [['bairro', 'Bairro'], ['dorms', 'Tipologia'], ['padrao', 'Padrão'], ['ticket', 'Faixa de ticket'], ['incorp', 'Incorporadora'], ['status', 'Situação']].filter(([k]) => (P.grupos[k] || []).length >= 2);
  const temIA = !!ctx.ai?.ai;
  return html`<div className="grid">
    ${listaBases}
    <${Filtros} P=${P} F=${F} setF=${setF} />
    <div className="grid g4">
      <${Kpi} s="REGISTROS" v=${num(P.n)} l=${(P.nEmp ? num(P.nEmp) + ' empreendimentos · ' : '') + (P.nOut ? P.nOut + ' fora do padrão' : 'sem outliers')} t="p" help="Linhas com preço por m² válido depois dos filtros. Outliers (preço muito distante da mediana) ficam fora, a menos que você os inclua nos filtros." />
      <${Kpi} s="R$/M² MEDIANO" v=${mil(E.m2.med)} l=${'P25 ' + mil(E.m2.p25) + ' · P75 ' + mil(E.m2.p75)} t="y" />
      <${Kpi} s="TICKET MEDIANO" v=${E.preco.n ? milK(E.preco.med) : '—'} l=${E.area.n ? 'área mediana ' + num(E.area.med) + ' m²' : 'sem área na base'} t="y" />
      <${Kpi} s="VSO MEDIANA" v=${E.vso.n ? num(E.vso.med, 1) + '% a.m.' : '—'} l=${E.vso.n ? E.vso.n + ' registros com velocidade' : 'inclua VSO ou vendidas/total'} t="y" />
      <${Kpi} s="TENDÊNCIA DE PREÇO" v=${P.tend?.ano ? sinal(P.tend.ano.g) + ' a.a.' : '—'} l=${P.tend?.ano ? (Math.abs(P.tend.ano.t) >= 2 ? 'estatisticamente consistente' : 'tendência fraca') + (P.tend.ano.real != null ? ' · real ' + sinal(P.tend.ano.real) : '') : 'inclua datas na base'} t=${!P.tend?.ano ? 'n' : P.tend.ano.g >= 0 ? 'g' : 'r'} help="Variação anual do R$/m² estimada por regressão sobre as datas; 'real' desconta o IPCA de 12 meses do Banco Central." />
      <${Kpi} s="MODELO DE PREÇO" v=${Mo ? 'R² ' + pct(Mo.r2aj, 0) : '—'} l=${Mo ? Mo.n + ' registros · erro típico ' + pct(Mo.erro, 0) : 'precisa de 10+ registros com área'} t=${!Mo ? 'n' : Mo.confiavel ? 'g' : 'y'} help="Quanto da variação do R$/m² o modelo explica (R² ajustado). Acima de 35% com 15+ registros o PREDIC usa o modelo para sugerir preço." />
      <${Kpi} s="PREÇO INDICADO" v=${S ? mil(S.m2) : '—'} l=${S ? 'faixa ' + mil(S.lo) + ' a ' + mil(S.hi) : ''} t=${!S || S.dif == null ? 'n' : Math.abs(S.dif) <= 0.05 ? 'g' : Math.abs(S.dif) <= 0.12 ? 'y' : 'r'} help=${S ? 'Fonte: ' + S.fonte + '.' : ''} />
      <${Kpi} s="POSIÇÃO DO ESTUDO" v=${P.posicao ? 'P' + Math.round(P.posicao.m2 * 100) : '—'} l=${mil(D.preco) + '/m² · ' + PR.nome} t=${!P.posicao ? 'n' : P.posicao.m2 >= 0.85 ? 'r' : P.posicao.m2 >= 0.7 ? 'y' : 'g'} help="Percentil do R$/m² do estudo na base: P50 = mediana; P90 = mais caro que 90% dos registros." />
    </div>

    <div className="grid g21">
      <${Card} title="Padrões encontrados" sub="gerados automaticamente a partir da base" right=${html`<div className="noprint" style=${{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button className="btn ia sm" disabled=${!temIA} title=${temIA ? 'Abre o assistente com a análise' : 'IA não configurada no servidor'} onClick=${perguntarIA}><${Icon} n="ia" s=${13} />Interpretar com IA</button>
          <button className="btn sm" onClick=${() => { try { exportarPadroes(P, st.estudo.nome); } catch (e) { toast(e.message, true); } }}><${Icon} n="down" s=${13} />Exportar análise</button></div>`}>
        ${P.insights.map((x, i) => html`<div key=${i} className="kv"><span style=${{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>${x.k !== 'na' ? html`<${Pill} k=${x.k}>${({ ok: 'favorável', at: 'atenção', cr: 'crítico' })[x.k]}<//>` : html`<span className="dot" style=${{ background: 'var(--p2)', marginTop: 6, flex: '0 0 auto' }}></span>`}<span>${x.t}</span></span>${x.v ? html`<b style=${{ whiteSpace: 'nowrap' }}>${x.v}</b>` : null}</div>`)}
        ${P.insights.some(i => i.k === 'cr' || i.k === 'at') ? html`<button className="add noprint" onClick=${levarRiscos}>+ Levar alertas para os riscos de mercado</button>` : null}
      <//>
      <div className="card hero">
        <div className="k-mono">RECOMENDAÇÃO DA BASE · ${PR.nome}</div>
        ${S ? html`<h2 style=${{ fontSize: 26, margin: '8px 0 2px', fontFamily: 'var(--disp)' }}>${mil(S.m2)}<span style=${{ fontSize: 13 }}>/m²</span></h2>
          <p className="sub">faixa provável ${mil(S.lo)} a ${mil(S.hi)} · ${S.fonte}</p>
          <div className="kv" style=${{ marginTop: 10 }}><span>Preço médio do estudo</span><b>${mil(D.preco)} ${S.dif != null ? '(' + sinal(S.dif) + ')' : ''}</b></div>
          ${S.vso ? html`<div className="kv"><span>VSO indicada (${S.vsoFonte})</span><b>${num(S.vso, 1)}% a.m. · estudo ${num(PR.vso, 1)}%</b></div>` : null}
          ${P.comps ? html`<div className="kv"><span>Comparáveis mais parecidos</span><b>${P.comps.lista.length} · mediana ${mil(P.comps.m2)}</b></div>` : null}
          <div className="noprint" style=${{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
            <button className="btn pri sm" onClick=${aplicarPrecos} disabled=${!(Mo?.confiavel && Mo.mix.length) && !(S && D.preco > 0)}>${Mo?.confiavel ? 'Aplicar preços do modelo ao mix' : 'Ajustar mix ao preço indicado'}</button>
            ${S.vso ? html`<button className="btn sm" onClick=${aplicarVso}>Usar VSO de ${num(S.vso, 1)}%</button>` : null}
            <${Menu} button=${t => html`<button className="btn sm" onClick=${t}><${Icon} n="building" s=${13} />Concorrência</button>`}>
              <button onClick=${() => levarConcs(false)}><${Icon} n="plus" />Adicionar os 12 mais parecidos</button>
              <button onClick=${() => { if (!st.concs.length || confirmar('Substituir os ' + st.concs.length + ' concorrentes atuais pelos 12 mais parecidos da base?')) levarConcs(true); }}><${Icon} n="copy" />Substituir a concorrência</button>
            <//>
          </div>` : html`<div className="alert na" style=${{ marginTop: 10 }}>Sem dados suficientes para indicar preço.</div>`}
      </div>
    </div>

    ${Mo && Mo.mix.length ? html`<${Card} title="Preço por tipologia · modelo × estudo" sub=${'previsão do modelo para cada unidade do mix' + (Mo.alvoBairro ? ' no bairro ' + Mo.alvoBairro : ' (localização média da base)') + (Mo.confiavel ? '' : ' · modelo com poder explicativo baixo: use com cautela')}>
      <div className="tblwrap"><table><thead><tr><th>TIPOLOGIA</th><th className="num">ÁREA</th><th className="num">ESTUDO</th><th className="num">MODELO</th><th className="num">FAIXA 80%</th><th className="num">DIFERENÇA</th><th className="noprint" style=${{ width: 90 }}></th></tr></thead><tbody>
        ${Mo.mix.map(m => html`<tr key=${m.idx}><td>${m.tipo}</td><td className="num">${num(m.area)} m²</td><td className="num">${mil(m.preco)}</td><td className="num"><b>${mil(m.m2)}</b></td><td className="num">${mil(m.lo)} a ${mil(m.hi)}</td>
          <td className="num">${m.dif == null ? '—' : html`<${Pill} k=${Math.abs(m.dif) <= 0.05 ? 'ok' : Math.abs(m.dif) <= 0.12 ? 'at' : 'cr'}>${sinal(m.dif)}<//>`}</td>
          <td className="noprint" style=${{ textAlign: 'right' }}><button className="btn sm" onClick=${() => aplicarUm(m.idx, m.m2)}>Aplicar</button></td></tr>`)}
      </tbody></table></div>
    <//>` : null}

    <div className="grid g2">
      <${Card} title="Área × preço por m²" sub=${P.curva ? 'curva ajustada R² ' + pct(P.curva.r2, 0) + ' · cada ponto é um registro' : 'cada ponto é um registro'} right=${html`<div className="noprint"><${Seg} opts=${[['bairro', 'Bairro'], ['dorms', 'Dorm.'], ['padrao', 'Padrão']]} value=${cor} onChange=${setCor} /></div>`}>
        ${P.recs.some(r => r.area > 0) ? html`<${Dispersao} P=${P} cor=${cor} mix=${mixAlvo} />` : html`<div className="alert na">A base não tem área privativa.</div>`}
      <//>
      <${Card} title="Distribuição do preço por m²" sub=${num(P.n) + ' registros · P10 ' + mil(E.m2.p10) + ' · P90 ' + mil(E.m2.p90)}>
        <${Histograma} P=${P} marcadores=${[{ v: D.preco, l: 'estudo', cor: 'var(--ink)' }, { v: S?.m2, l: 'indicado', cor: 'var(--g2)', dash: '5 3' }, { v: E.m2.med, l: 'mediana', cor: 'var(--y2)', dash: '2 3' }]} />
      <//>
    </div>

    <${Card} title="Comparação por grupo" sub="medianas de cada grupo" right=${html`<div className="noprint"><${Seg} opts=${GRUPOS} value=${GRUPOS.some(g => g[0] === grp) ? grp : GRUPOS[0]?.[0]} onChange=${setGrp} /></div>`}>
      ${G.length ? html`<div className="tblwrap"><table><thead><tr><th>${(GRUPOS.find(g => g[0] === grp) || GRUPOS[0] || [, 'GRUPO'])[1]}</th><th className="num">REG.</th><th style=${{ width: '28%' }}>R$/M² MEDIANO</th><th className="num">ÁREA</th><th className="num">TICKET</th><th className="num">VSO</th><th className="num">ESTOQUE</th></tr></thead><tbody>
        ${G.slice(0, 15).map(g => html`<tr key=${g.k}><td>${g.k}</td><td className="num">${g.n}</td><td><div style=${{ display: 'flex', alignItems: 'center', gap: 8 }}><div className="tr" style=${{ flex: 1, height: 7, background: 'var(--track)', borderRadius: 4, overflow: 'hidden' }}><i style=${{ display: 'block', height: '100%', width: (g.m2 / gmx * 100) + '%', background: g.m2 > E.m2.med ? 'var(--y2)' : 'var(--g2)', borderRadius: 4 }}></i></div><span className="mono" style=${{ fontSize: 11, minWidth: 66, textAlign: 'right' }}>${mil(g.m2)}</span></div></td>
          <td className="num">${g.area ? num(g.area) + ' m²' : '—'}</td><td className="num">${g.ticket ? milK(g.ticket) : '—'}</td><td className="num">${g.vso != null ? num(g.vso, 1) + '%' : '—'}</td><td className="num">${g.estoque ? num(g.estoque) : '—'}</td></tr>`)}
      </tbody></table></div>` : html`<div className="alert na">Sem grupos com dados.</div>`}
    <//>

    <div className="grid g2">
      ${P.tend && P.tend.serie.length >= 2 ? html`<${Card} title="Evolução do preço por m²" sub=${'mediana por ' + (P.tend.trim ? 'trimestre' : 'mês') + (P.tend.ano ? ' · ' + sinal(P.tend.ano.g) + ' a.a.' : '') + (real.macro?.incc ? ' · INCC 12m ' + num(real.macro.incc.v, 1) + '%' : '')}>
        <${LineChart} h=${200} series=${[{ name: 'R$/m² mediano', values: P.tend.serie.map(s => s.m2), color: 'var(--g2)', width: 2.5 }]} yFmt=${v => num(v / 1000, 1) + ' mil'} tipFmt=${v => mil(v) + '/m²'} xLab=${i => (P.tend.serie[i] || {}).rot + ' · ' + ((P.tend.serie[i] || {}).n || 0) + ' reg.'} yMin=${Math.min(...P.tend.serie.map(s => s.m2)) * 0.95} />
      <//>` : html`<${Card} title="Evolução do preço por m²"><div className="alert na">Inclua uma coluna de data (lançamento ou pesquisa) para ver a tendência no tempo.</div><//>`}
      ${Mo ? html`<${Card} title="Quanto cada atributo pesa no preço" sub=${'modelo hedônico · ' + Mo.n + ' registros · R² ajustado ' + pct(Mo.r2aj, 0) + (Mo.refBairro ? ' · bairros comparados a ' + Mo.refBairro : '')}>
        <div className="tblwrap"><table><thead><tr><th>ATRIBUTO</th><th className="num">EFEITO NO R$/M²</th><th>CONFIANÇA</th></tr></thead><tbody>
          ${Mo.coefs.slice().sort((a, b) => (a.bairro - b.bairro) || Math.abs(b.t) - Math.abs(a.t)).map(c => html`<tr key=${c.k}><td>${c.bairro ? 'Bairro ' + c.l : c.l}</td><td className="num" style=${{ color: c.sig === 'fraco' ? 'var(--mute)' : c.efeito >= 0 ? 'var(--g)' : 'var(--r)' }}>${sinal(c.efeito)}</td><td><${Pill} k=${c.sig === 'forte' ? 'ok' : c.sig === 'moderado' ? 'at' : 'na'}>${c.sig}<//></td></tr>`)}
        </tbody></table></div>
        <div className="note" style=${{ marginTop: 6 }}>Efeito de cada atributo com os demais constantes (regressão do log do R$/m²). “Forte” = estatística t acima de 2.</div>
      <//>` : html`<${Card} title="Quanto cada atributo pesa no preço"><div className="alert na">O modelo precisa de ao menos 10 registros com área privativa.</div><//>`}
    </div>

    <div className="grid g2">
      ${P.opcoes.temGeo && P.recs.some(r => r.lat != null) ? html`<${Card} title="Mapa de preços" sub=${P.espacial?.gradKm != null ? 'cada km de distância do terreno: ' + sinal(P.espacial.gradKm) + ' no R$/m²' : 'registros com coordenadas'}>
        <${MapaPontos} P=${P} lat=${real.geo?.lat} lon=${real.geo?.lon} />
      <//>` : null}
      <${Card} title="Correlações" sub="de −1 (vermelho) a +1 (verde) · passe o mouse para ver o número de registros">
        <${MapaCorrelacao} C=${P.corr} />
        ${P.corr?.pares.length ? html`<div className="note" style=${{ marginTop: 8 }}>Mais fortes: ${P.corr.pares.slice(0, 4).map(p => p.a + ' × ' + p.b + ' (' + num(p.r, 2) + ')').join(' · ')}</div>` : null}
      <//>
    </div>

    ${P.comps ? html`<${Card} title="Comparáveis mais parecidos com o produto" sub=${'área ~' + num(P.comps.area) + ' m²' + (P.comps.dorms != null ? ' · ' + num(P.comps.dorms, P.comps.dorms % 1 ? 1 : 0) + ' dorm.' : '') + (P.comps.pad ? ' · padrão ' + PAD_TXT[P.comps.pad] : '') + (P.opcoes.temGeo ? ' · próximos do terreno' : '') + ' · mediana ' + mil(P.comps.m2) + '/m²'}>
      <div className="tblwrap"><table><thead><tr><th>EMPREENDIMENTO</th><th>BAIRRO</th><th>TIPOLOGIA</th><th className="num">ÁREA</th><th className="num">R$/M²</th><th className="num">TICKET</th><th className="num">VSO</th>${P.opcoes.temGeo ? html`<th className="num">DIST.</th>` : null}<th className="num">SIMILAR.</th></tr></thead><tbody>
        ${P.comps.lista.map((r, i) => html`<tr key=${i}><td>${r.nome || '—'}</td><td>${r.bairro || '—'}</td><td>${r.tipo || (r.dorms != null ? r.dorms + ' dorm.' : '—')}</td><td className="num">${r.area ? num(r.area) : '—'}</td><td className="num">${mil(r.m2)}</td><td className="num">${r.preco ? milK(r.preco) : '—'}</td><td className="num">${r.vso != null ? num(r.vso, 1) + '%' : '—'}</td>${P.opcoes.temGeo ? html`<td className="num">${r.dist != null ? num(r.dist, 1) + ' km' : '—'}</td>` : null}<td className="num">${pct(r.sim, 0)}</td></tr>`)}
      </tbody></table></div>
    <//>` : null}

    <${Card} title="Dados tratados" sub=${num(P.total) + ' linhas lidas · ' + num(P.nFiltro) + ' nos filtros · campos em itálico foram calculados'} className="noprint">
      <div className="tblwrap" style=${{ maxHeight: verTudo ? 'none' : 360, overflowY: 'auto' }}><table><thead><tr><th>EMPREENDIMENTO</th><th>BAIRRO</th><th>TIPOLOGIA</th><th className="num">ÁREA</th><th className="num">PREÇO</th><th className="num">R$/M²</th><th>DATA</th><th className="num">VSO</th><th className="num">ESTOQUE</th><th></th></tr></thead><tbody>
        ${P.todos.slice(0, verTudo ? 2000 : 80).map((r, i) => { const it = k => r.der.includes(k) ? { fontStyle: 'italic', color: 'var(--mute)' } : null; return html`<tr key=${i} style=${{ opacity: P.recs.includes(r) ? 1 : 0.5 }}><td>${r.nome || '—'}</td><td>${r.bairro || '—'}</td><td>${r.tipo || (r.dorms != null ? r.dorms + ' dorm.' : '—')}</td>
          <td className="num" style=${it('area')}>${r.area ? num(r.area, r.area % 1 ? 1 : 0) : '—'}</td><td className="num" style=${it('preco')}>${r.preco ? milK(r.preco) : '—'}</td><td className="num" style=${it('m2')}>${r.m2 ? num(r.m2) : '—'}</td><td>${r.data ? new Date(r.data).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—'}</td>
          <td className="num" style=${it('vso')}>${r.vso != null ? num(r.vso, 1) : '—'}</td><td className="num" style=${it('estoque')}>${r.estoque ?? '—'}</td><td>${!r.ok ? html`<${Pill} k="na">sem R$/m²<//>` : r.out ? html`<${Pill} k="cr">fora do padrão<//>` : null}</td></tr>`; })}
      </tbody></table></div>
      ${P.todos.length > 80 ? html`<button className="add" onClick=${() => setVerTudo(v => !v)}>${verTudo ? 'Mostrar menos' : 'Mostrar ' + (P.todos.length > 2000 ? 'as primeiras 2.000' : 'todas as ' + num(P.todos.length)) + ' linhas'}</button>` : null}
    <//>
    ${modais}
  </div>`;
}

function Filtros({ P, F, setF }) {
  const O = P.opcoes, ativo = !!(F.bairros?.length || F.dorms?.length || F.padroes?.length || F.desde || F.ate || F.raioKm || F.outliers);
  const tog = (k, v) => { const l = F[k] || []; setF({ [k]: l.includes(v) ? l.filter(x => x !== v) : l.concat([v]) }); };
  const Chips = ({ k, opts, fmt = x => x }) => html`<div className="chips">${opts.map(o => html`<button key=${o} className=${'chip' + ((F[k] || []).includes(o) ? ' on' : '')} onClick=${() => tog(k, o)}>${fmt(o)}</button>`)}</div>`;
  const resumo = [F.bairros?.length && F.bairros.length + ' bairro(s)', F.dorms?.length && 'tipologia', F.padroes?.length && 'padrão', (F.desde || F.ate) && 'período', F.raioKm && 'raio ' + num(F.raioKm, 1) + ' km', F.outliers && 'com outliers'].filter(Boolean);
  return html`<details className="card filt" open=${ativo}>
    <summary className="card-h" style=${{ cursor: 'pointer', marginBottom: 0 }}><div><h2>Filtros da análise</h2><div className="sub">${ativo ? 'ativos: ' + resumo.join(', ') + ' · ' + num(P.nFiltro) + ' de ' + num(P.total) + ' linhas' : 'todas as ' + num(P.total) + ' linhas · clique para filtrar por bairro, tipologia, padrão, período ou raio'}</div></div>
      ${ativo ? html`<button className="btn sm noprint" onClick=${e => { e.preventDefault(); setF({ bairros: [], dorms: [], padroes: [], desde: '', ate: '', raioKm: 0, outliers: false }); }}>Limpar filtros</button>` : null}</summary>
    <div className="grid" style=${{ gap: 12, marginTop: 12 }}>
      ${O.bairros.length > 1 ? html`<${Field} label="Bairro / região"><${Chips} k="bairros" opts=${O.bairros.slice(0, 40)} /><//>` : null}
      <div className="grid g2" style=${{ gap: 12 }}>
        ${O.dorms.length > 1 ? html`<${Field} label="Tipologia"><${Chips} k="dorms" opts=${O.dorms} fmt=${x => x === '—' ? 'sem dado' : x === '0' ? 'studio' : x === '4' ? '4+ dorm.' : x + ' dorm.'} /><//>` : null}
        ${O.padroes.length > 1 ? html`<${Field} label="Padrão"><${Chips} k="padroes" opts=${O.padroes} fmt=${x => x === '—' ? 'sem dado' : x} /><//>` : null}
      </div>
      <div style=${{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        ${O.meses.length > 1 ? html`<${Field} label="De"><select className="in box" value=${F.desde || ''} onChange=${e => setF({ desde: e.target.value })}><option value="">início</option>${O.meses.map(m => html`<option key=${m} value=${m}>${mesBR(m)}</option>`)}</select><//>
          <${Field} label="Até"><select className="in box" value=${F.ate || ''} onChange=${e => setF({ ate: e.target.value })}><option value="">fim</option>${O.meses.map(m => html`<option key=${m} value=${m}>${mesBR(m)}</option>`)}</select><//>` : null}
        ${O.temGeo ? html`<${Field} label="Raio do terreno (km, 0 = todos)"><${Num} className="box" style=${{ width: 110 }} value=${F.raioKm || 0} onChange=${v => setF({ raioKm: v })} min=${0} max=${100} /><//>` : null}
        <label style=${{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, paddingBottom: 8 }}><input type="checkbox" checked=${!!F.outliers} onChange=${e => setF({ outliers: e.target.checked })} />Incluir registros fora do padrão (${P.nOut})</label>
      </div>
    </div>
  </details>`;
}
