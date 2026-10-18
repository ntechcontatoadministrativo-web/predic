'use strict';
/* PREDIC · componentes de interface */
const { useState, useEffect, useMemo, useRef, useCallback, useDeferredValue, useLayoutEffect } = React;
const html = htm.bind(React.createElement);

/* ============================ ícones (traço 24×24) ============================ */
const ICONS = {
  painel: 'M3 13h8V3H3zM13 21h8v-8h-8zM3 21h8v-6H3zM13 11h8V3h-8z',
  local: 'M12 21s-7-5.4-7-11a7 7 0 0 1 14 0c0 5.6-7 11-7 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  legis: 'M12 3v18M5 7h14M7 7l-3 7a3 3 0 0 0 6 0zM17 7l-3 7a3 3 0 0 0 6 0zM8 21h8',
  mercado: 'M3 3v18h18M7 15l4-4 3 3 6-7',
  produto: 'M4 21V8l8-5 8 5v13M9 21v-6h6v6M4 21h16',
  orcamento: 'M4 4h16v16H4zM4 9h16M9 20V9',
  financeiro: 'M12 2v20M17 6.5C17 4.6 14.8 3.5 12 3.5S7 4.8 7 7s2.2 3 5 3.5 5 1.5 5 3.8-2.2 3.7-5 3.7-5-1.2-5-3',
  sensibilidade: 'M4 4h4v4H4zM10 4h4v4h-4zM16 4h4v4h-4zM4 10h4v4H4zM10 10h4v4h-4zM16 10h4v4h-4zM4 16h4v4H4zM10 16h4v4h-4zM16 16h4v4h-4z',
  conclusao: 'M9 12l2 2 4-4M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
  ia: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9zM5 2l.6 1.4L7 4l-1.4.6L5 6l-.6-1.4L3 4l1.4-.6z',
  undo: 'M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3',
  redo: 'M15 14l5-5-5-5M20 9H9a5 5 0 0 0 0 10h3',
  more: 'M12 6h.01M12 12h.01M12 18h.01',
  menu: 'M4 6h16M4 12h16M4 18h16',
  x: 'M18 6L6 18M6 6l12 12',
  send: 'M5 12h14M13 6l6 6-6 6',
  stop: 'M7 7h10v10H7z',
  clip: 'M21 11l-8.5 8.5a5 5 0 0 1-7-7L14 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L15 7',
  globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9S14.5 18.3 12 21c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z',
  doc: 'M14 3H6v18h12V7zM14 3v4h4M9 13h6M9 17h6',
  print: 'M6 9V3h12v6M6 18H4v-7h16v7h-2M8 14h8v7H8z',
  down: 'M12 4v12M6 11l6 6 6-6M4 20h16',
  up: 'M12 20V8M6 13l6-6 6 6M4 4h16',
  plus: 'M12 5v14M5 12h14',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-4.3-4.3',
  sliders: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  check: 'M5 12l5 5L20 7',
  alert: 'M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  brain: 'M9.5 2A2.5 2.5 0 0 0 7 4.5v.3A3 3 0 0 0 4.5 8a3 3 0 0 0 .3 4.5A3 3 0 0 0 7 17.5 2.5 2.5 0 0 0 12 19V4.5A2.5 2.5 0 0 0 9.5 2zM14.5 2A2.5 2.5 0 0 1 17 4.5v.3A3 3 0 0 1 19.5 8a3 3 0 0 1-.3 4.5A3 3 0 0 1 17 17.5a2.5 2.5 0 0 1-5 1.5',
  building: 'M3 21h18M5 21V5l7-3v19M19 21V9l-7-3M9 9h.01M9 13h.01M9 17h.01M15 13h.01M15 17h.01',
  spark: 'M13 2L4 14h7l-1 8 9-12h-7z'
};
const Icon = ({ n, s = 16, style, className = '' }) => html`<svg className=${'ic ' + className} viewBox="0 0 24 24" style=${{ width: s, height: s, ...style }} aria-hidden="true"><path d=${ICONS[n] || ''} /></svg>`;

/* ============================ campos ============================ */
function Num({ value, onChange, min, max, step, className = '', dec, style, placeholder, disabled }) {
  const fmt = v => ok(v) ? (dec != null ? nf(dec).format(v) : String(v).replace('.', ',')) : '';
  const [s, setS] = useState(fmt(value)); const foc = useRef(false);
  useEffect(() => { if (!foc.current) setS(fmt(value)); }, [value]);
  const commit = () => { foc.current = false; const v = parseNum(s); if (isNaN(v) || (min != null && v < min) || (max != null && v > max)) { setS(fmt(value)); return; } if (v !== value) onChange(v); setS(fmt(v)); };
  return html`<input className=${'in num ' + className} style=${style} value=${s} placeholder=${placeholder} disabled=${disabled} inputMode="decimal"
    onFocus=${e => { foc.current = true; e.target.select(); }} onChange=${e => setS(e.target.value)} onBlur=${commit} onKeyDown=${e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') { setS(fmt(value)); foc.current = false; e.target.blur(); } }} />`;
}
function Txt({ value, onChange, className = '', placeholder, area, rows }) {
  const [s, setS] = useState(value ?? ''); const foc = useRef(false);
  useEffect(() => { if (!foc.current) setS(value ?? ''); }, [value]);
  const p = { className: 'in ' + className, value: s, placeholder, onFocus: () => { foc.current = true; }, onChange: e => setS(e.target.value), onBlur: () => { foc.current = false; if (s !== value) onChange(s); } };
  return area ? html`<textarea rows=${rows || 3} ...${p} />` : html`<input ...${p} onKeyDown=${e => { if (e.key === 'Enter') e.target.blur(); }} />`;
}
const Field = ({ label, children, style }) => html`<div className="field" style=${style}><label>${label}</label>${children}</div>`;
const Pill = ({ k, children }) => html`<span className=${'pill p-' + k}><i></i>${children}</span>`;
function NivelSel({ value, onChange, mercado }) {
  const T = mercado ? NIVM : NIVTXT;
  return html`<select className=${'in pill p-' + value} style=${{ width: 'auto', paddingRight: 4 }} value=${value} onChange=${e => onChange(e.target.value)}>
    ${['ok', 'at', 'cr', 'na'].filter(k => !(mercado && k === 'na')).map(k => html`<option key=${k} value=${k}>${T[k]}</option>`)}</select>`;
}
function Kpi({ s, v, l, t = 'g', help }) {
  const h = help ?? ajuda(s);
  return html`<div className=${'kpi t-' + t}><div className="s">${s}${h ? html`<span className="help" title=${h}>?</span>` : null}</div><div className="v" title=${v}>${v}</div><div className="l">${l}</div></div>`;
}
const Card = ({ title, sub, right, children, className = '', style }) => html`<div className=${'card ' + className} style=${style}>
  ${title || right ? html`<div className="card-h"><div><h2>${title}</h2>${sub ? html`<div className="sub">${sub}</div>` : null}</div>${right}</div>` : null}${children}</div>`;
const Seg = ({ opts, value, onChange }) => html`<div className="seg">${opts.map(([k, l]) => html`<button key=${k} className=${value === k ? 'on' : ''} onClick=${() => onChange(k)}>${l}</button>`)}</div>`;
const Src = ({ children }) => html`<div className="src" style=${{ marginTop: 6 }}>Fonte: ${children}</div>`;
const confirmar = msg => window.confirm(msg);

/* ============================ modal, menu e avisos ============================ */
function Modal({ title, icon, onClose, children, footer, lg }) {
  useEffect(() => { const k = e => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  return ReactDOM.createPortal(html`<div className="modalbg" onMouseDown=${e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className=${'modal' + (lg ? ' lg' : '')} role="dialog" aria-modal="true">
      <div className="modal-h">${icon ? html`<${Icon} n=${icon} s=${18} />` : null}<h2>${title}</h2><button className="iconbtn" onClick=${onClose} aria-label="Fechar"><${Icon} n="x" /></button></div>
      <div className="modal-b">${children}</div>
      ${footer ? html`<div className="modal-f">${footer}</div>` : null}
    </div></div>`, document.body);
}
function Menu({ button, children }) {
  const [open, setOpen] = useState(false); const ref = useRef();
  useEffect(() => { if (!open) return; const f = e => { if (!ref.current?.contains(e.target)) setOpen(false); }; document.addEventListener('mousedown', f); return () => document.removeEventListener('mousedown', f); }, [open]);
  return html`<div className="menu" ref=${ref}>${button(() => setOpen(o => !o), open)}${open ? html`<div className="menu-pop" onClick=${e => { if (e.target.closest('button')) setOpen(false); }}>${children}</div>` : null}</div>`;
}
// Avisos efêmeros (toast) com API global simples
const toastBus = { fn: null };
const toast = (t, err) => toastBus.fn && toastBus.fn({ t, err, id: uid() });
function Toasts() {
  const [l, setL] = useState([]);
  useEffect(() => { toastBus.fn = x => { setL(a => a.concat([x]).slice(-4)); setTimeout(() => setL(a => a.filter(y => y.id !== x.id)), x.err ? 7000 : 3800); }; return () => { toastBus.fn = null; }; }, []);
  return html`<div className="toasts" role="status">${l.map(x => html`<div key=${x.id} className=${'toast' + (x.err ? ' err' : '')}><i></i><span>${x.t}</span></div>`)}</div>`;
}

/* ============================ Markdown seguro ============================ */
// Escapa todo HTML e converte só o subconjunto de Markdown usado pela IA.
function mdToHtml(src) {
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const inl = s => esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  const lines = String(src || '').replace(/\r/g, '').split('\n'); const out = []; let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (/^```/.test(l)) { const b = []; i++; while (i < lines.length && !/^```/.test(lines[i])) b.push(lines[i++]); i++; out.push('<pre><code>' + esc(b.join('\n')) + '</code></pre>'); continue; }
    const h = l.match(/^(#{1,4})\s+(.*)/); if (h) { out.push(`<h${h[1].length}>${inl(h[2])}</h${h[1].length}>`); i++; continue; }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(l)) { out.push('<hr>'); i++; continue; }
    if (/^\s*\|.*\|\s*$/.test(l) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const row = r => r.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      const hd = row(l); i += 2; const rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(row(lines[i++]));
      out.push('<table><thead><tr>' + hd.map(c => '<th>' + inl(c) + '</th>').join('') + '</tr></thead><tbody>' + rows.map(r => '<tr>' + r.map(c => '<td>' + inl(c) + '</td>').join('') + '</tr>').join('') + '</tbody></table>'); continue;
    }
    if (/^\s*([-*•]|\d+[.)])\s+/.test(l)) {
      const ord = /^\s*\d+[.)]/.test(l); const it = [];
      while (i < lines.length && /^\s*([-*•]|\d+[.)])\s+/.test(lines[i])) it.push('<li>' + inl(lines[i++].replace(/^\s*([-*•]|\d+[.)])\s+/, '')) + '</li>');
      out.push((ord ? '<ol>' : '<ul>') + it.join('') + (ord ? '</ol>' : '</ul>')); continue;
    }
    if (/^>\s?/.test(l)) { const b = []; while (i < lines.length && /^>\s?/.test(lines[i])) b.push(lines[i++].replace(/^>\s?/, '')); out.push('<blockquote>' + inl(b.join(' ')) + '</blockquote>'); continue; }
    if (!l.trim()) { i++; continue; }
    const p = []; while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|```|\s*([-*•]|\d+[.)])\s+|>|\s*\|)/.test(lines[i])) p.push(lines[i++]);
    if (!p.length) p.push(lines[i++]);
    out.push('<p>' + p.map(inl).join('<br>') + '</p>');
  }
  return out.join('');
}
const Md = ({ text, className = '' }) => html`<div className=${'md ' + className} dangerouslySetInnerHTML=${{ __html: mdToHtml(text) }}></div>`;

/* ============================ gráficos ============================ */
// Linhas/áreas/barras com eixo único, linha do zero, marcadores e tooltip com crosshair. Cores via style (aceitam var()).
function LineChart({ series, h = 240, yFmt = v => num(v / 1e6, 0) + ' M', tipFmt = milhoes, xLab = i => 'M' + i, markers = [], yMin, yMax }) {
  const n = Math.max(...series.map(s => s.values.length));
  const all = series.flatMap(s => s.values).filter(ok);
  let mx = yMax ?? Math.max(0, ...all), mn = yMin ?? Math.min(0, ...all); if (mx === mn) mx = mn + 1;
  const pad = (mx - mn) * 0.06; mx += yMax == null ? pad : 0; mn -= yMin == null && mn < 0 ? pad : 0;
  const X = i => n <= 1 ? 0 : i / (n - 1) * 1000, Y = v => h - (v - mn) / (mx - mn) * h;
  const [hv, setHv] = useState(null); const ref = useRef();
  const ticks = [mx, mn].concat(mn < 0 && mx > 0 ? [0] : []); { const mid = (mx + mn) / 2; if (!ticks.some(t => Math.abs(t - mid) < (mx - mn) * 0.18)) ticks.push(mid); }
  const step = n > 40 ? 12 : 6; const xt = []; for (let i = 0; i < n; i += step) xt.push(i);
  const move = e => { const r = ref.current.getBoundingClientRect(); const x = (e.touches ? e.touches[0].clientX : e.clientX); const i = Math.round((x - r.left) / r.width * (n - 1)); setHv(Math.max(0, Math.min(n - 1, i))); };
  return html`<div>
    <div className="chart" ref=${ref} style=${{ height: h }} onMouseMove=${move} onTouchMove=${move} onMouseLeave=${() => setHv(null)}>
      <svg viewBox=${'0 0 1000 ' + h} preserveAspectRatio="none">
        ${ticks.map((t, i) => html`<line key=${'g' + i} x1="0" x2="1000" y1=${Y(t)} y2=${Y(t)} style=${{ stroke: t === 0 ? 'var(--zero)' : 'var(--grid)' }} strokeWidth="1" vectorEffect="non-scaling-stroke" />`)}
        ${series.filter(s => s.type === 'bar').map((s, j) => { const bw = 1000 / n * 0.62; return s.values.map((v, i) => html`<rect key=${'b' + j + '-' + i} x=${X(i) - bw / 2} width=${bw} y=${Math.min(Y(v), Y(0))} height=${Math.max(0.5, Math.abs(Y(v) - Y(0)))} style=${{ fill: s.color }} opacity=${hv === i ? 1 : 0.7} />`); })}
        ${series.filter(s => s.area).map((s, j) => html`<path key=${'a' + j} d=${s.values.map((v, i) => (i ? 'L' : 'M') + X(i) + ' ' + Y(v)).join(' ') + ` L${X(s.values.length - 1)} ${Y(0)} L0 ${Y(0)} Z`} style=${{ fill: s.color }} opacity="0.11" />`)}
        ${series.filter(s => s.type !== 'bar').map((s, j) => html`<path key=${'l' + j} d=${s.values.map((v, i) => (i ? 'L' : 'M') + X(i) + ' ' + Y(v)).join(' ')} fill="none" style=${{ stroke: s.color }} strokeWidth=${s.width || 2} strokeDasharray=${s.dash || ''} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />`)}
        ${markers.map((m, i) => html`<line key=${'m' + i} x1=${X(m.x)} x2=${X(m.x)} y1="0" y2=${h} style=${{ stroke: m.color || 'var(--n)' }} strokeDasharray="4 4" strokeWidth="1" vectorEffect="non-scaling-stroke" />`)}
        ${hv != null ? html`<line x1=${X(hv)} x2=${X(hv)} y1="0" y2=${h} style=${{ stroke: 'var(--ink)' }} strokeWidth="1" vectorEffect="non-scaling-stroke" />` : null}
      </svg>
      ${ticks.map((t, i) => html`<div key=${'y' + i} className="yl" style=${{ top: Y(t) / h * 100 + '%' }}>${yFmt(t)}</div>`)}
      ${markers.map((m, i) => html`<div key=${'ml' + i} className="yl" style=${{ top: (8 + i * 16) + 'px', left: `calc(${X(m.x) / 10}% + 4px)`, transform: 'none', color: m.color || 'var(--n)' }}>${m.label}</div>`)}
      ${hv != null ? html`<div className="tip" style=${X(hv) > 600 ? { right: (100 - X(hv) / 10) + '%', marginRight: 10 } : { left: X(hv) / 10 + '%', marginLeft: 10 }}>
        <b>${xLab(hv)}</b>${series.map((s, j) => html`<div key=${j} className="r"><span><i style=${{ background: s.color }}></i>${s.name}</span><strong className="mono">${tipFmt(s.values[hv])}</strong></div>`)}</div>` : null}
    </div>
    <div className="xt">${xt.map(i => html`<span key=${i}>${xLab(i)}</span>`)}</div>
  </div>`;
}
const Legend = ({ items }) => html`<div className="legend">${items.map((x, i) => html`<span key=${i}><i style=${{ background: x.color, height: x.h || 3 }}></i>${x.l}</span>`)}</div>`;
function Donut({ data }) {
  const C = 2 * Math.PI * 40; let acc = 0;
  return html`<svg viewBox="0 0 100 100" style=${{ width: 150, height: 150, flex: '0 0 150px' }}>
    <circle cx="50" cy="50" r="40" fill="none" style=${{ stroke: 'var(--track)' }} strokeWidth="16" />
    ${data.map((x, i) => { const len = x.share * C; const el = html`<circle key=${i} cx="50" cy="50" r="40" fill="none" style=${{ stroke: CAT[i % CAT.length] }} strokeWidth="16" strokeDasharray=${Math.max(0, len - 1) + ' ' + (C - len + 1)} strokeDashoffset=${-acc} transform="rotate(-90 50 50)"><title>${x.tipo}: ${pct(x.share, 0)}</title></circle>`; acc += len; return el; })}
  </svg>`;
}
function HBars({ rows, total }) {
  const mx = Math.max(...rows.map(r => r[1])) || 1;
  return html`<div>${rows.map((r, i) => html`<div key=${i} className="hbar" title=${r[0] + ': ' + milhoes(r[1])}>
    <span>${r[0]}</span><div className="tr"><i style=${{ width: (Math.max(0, r[1]) / mx * 100) + '%', background: r[2] }}></i></div>
    <span className="mono" style=${{ textAlign: 'right', fontSize: 11 }}>${milhoes(r[1])}</span><span className="mono" style=${{ textAlign: 'right', fontSize: 10.5, color: 'var(--mute)' }}>${pct(r[1] / (total || 1), 1)}</span></div>`)}</div>`;
}
function Gauge({ v, k }) {
  const c = { ok: 'var(--g2)', at: 'var(--y2)', cr: 'var(--r2)' }[k] || 'var(--n)';
  return html`<div className="score" style=${{ background: `conic-gradient(${c} ${v * 3.6}deg, var(--track) 0)`, position: 'relative' }}><div style=${{ position: 'absolute', inset: 6, borderRadius: '50%', background: 'var(--card)', display: 'grid', placeItems: 'center' }}>${Math.round(v)}</div></div>`;
}

/* ============================ mapa (Leaflet) ============================ */
// O contêiner fica sempre montado: assim o mapa sobrevive à troca de endereço e de estudo.
function MapaLote({ lat, lon, pois, raio = 1000, small }) {
  const ref = useRef(), m = useRef(), layer = useRef();
  const temGeo = ok(lat) && ok(lon);
  useEffect(() => {
    if (!window.L || !ref.current || !temGeo) return;
    if (!m.current) { m.current = L.map(ref.current, { scrollWheelZoom: false, attributionControl: true }); L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(m.current); layer.current = L.layerGroup().addTo(m.current); }
    const g = layer.current; g.clearLayers();
    L.circle([lat, lon], { radius: raio, color: '#2BB673', weight: 1.5, fillOpacity: 0.05 }).addTo(g);
    if (!small && pois) pois.itens.forEach(p => { const c = API.POI_CATS.find(x => x.k === p.cat); if (c) L.circleMarker([p.lat, p.lon], { radius: 4.5, color: '#fff', weight: 1.5, fillColor: c.cor, fillOpacity: 1 }).bindTooltip((p.nome || c.l) + ' · ' + num(p.d) + ' m').addTo(g); });
    L.circleMarker([lat, lon], { radius: 8, color: '#fff', weight: 2.5, fillColor: '#1D1C27', fillOpacity: 1 }).bindTooltip('Terreno').addTo(g);
    m.current.setView([lat, lon], small ? 14 : 15);
    const t = setTimeout(() => m.current && m.current.invalidateSize(), 60);
    return () => clearTimeout(t);
  }, [lat, lon, pois, small, temGeo]);
  useEffect(() => () => { if (m.current) { m.current.remove(); m.current = null; } }, []);
  return html`<div className=${'map ' + (small ? 'sm' : '')}><div ref=${ref} style=${{ position: 'absolute', inset: 0 }}></div>${temGeo ? null : html`<div className="ph">Localize o endereço para ver o mapa</div>`}</div>`;
}

/* ============================ listas editáveis ============================ */
// cols: [{k, l, t:'text'|'num'|'nivel'|'nivelM', w}]
function EditList({ rows, cols, onChange, novo, addLabel = '+ adicionar', groupBy }) {
  const upd = (id, patch) => onChange(rows.map(r => r.id === id ? { ...r, ...patch } : r));
  const del = id => onChange(rows.filter(r => r.id !== id));
  const cell = (r, c) => c.t === 'nivel' || c.t === 'nivelM' ? html`<${NivelSel} value=${r[c.k]} mercado=${c.t === 'nivelM'} onChange=${v => upd(r.id, { [c.k]: v })} />`
    : c.t === 'num' ? html`<${Num} value=${r[c.k] === '' ? null : +r[c.k]} onChange=${v => upd(r.id, { [c.k]: v })} min=${0} />`
      : html`<${Txt} value=${r[c.k]} onChange=${v => upd(r.id, { [c.k]: v })} area=${c.area} rows=${1} />`;
  const grupos = groupBy ? [...new Set(rows.map(r => r[groupBy]))] : [null];
  return html`<div className="tblwrap"><table>
    <thead><tr>${cols.map(c => html`<th key=${c.k} style=${{ width: c.w }} className=${c.t === 'num' ? 'num' : ''}>${c.l}</th>`)}<th style=${{ width: 28 }} className="noprint"></th></tr></thead>
    <tbody>${grupos.map(g => [
      g != null ? html`<tr key=${'g' + g}><td colSpan=${cols.length + 1} style=${{ background: 'transparent', paddingTop: 12, font: "600 9.5px/1 var(--mono)", letterSpacing: '.1em', color: 'var(--mute)' }}>${String(g || 'GERAL').toUpperCase()}</td></tr>` : null,
      ...rows.filter(r => g == null || r[groupBy] === g).map(r => html`<tr key=${r.id}>${cols.map(c => html`<td key=${c.k}>${cell(r, c)}</td>`)}<td className="noprint"><button className="rowx" title="Remover" onClick=${() => del(r.id)}>×</button></td></tr>`)
    ])}</tbody></table>
    ${!rows.length ? html`<div className="note" style=${{ padding: '10px 6px' }}>Nenhum item.</div>` : null}
    ${novo ? html`<button className="add noprint" onClick=${() => onChange(rows.concat([{ id: uid(), ...novo() }]))}>${addLabel}</button>` : null}</div>`;
}
