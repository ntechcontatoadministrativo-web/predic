'use strict';
/* PREDIC · aplicação: biblioteca de estudos, configurações, histórico (desfazer), layout e relatório */

/* ============================ armazenamento dos estudos ============================ */
// Sem conta (arquivo local), os estudos ficam em predic3-*; com conta, a cópia de trabalho de cada empresa fica em predic3s-<empresa>-*.
const CFG_KEY = 'predic3-config';
const IDX_KEY = () => SYNC.ns ? SYNC.k('index') : 'predic3-index';
const ST_KEY = id => (SYNC.ns ? SYNC.k('st-') : 'predic3-st-') + id;
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
function normalizar(d) {
  const b = estudoExemplo();
  return { ...b, ...d, v: 2, comite: { ...COMITE0, ...d.comite }, cenarios: d.cenarios || clone(SCEN0), listas: { ...b.listas, ...d.listas }, img: { ...b.img, ...d.img }, real: d.real || {}, ia: d.ia || {}, sec: d.sec || 'painel', prodSel: d.prodSel || 0 };
}
const resumoEstudo = st => {
  let q = null; try { q = quick(st); } catch (e) { }
  return { id: st.id, nome: st.estudo.nome || 'Estudo sem nome', endereco: st.estudo.endereco || '', cidade: st.real?.ibge ? st.real.ibge.nome + '/' + st.real.ibge.uf : '', exemplo: !!st.exemplo, produtos: st.produtos.length,
    criado: st.criado, atualizado: st.atualizado, capa: st.produtos.find(p => p.capa)?.capa || null,
    vgv: q ? q.R.vgv : null, tir: q && ok(q.R.tir) ? q.R.tir : null, margem: q ? q.R.margem : null, veredito: q ? q.veredito : '', k: q ? q.k : 'na' };
};
const STORE = {
  idx: () => lsGet(IDX_KEY(), []),
  load(id) { const d = lsGet(ST_KEY(id), null); return d ? normalizar({ ...d, id }) : null; },
  save(st) {
    const okW = lsSet(ST_KEY(st.id), st);
    const ant = STORE.idx().find(x => x.id === st.id);
    const l = STORE.idx().filter(x => x.id !== st.id); l.unshift({ ...resumoEstudo(st), autor: MODO.perfil ? MODO.perfil.usuario.nome : ant?.autor }); lsSet(IDX_KEY(), l);
    if (SYNC.ns) SYNC.agendar(st.id);
    return okW;
  },
  del(id) { try { localStorage.removeItem(ST_KEY(id)); } catch (e) { } lsSet(IDX_KEY(), STORE.idx().filter(x => x.id !== id)); IDB.del(id, 'chat'); if (SYNC.ns) SYNC.excluir(id); },
  novo(base) { const now = Date.now(); const st = normalizar({ ...base, id: 'e' + now.toString(36) + uid(), criado: now, atualizado: now }); STORE.save(st); return st; }
};
// Migra o estudo salvo pela versão 2 (um único estudo no navegador).
function migrarV2() {
  if (lsGet('predic3-index', null)) return;
  const v2 = lsGet('predic-v2-estudo', null);
  lsSet('predic3-index', []);
  if (v2 && Array.isArray(v2.produtos) && v2.produtos.length) STORE.novo(v2);
}
const baixar = (nome, conteudo, tipo) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([conteudo], { type: tipo })); a.download = nome; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); };
const nomeArq = s => String(s || 'estudo').replace(/[\\/:*?"<>|]+/g, '-').slice(0, 80);
function exportarBackup(sts) {
  const um = sts.length === 1;
  baixar(um ? 'PREDIC - ' + nomeArq(sts[0].estudo.nome) + '.predic.json' : 'PREDIC - backup ' + hojeBR().replace(/\//g, '-') + '.predic.json',
    JSON.stringify({ formato: 'predic', versao: 3, exportado: new Date().toISOString(), estudos: sts }, null, 1), 'application/json');
}
function lerBackup(txt) {
  const j = JSON.parse(txt);
  const l = j.formato === 'predic' && Array.isArray(j.estudos) ? j.estudos : j.v === 2 && j.produtos ? [j] : null;
  if (!l || !l.length) throw new Error('Arquivo não reconhecido como backup do PREDIC.');
  return l.map(e => STORE.novo({ ...e, id: undefined }));
}

/* ============================ configurações ============================ */
const CFG0 = { empresa: '', analista: '', cargo: '', logo: '', tema: 'sistema' };
function aplicarTema(t) { const r = document.documentElement; if (t === 'claro') r.dataset.theme = 'light'; else if (t === 'escuro') r.dataset.theme = 'dark'; else delete r.dataset.theme; }
/* ============================ biblioteca de estudos ============================ */
const saudacao = () => { const h = new Date().getHours(); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; };
const CapaPadrao = ({ i = 0 }) => html`<svg viewBox="0 0 300 120" preserveAspectRatio="xMidYMax slice" className="cover-sky" aria-hidden="true">
  ${[18, 52, 92, 128, 170, 206, 246].map((xx, j) => { const h = 34 + ((j + i) * 37) % 70; return html`<g key=${j}><rect x=${xx} y=${120 - h} width=${26 + (j % 3) * 6} height=${h} rx="2" />${Array.from({ length: Math.floor(h / 14) }, (_, k) => html`<rect key=${k} className="w" x=${xx + 5} y=${120 - h + 7 + k * 14} width=${16 + (j % 3) * 6} height="2" opacity=${(j + k + i) % 4 === 0 ? .9 : .25} />`)}</g>`; })}
</svg>`;
function Biblioteca({ cfg, perfil, abrir, novoEstudo, importarArquivo, abrirConfig, sair, imgs }) {
  const [l, setL] = useState(STORE.idx()); const [q, setQ] = useState(''); const [ord, setOrd] = useState('recentes');
  const [carregando, setCarregando] = useState(!!perfil);
  const fileRef = useRef();
  useSync();
  const atualizar = useCallback(() => { if (!perfil) { setL(STORE.idx()); return; } SYNC.puxar().then(setL).catch(e => { if (!e.offline) toast(e.message, true); setL(STORE.idx()); }).finally(() => setCarregando(false)); }, [perfil]);
  useEffect(() => { atualizar(); if (!perfil) return; const t = setInterval(atualizar, 45000); const f = () => document.visibilityState === 'visible' && atualizar(); document.addEventListener('visibilitychange', f); return () => { clearInterval(t); document.removeEventListener('visibilitychange', f); }; }, [atualizar]);
  const lista = l.filter(x => !q || norm(x.nome + ' ' + x.endereco + ' ' + x.cidade + ' ' + (x.autor || '')).includes(norm(q)))
    .sort(ord === 'nome' ? (a, b) => String(a.nome).localeCompare(String(b.nome)) : ord === 'tir' ? (a, b) => (b.tir ?? -9) - (a.tir ?? -9) : (a, b) => (b.atualizado || 0) - (a.atualizado || 0));
  const capaUrl = k => k && (imgs.find(i => i.key === k) || {}).url;
  const comAbrir = async (fn, x) => { try { if (perfil) await SYNC.garantir(x.id); fn(); } catch (e) { toast('Não foi possível carregar o estudo: ' + e.message, true); } };
  const duplicar = x => comAbrir(() => { const s = STORE.load(x.id); if (!s) return; STORE.novo({ ...s, id: undefined, estudo: { ...s.estudo, nome: s.estudo.nome + ' (cópia)' } }); setL(STORE.idx()); toast('Estudo duplicado.'); }, x);
  const exportar = x => comAbrir(() => { const s = STORE.load(x.id); s && exportarBackup([s]); }, x);
  const excluir = x => { if (!confirmar('Excluir o estudo "' + x.nome + '"' + (perfil ? ' para toda a equipe' : '') + '? Esta ação não pode ser desfeita.')) return; STORE.del(x.id); setL(STORE.idx()); toast('Estudo excluído.'); };
  const leg = perfil && !lsGet('predic3-migrado-' + SYNC.ns, null) ? estudosLegados() : [];
  const migrar = async () => { const n = await migrarLegados(); toast(n + ' estudo(s) enviados para a conta da empresa.'); atualizar(); };
  // resumo da carteira
  const reais = l.filter(x => !x.exemplo);
  const vgvT = reais.reduce((a, x) => a + (x.vgv || 0), 0), aprov = reais.filter(x => x.k === 'ok').length, tirs = reais.map(x => x.tir).filter(ok);
  const pend = perfil ? SYNC.pendentes().length : 0;
  const nomeU = perfil ? perfil.usuario.nome.split(' ')[0] : cfg.analista ? cfg.analista.split(' ')[0] : '';
  const NovoMenu = ({ big }) => html`<${Menu} button=${(t) => big ? html`<button className="card scard newcard" onClick=${t}><span className="newplus"><${Icon} n="plus" s=${22} /></span><b>Novo estudo</b><span className="sub">em branco, exemplo ou importação</span></button>` : html`<button className="btn g" onClick=${t}><${Icon} n="plus" s=${14} />Novo estudo</button>`}>
    <button onClick=${() => novoEstudo('vazio')}><${Icon} n="doc" />Estudo em branco</button>
    <button onClick=${() => novoEstudo('exemplo')}><${Icon} n="building" />Estudo de exemplo (Belém/PA)</button>
    <hr /><button onClick=${() => fileRef.current.click()}><${Icon} n="up" />Importar planilha (.xlsx) ou backup (.json)</button>
  <//>`;
  return html`<div className="libwrap">
    <header className="libbar">
      <div className="libbar-in">
        ${cfg.logo ? html`<div className="libbrand"><img src=${cfg.logo} alt="" className="clogo" /><span className="by">com <${Marca} s=${18} /> PREDIC</span></div>` : html`<${Logo} s=${32} sub=${cfg.empresa || 'Viabilidade imobiliária'} />`}
        <span className="sp"></span>
        ${l.length > 4 ? html`<div className="search"><${Icon} n="search" s=${14} /><input className="in box" placeholder="Buscar estudo, cidade ou autor…" value=${q} onChange=${e => setQ(e.target.value)} /></div>` : null}
        ${perfil ? html`<span className=${'syncdot' + (pend ? ' warn' : '')} title=${pend ? pend + ' estudo(s) aguardando envio ao servidor' : 'Tudo salvo no servidor da empresa'}><${Icon} n=${pend ? 'cloudoff' : 'cloud'} s=${15} />${pend ? pend + ' pendente(s)' : 'Sincronizado'}</span>` : null}
        <${MenuUsuario} perfil=${perfil} onConfig=${abrirConfig} onSair=${sair} />
      </div>
    </header>
    <div className="lib">
      <section className="libhero">
        <div className="libhero-tx">
          <div className="eyebrow gold">${perfil ? perfil.empresa.nome : cfg.empresa || 'PREDIC · inteligência para incorporação'}</div>
          <h1 className="disp">${nomeU ? saudacao() + ', ' + nomeU + '.' : 'Estudos de viabilidade'}</h1>
          <p className="lead">${reais.length ? 'Sua carteira de estudos em um só lugar. Abra um estudo para ver fluxo, cenários e parecer.' : 'Comece um estudo: o endereço puxa mapa, IBGE, SINAPI e serviços do entorno; o motor calcula TIR, VPL e exposição; a IA redige o parecer.'}</p>
          <div className="row"><${NovoMenu} /><button className="btn ghost-inv" onClick=${() => novoEstudo('exemplo')}><${Icon} n="building" s=${14} />Ver um exemplo</button></div>
        </div>
        <div className="libhero-kpis">
          ${[['Estudos', num(reais.length)], ['VGV em análise', vgvT ? milhoes(vgvT) : '—'], ['Aprovados', reais.length ? aprov + ' de ' + reais.length : '—'], ['TIR média', tirs.length ? pct(tirs.reduce((a, b) => a + b, 0) / tirs.length) : '—']].map(([k, v], i) => html`<div key=${i} className="hk"><span>${k}</span><b>${v}</b></div>`)}
        </div>
      </section>
      ${leg.length ? html`<div className="banner"><${Icon} n="up" s=${18} /><div><b>${leg.length} estudo(s) da versão anterior</b> estão salvos só neste navegador. Envie para a conta da empresa para que a equipe veja e para não perder nada.</div><button className="btn g sm" onClick=${migrar}>Enviar agora</button><button className="btn sm ghost" onClick=${() => { lsSet('predic3-migrado-' + SYNC.ns, Date.now()); atualizar(); }}>Agora não</button></div>` : null}
      ${!l.length && !carregando ? html`<div className="welcome">
        ${[['local', 'Localize o terreno', 'O endereço puxa mapa, IBGE, SINAPI, altimetria e serviços do entorno automaticamente.'], ['financeiro', 'Modele produto e finanças', 'Mix, custos, cronograma, financiamento e cenários num fluxo mensal completo: TIR, VPL, exposição e payback.'], ['ia', 'Decida com IA', 'O assistente lê o estudo, simula cenários, pesquisa concorrentes, lê matrículas e redige o parecer para o comitê.']].map(([ic, t, d], i) => html`<div key=${i} className="card wcard"><div className="ico"><${Icon} n=${ic} s=${18} /></div><div><span className="eyebrow">Passo ${i + 1}</span><h3>${t}</h3><p className="sub">${d}</p></div></div>`)}
      </div>` : null}
      <div className="libtools">
        <h2>${perfil ? 'Estudos da empresa' : 'Seus estudos'} <span className="count">${lista.length}</span></h2>
        <span className="sp"></span>
        ${l.length > 1 ? html`<${Seg} opts=${[['recentes', 'Recentes'], ['nome', 'Nome'], ['tir', 'Maior TIR']]} value=${ord} onChange=${setOrd} />` : null}
      </div>
      <div className="libgrid">
        <${NovoMenu} big=${true} />
        ${carregando && !l.length ? [0, 1, 2].map(i => html`<div key=${i} className="card scard skel"><div className="cover"></div><i></i><i></i><i></i></div>`) : null}
        ${lista.map((x, i) => html`<div key=${x.id} className="card scard" role="button" tabIndex="0" onClick=${e => { if (!e.target.closest('.menu')) abrir(x.id); }} onKeyDown=${e => { if (e.key === 'Enter') abrir(x.id); }}>
          <div className="cover">${capaUrl(x.capa) ? html`<img src=${capaUrl(x.capa)} alt="" />` : html`<${CapaPadrao} i=${i} />`}
            ${x.veredito ? html`<${Pill} k=${x.k}>${x.veredito}<//>` : null}${x.exemplo ? html`<span className="pill p-gold cover-tag">exemplo</span>` : null}
            ${perfil && SYNC.status(x.id) !== 'ok' ? html`<span className="cover-sync" title="Aguardando envio ao servidor"><${Icon} n="cloudoff" s=${13} /></span>` : null}</div>
          <div className="scard-h"><div style=${{ flex: 1, minWidth: 0 }}><h2 className="ell">${x.nome}</h2><div className="sub ell">${x.cidade || x.endereco || 'endereço não informado'}</div></div>
            <${Menu} button=${t => html`<button className="iconbtn sm" onClick=${e => { e.stopPropagation(); t(); }} aria-label="Ações"><${Icon} n="more" /></button>`}>
              <button onClick=${() => abrir(x.id)}><${Icon} n="doc" />Abrir</button><button onClick=${() => duplicar(x)}><${Icon} n="copy" />Duplicar</button>
              <button onClick=${() => exportar(x)}><${Icon} n="down" />Exportar backup</button><hr /><button onClick=${() => excluir(x)}><${Icon} n="trash" />Excluir</button>
            <//></div>
          <div className="mets"><div><span>VGV</span><b>${x.vgv != null ? milhoes(x.vgv) : '—'}</b></div><div><span>TIR</span><b>${x.tir != null ? pct(x.tir) : '—'}</b></div><div><span>MARGEM</span><b>${x.margem != null ? pct(x.margem) : '—'}</b></div></div>
          <div className="scard-f">${x.autor ? html`<span className="avatar xs" title=${x.autor}>${iniciais(x.autor)}</span>` : null}<span className="sub">${x.produtos || 1} produto${(x.produtos || 1) > 1 ? 's' : ''} · ${x.atualizado ? horaBR(x.atualizado) : '—'}${x.autor ? ' · ' + x.autor.split(' ')[0] : ''}</span></div>
        </div>`)}
      </div>
      ${q && !lista.length ? html`<div className="note" style=${{ marginTop: 16 }}>Nenhum estudo encontrado para "${q}".</div>` : null}
      <input type="file" ref=${fileRef} accept=".xlsx,.xls,.json" style=${{ display: 'none' }} onChange=${e => { const f = e.target.files[0]; e.target.value = ''; if (f) importarArquivo(f).then(() => setL(STORE.idx())); }} />
      <p className="libfoot">${perfil ? html`<${Icon} n="shield" s=${13} />Estudos guardados no servidor da ${perfil.empresa.nome} e compartilhados com a equipe. Imagens geradas e conversas com a IA ficam neste navegador.` : html`<${Icon} n="alert" s=${13} />Os estudos ficam salvos neste navegador. Use "Exportar backup" para guardar uma cópia ou levar a outro computador.`}</p>
    </div>
  </div>`;
}

/* ============================ capa do relatório (impressão) ============================ */
function CapaRelatorio({ st, M, cfg, real }) {
  const { R, PR } = M; const E = st.estudo;
  return html`<section className="printonly sec first"><div className="cover-page" style=${{ display: 'none' }}>
    <div style=${{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      ${cfg.logo ? html`<img src=${cfg.logo} alt="" style=${{ height: 54, maxWidth: 220, objectFit: 'contain' }} />` : html`<b style=${{ fontSize: 18 }}>${cfg.empresa || 'PREDIC'}</b>`}
      <span className="mono" style=${{ fontSize: 11, color: '#666' }}>${E.codigo} · ${hojeBR()}</span>
    </div>
    <div>
      <div className="eyebrow">Estudo de viabilidade imobiliária</div>
      <h1 style=${{ fontSize: 40, marginTop: 10 }}>${E.nome || 'Estudo sem nome'}</h1>
      <p style=${{ fontSize: 15, color: '#444', marginTop: 8 }}>${E.endereco}${real.ibge ? ' · ' + real.ibge.nome + '/' + real.ibge.uf : ''}</p>
      <p style=${{ fontSize: 13, color: '#666', marginTop: 4 }}>Produto analisado: ${PR.nome} · ${PR.tipoEdif} · ${PR.padrao}</p>
      <div style=${{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10, marginTop: 28 }}>
        ${[['Parecer', M.verdict[0]], ['VGV', milhoes(R.vgv)], ['TIR', pct(R.tir)], ['Margem', pct(R.margem)], ['Exposição máx.', milhoes(Math.abs(R.expo))]].map(([l, v], i) => html`<div key=${i} style=${{ border: '1px solid #ddd', borderRadius: 10, padding: '12px 14px' }}><div className="eyebrow">${l}</div><div style=${{ font: '600 20px/1.2 var(--sans)', marginTop: 6 }}>${v}</div></div>`)}
      </div>
    </div>
    <div style=${{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#666', borderTop: '1px solid #ddd', paddingTop: 10 }}>
      <span>${cfg.analista ? 'Responsável: ' + cfg.analista + (cfg.cargo ? ' · ' + cfg.cargo : '') : ''}</span>
      <span>Gerado com PREDIC · indicadores calculados no cenário base · dados públicos: BCB, IBGE, OpenStreetMap</span>
    </div>
  </div></section>`;
}

/* ============================ estúdio (estudo aberto) ============================ */
const UI_KEYS = new Set(['sec', 'prodSel', 'cenFluxo', 'sensInd', 'real', 'atualizado']);
// Outra pessoa salvou o estudo enquanto este navegador editava: o usuário escolhe qual versão vale.
function ConflitoModal({ st, atual, recarregar }) {
  const [busy, setBusy] = useState(false);
  const deles = () => { SYNC.usarRemota(st.id, atual); recarregar(st.id); toast('Versão de ' + (atual.autor || 'outra pessoa') + ' carregada.'); };
  const minha = async () => { setBusy(true); await SYNC.enviar(st.id, true); toast('Sua versão foi salva no servidor.'); };
  const copia = () => { const n = STORE.novo({ ...st, id: undefined, estudo: { ...st.estudo, nome: (st.estudo.nome || 'Estudo') + ' (minha versão)' } }); SYNC.usarRemota(st.id, atual); recarregar(st.id); toast('Sua versão foi guardada como "' + n.estudo.nome + '".'); };
  return html`<${Modal} title="Este estudo foi alterado por outra pessoa" icon="users" onClose=${() => { }} footer=${html`
    <button className="btn" disabled=${busy} onClick=${copia}><${Icon} n="copy" s=${14} />Guardar a minha como cópia</button>
    <button className="btn" disabled=${busy} onClick=${minha}>Sobrescrever com a minha</button>
    <button className="btn g" disabled=${busy} onClick=${deles}>Usar a versão de ${(atual.autor || 'outra pessoa').split(' ')[0]}</button>`}>
    <p><b>${atual.autor || 'Outra pessoa da equipe'}</b> salvou este estudo em ${horaBR(atual.atualizado)}, enquanto você também editava. As duas versões não podem ser juntadas automaticamente.</p>
    <p className="sub">Recomendado: guardar a sua como cópia e seguir na versão mais recente; depois compare as duas na biblioteca.</p>
  <//>`;
}

function Estudio({ inicial, cfg, ai, perfil, voltar, abrirConfig, sair, recarregar, imgs, addImg, delImg, setImgs, recarregarIA, alternarTema }) {
  const [st, setSt0] = useState(inicial);
  const [status, setStatus] = useState({});
  const [menu, setMenu] = useState(false);
  const [printAll, setPrintAll] = useState(false);
  const [cp, setCp] = useState(() => window.innerWidth > 1380 && lsGet('predic3-cp', false));
  const [fila, setFila] = useState(null);
  const [modalIA, setModalIA] = useState(null);
  const [salvo, setSalvo] = useState(true);
  const H = useRef({ past: [], fut: [], t: 0 });
  const [, tick] = useState(0);

  // estado com histórico para desfazer/refazer (mudanças de navegação não entram)
  const setSt = useCallback(upd => setSt0(prev => {
    const next = typeof upd === 'function' ? upd(prev) : upd;
    if (next === prev) return prev;
    if (Object.keys(next).some(k => next[k] !== prev[k] && !UI_KEYS.has(k))) {
      const h = H.current, now = Date.now();
      if ((now - h.t > 700 || !h.past.length) && h.past[h.past.length - 1] !== prev) { h.past.push(prev); if (h.past.length > 80) h.past.shift(); }
      h.t = now; h.fut = [];
    }
    return next;
  }), []);
  const desfazer = useCallback(() => setSt0(cur => { const h = H.current; if (!h.past.length) return cur; const p = h.past.pop(); h.fut.push(cur); h.t = 0; return { ...p, sec: cur.sec, real: cur.real, prodSel: Math.min(cur.prodSel, p.produtos.length - 1) }; }), []);
  const refazer = useCallback(() => setSt0(cur => { const h = H.current; if (!h.fut.length) return cur; const n = h.fut.pop(); h.past.push(cur); h.t = 0; return { ...n, sec: cur.sec, real: cur.real, prodSel: Math.min(cur.prodSel, n.produtos.length - 1) }; }), []);
  useEffect(() => { tick(x => x + 1); }, [st]);

  const set = useCallback(p => setSt(s => ({ ...s, ...(typeof p === 'function' ? p(s) : p) })), []);
  const setProd = useCallback(p => setSt(s => { const i = Math.min(s.prodSel, s.produtos.length - 1); return { ...s, produtos: s.produtos.map((x, j) => j === i ? { ...x, ...p } : x) }; }), []);
  const setE = useCallback(p => setSt(s => ({ ...s, estudo: { ...s.estudo, ...p } })), []);
  const setL = useCallback(p => setSt(s => ({ ...s, listas: { ...s.listas, ...p } })), []);
  const setReal = useCallback(p => setSt0(s => ({ ...s, real: { ...s.real, ...p } })), []);
  const replaceSt = useCallback(fn => setSt(s => fn(s)), []);

  // salvamento automático
  const primeiro = useRef(true);
  useEffect(() => {
    if (primeiro.current) { primeiro.current = false; return; }
    setSalvo(false);
    const t = setTimeout(() => { const okW = STORE.save({ ...st, atualizado: Date.now() }); setSalvo(okW ? true : 'erro'); if (!okW) toast('Não foi possível salvar: armazenamento do navegador cheio. Exporte um backup e remova estudos antigos.', true); }, 500);
    return () => clearTimeout(t);
  }, [st]);
  const sujo = useRef(false); useEffect(() => { sujo.current = salvo !== true; }, [salvo]);
  useEffect(() => { const f = () => { if (sujo.current) STORE.save({ ...stRef.current, atualizado: Date.now() }); }; window.addEventListener('beforeunload', f); return () => { window.removeEventListener('beforeunload', f); f(); }; }, []);

  // imagens: capa por produto
  const setCapa = (prodId, key) => setSt(s => ({ ...s, produtos: s.produtos.map(p => p.id === prodId ? { ...p, capa: key } : p) }));
  const addImgE = async im => { const key = await addImg(im); setSt(s => ({ ...s, produtos: s.produtos.map(p => p.id === im.prodId && !p.capa ? { ...p, capa: key } : p) })); };
  const delImgE = async key => { await delImg(key); setSt(s => ({ ...s, produtos: s.produtos.map(p => p.capa === key ? { ...p, capa: null } : p) })); };
  const capas = useMemo(() => Object.fromEntries(st.produtos.map(p => [p.id, (imgs.find(i => i.key === p.capa) || {}).url])), [st.produtos, imgs]);

  // dados reais (APIs públicas)
  const real = st.real || {};
  const busyRef = useRef(false); const stRef = useRef(st); stRef.current = st;
  const carregarReais = useCallback(async (forcar, endereco) => {
    if (busyRef.current) return; busyRef.current = true;
    const erros = {}; const R = { ...(stRef.current.real || {}) };
    const step = m => setStatus({ busy: true, msg: m });
    try {
      if (forcar || !R.macro || Date.now() - R.macro.em > 6 * 3600e3) { step('Consultando Banco Central…'); try { R.macro = await API.macro(); setReal({ macro: R.macro }); } catch (e) { erros[0] = 'falhou'; } }
      const end = endereco ?? stRef.current.estudo.endereco;
      if (end && end.trim().length > 5 && (forcar || !R.geo || R.geo.q !== end)) {
        step('Localizando endereço…');
        try { R.geo = { ...(await API.geocode(end)), q: end }; R.ibge = R.sinapi = R.elev = R.pois = null; setReal({ geo: R.geo, ibge: null, sinapi: null, elev: null, pois: null }); } catch (e) { erros[1] = 'não encontrado'; setStatus({ busy: false, msg: e.message, err: true, erros }); return; }
      }
      if (R.geo) {
        const g = R.geo; step('Consultando IBGE, SINAPI e altimetria…');
        const [ib, si, el] = await Promise.allSettled([R.ibge && !forcar ? R.ibge : API.ibge(g.cidade, g.uf), R.sinapi && !forcar ? R.sinapi : API.sinapi(g.uf), R.elev && !forcar ? R.elev : API.elevacao(g.lat, g.lon)]);
        const pat = {}; if (ib.status === 'fulfilled') pat.ibge = ib.value; else erros[2] = 'falhou'; if (si.status === 'fulfilled') pat.sinapi = si.value; else erros[3] = 'falhou'; if (el.status === 'fulfilled') pat.elev = el.value; else erros[4] = 'falhou';
        setReal(pat);
        if (forcar || !R.pois) { try { const p = await API.pois(g.lat, g.lon, 1000, step); setReal({ pois: p }); } catch (e) { erros[5] = 'indisponível'; } }
      }
      const n = Object.keys(erros).length;
      setStatus({ busy: false, msg: n ? n + ' fonte(s) não responderam; tente “Atualizar dados reais” em instantes.' : '', err: n > 0, erros });
      if (endereco && !n) toast('Endereço localizado e dados públicos atualizados.');
    } finally { busyRef.current = false; }
  }, []);
  useEffect(() => { carregarReais(false); }, []);
  const localizar = () => carregarReais(false, stRef.current.estudo.endereco);

  // modelo calculado (adiado durante arrastos para manter a interface fluida)
  const stD = useDeferredValue(st);
  const M = useMemo(() => compute(stD), [stD]);
  const abrirCopilot = () => { setCp(true); lsSet('predic3-cp', true); };
  const perguntar = (texto, op = {}) => { abrirCopilot(); setFila({ texto, web: !!op.web, id: uid() }); };
  const ctx = { printAll, st, set, setProd, setE, setL, setSt, replaceSt, M, real, status, carregarReais, localizar, imgs, addImg: addImgE, delImg: delImgE, setCapa, capas, ai, estudoId: st.id, perguntar, abrirCopilot, abrirIA: setModalIA };

  // atalhos de teclado
  useEffect(() => {
    const k = e => {
      const tag = (e.target.tagName || '').toLowerCase(), edit = (tag === 'input' && !/^(range|checkbox|radio|button|file)$/.test(e.target.type)) || tag === 'textarea' || e.target.isContentEditable;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && !edit && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? refazer() : desfazer(); }
      else if (mod && !edit && e.key.toLowerCase() === 'y') { e.preventDefault(); refazer(); }
      else if (mod && e.key.toLowerCase() === 'i') { e.preventDefault(); setCp(c => { lsSet('predic3-cp', !c); return !c; }); }
      else if (mod && e.key.toLowerCase() === 'p') { e.preventDefault(); imprimir(); }
    };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, []);

  // planilha e backup
  const fileRef = useRef();
  const importar = e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; f.arrayBuffer().then(buf => { try { const r = importarPlanilha(buf, stRef.current); setSt(s => ({ ...r.st, id: s.id, criado: s.criado, ia: s.ia })); toast('Planilha importada' + (r.avisos.length ? ' · atenção: ' + r.avisos.join('; ') : '.'), r.avisos.length > 0); setTimeout(() => carregarReais(false, r.st.estudo.endereco), 50); } catch (err) { toast('Não foi possível importar: ' + err.message, true); } }); };
  const exportar = () => { try { exportarPlanilha(stRef.current); toast('Planilha baixada com todos os dados do estudo.'); } catch (e) { toast(e.message, true); } };
  const imprimir = () => {
    const tema = document.documentElement.dataset.theme; document.documentElement.dataset.theme = 'light';
    setPrintAll(true);
    setTimeout(() => { window.print(); }, 900);
    const fim = () => { setPrintAll(false); if (tema) document.documentElement.dataset.theme = tema; else delete document.documentElement.dataset.theme; window.removeEventListener('afterprint', fim); };
    window.addEventListener('afterprint', fim);
  };

  const idx = Math.max(0, SECS.findIndex(s => s[0] === st.sec));
  const VIEWS = { painel: Painel, local: Local, legis: Legis, mercado: Mercado, produto: Produto, orcamento: Orcamento, financeiro: Financeiro, sensibilidade: Sensib, conclusao: Conclusao };
  const lista = printAll ? SECS : [SECS[idx]];
  const porProduto = s => !['local', 'legis', 'mercado'].includes(s);
  const ir = k => { set({ sec: k }); setMenu(false); window.scrollTo(0, 0); };
  const h = H.current;
  useSync();
  const sync = perfil ? SYNC.status(st.id) : 'ok';
  const conflito = sync === 'conflito' ? SYNC.conflitos[st.id] : null;
  const salvoTxt = salvo === 'erro' ? ['cr', 'Erro ao salvar'] : salvo !== true ? ['at', 'Salvando…'] : !perfil ? ['ok', 'Salvo neste navegador'] : sync === 'ok' ? ['ok', 'Salvo no servidor'] : sync === 'enviando' ? ['at', 'Sincronizando…'] : sync === 'offline' ? ['cr', 'Sem conexão · salvo neste navegador'] : sync === 'conflito' ? ['cr', 'Conflito de edição'] : ['cr', 'Não sincronizado'];

  return html`<div className="app">
    <div className="mobbar noprint"><button onClick=${() => setMenu(true)} aria-label="Menu"><${Icon} n="menu" /></button><div style=${{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}><${Marca} s=${24} /><b>PREDIC</b></div><button onClick=${() => setCp(c => !c)} aria-label="Assistente"><${Icon} n="ia" /></button></div>
    <div className=${'scrim' + (menu ? ' open' : '')} onClick=${() => setMenu(false)}></div>
    <aside className=${'side noprint' + (menu ? ' open' : '')}>
      <div className="brand">
        ${cfg.logo ? html`<div className="sidelogo"><img src=${cfg.logo} alt=${cfg.empresa || ''} /><span className="by"><${Marca} s=${14} />PREDIC</span></div>` : html`<${Logo} s=${30} sub=${cfg.empresa ? cfg.empresa.slice(0, 26) : 'Viabilidade imobiliária'} claro=${true} />`}
        <button className="studysw" onClick=${voltar} title="Voltar à biblioteca de estudos">
          <${Icon} n="grid" s=${15} style=${{ color: 'var(--sidemute)' }} />
          <div style=${{ minWidth: 0, flex: 1 }}><b>${st.estudo.nome || 'Estudo sem nome'}</b><span>${st.estudo.codigo}${real.ibge ? ' · ' + real.ibge.nome + '/' + real.ibge.uf : ''}</span></div>
        </button>
        <div className="tags">
          ${st.exemplo ? html`<span className="tag ex" title="Premissas do projeto são de exemplo; indicadores de mercado e localização são reais">EXEMPLO</span>` : null}
          ${real.macro ? html`<span className="tag real" title=${'Banco Central e IBGE · ' + horaBR(real.macro.em)}>DADOS REAIS</span>` : null}
          ${ai?.ai ? html`<span className="tag ia" title=${'Claude · ' + ai.model}>IA ATIVA</span>` : null}
        </div>
      </div>
      <nav>${SECS.map(([k, l], i) => html`<button key=${k} className=${'nav' + (st.sec === k ? ' on' : '')} onClick=${() => ir(k)}><${Icon} n=${k} /><span>${l}</span><span className="n">${String(i + 1).padStart(2, '0')}</span></button>`)}</nav>
      <div className="sidefoot">
        <div className="vcard"><div className="k-mono">Parecer automático · ${M.PR.nome}</div><div className="verdict"><i style=${{ background: M.verdict[1] }}></i>${M.verdict[0]}</div><p>${M.verdict[2]}</p></div>
        <button className="sbtn pri" onClick=${imprimir}><${Icon} n="print" s=${15} />Relatório completo (PDF)</button>
        <div className="sgrid"><button className="sbtn" onClick=${() => fileRef.current.click()}><${Icon} n="up" s=${14} />Importar</button><button className="sbtn" onClick=${exportar}><${Icon} n="down" s=${14} />Planilha</button></div>
        <input type="file" ref=${fileRef} accept=".xlsx,.xls" style=${{ display: 'none' }} onChange=${importar} />
      </div>
    </aside>
    <div className="main">
      <main className="content">
        <div className="topbar noprint">
          <div className=${'saved s-' + salvoTxt[0]} title=${perfil ? 'Estudo compartilhado com a equipe da ' + perfil.empresa.nome : ''}><i></i>${salvoTxt[1]}</div>
          <span className="sp"></span>
          <button className="iconbtn" title="Desfazer (Ctrl+Z)" disabled=${!h.past.length} onClick=${desfazer}><${Icon} n="undo" /></button>
          <button className="iconbtn" title="Refazer (Ctrl+Y)" disabled=${!h.fut.length} onClick=${refazer}><${Icon} n="redo" /></button>
          <button className="iconbtn" title="Alternar tema" onClick=${alternarTema}><${Icon} n=${document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches) ? 'sun' : 'moon'} /></button>
          <${Menu} button=${t => html`<button className="iconbtn" title="Mais opções" onClick=${t}><${Icon} n="more" /></button>`}>
            <button onClick=${voltar}><${Icon} n="grid" />Biblioteca de estudos</button>
            <button onClick=${imprimir}><${Icon} n="print" />Imprimir relatório (Ctrl+P)</button>
            <hr />
            <button onClick=${() => fileRef.current.click()}><${Icon} n="up" />Importar planilha (.xlsx)</button>
            <button onClick=${exportar}><${Icon} n="down" />Exportar planilha (.xlsx)</button>
            <button onClick=${() => exportarBackup([stRef.current])}><${Icon} n="down" />Exportar backup do estudo (.json)</button>
            <hr />
            <button onClick=${() => { const n = STORE.novo({ ...stRef.current, id: undefined, estudo: { ...stRef.current.estudo, nome: stRef.current.estudo.nome + ' (cópia)' } }); toast('Cópia criada na biblioteca: ' + n.estudo.nome); }}><${Icon} n="copy" />Duplicar estudo</button>
            <button onClick=${() => abrirConfig()}><${Icon} n="gear" />Configurações</button>
          <//>
          <${MenuUsuario} perfil=${perfil} onConfig=${abrirConfig} onSair=${sair} compacto=${true} />
          <button className=${'aibtn' + (cp ? ' on' : '')} onClick=${() => { setCp(c => { lsSet('predic3-cp', !c); return !c; }); }} title="Assistente de IA (Ctrl+I)"><${Icon} n="ia" />Assistente IA</button>
        </div>
        ${printAll ? html`<${CapaRelatorio} st=${st} M=${M} cfg=${cfg} real=${real} />` : null}
        ${lista.map(([k, l], j) => { const V = VIEWS[k]; const i = SECS.findIndex(s => s[0] === k); return html`<section key=${k} className=${'sec' + (j === 0 && !printAll ? ' first' : '')}>
          <div className="head">
            <div><div className="eyebrow">${String(i + 1).padStart(2, '0')} · ${cfg.empresa ? cfg.empresa + ' · ' : ''}${st.estudo.nome || ''}${porProduto(k) ? ' · ' + M.PR.nome : ''}</div><h1>${l}</h1></div>
            ${porProduto(k) && st.produtos.length > 1 && !printAll ? html`<${ProdTabs} ctx=${ctx} />` : null}
          </div>
          <${V} ctx=${ctx} />
        </section>`; })}
        ${!printAll ? html`<div className="noprint" style=${{ display: 'flex', justifyContent: 'space-between', marginTop: 26, gap: 10 }}>
          ${idx > 0 ? html`<button className="btn" onClick=${() => ir(SECS[idx - 1][0])}>← ${SECS[idx - 1][1]}</button>` : html`<span></span>`}
          ${idx < SECS.length - 1 ? html`<button className="btn pri" onClick=${() => ir(SECS[idx + 1][0])}>${SECS[idx + 1][1]} →</button>` : null}
        </div>` : null}
      </main>
      ${cp ? html`<${Copilot} ctx=${ctx} onClose=${() => { setCp(false); lsSet('predic3-cp', false); }} fila=${fila} consumir=${() => setFila(null)} />` : null}
    </div>
    ${modalIA === 'extracao' ? html`<${ExtracaoModal} ctx=${ctx} onClose=${() => setModalIA(null)} />` : null}
    ${modalIA === 'produtos' ? html`<${ProdutosModal} ctx=${ctx} onClose=${() => setModalIA(null)} />` : null}
    ${conflito ? html`<${ConflitoModal} st=${st} atual=${conflito} recarregar=${recarregar} />` : null}
  </div>`;
}

/* ============================ raiz ============================ */
function App() {
  const [cfg, setCfg0] = useState(() => ({ ...CFG0, ...lsGet(CFG_KEY, {}) }));
  const setCfg = c => { setCfg0(c); lsSet(CFG_KEY, c); aplicarTema(c.tema); };
  // fases: carregando → entrada (login/primeiro acesso) → senha (troca obrigatória) → pronto; "local" quando aberto sem servidor
  const [fase, setFase] = useState('carregando');
  const [status, setStatus] = useState({});
  const [perfil, setPerfil0] = useState(null);
  const [aberto, setAberto] = useState(null), [nonce, setNonce] = useState(0);
  const [ai, setAi] = useState({ ai: false, motivo: '' });
  const [imgs, setImgs] = useState([]);
  const [cfgOpen, setCfgOpen] = useState(false);
  const setPerfil = p => { MODO.perfil = p; setPerfil0(p); };
  const recarregarIA = () => AI.status().then(setAi);
  const abrirHash = () => { const id = new URLSearchParams(location.hash.slice(1)).get('estudo'); if (id) abrir(id, true); };
  const entrar = p => { setPerfil(p); SYNC.iniciar(p.empresa.id); setFase(p.usuario.trocarSenha ? 'senha' : 'pronto'); recarregarIA(); if (!p.usuario.trocarSenha) abrirHash(); };
  const paraEntrada = () => { setPerfil(null); setAberto(null); setFase('entrada'); SRV.get('/api/status').then(setStatus).catch(() => { }); };
  useEffect(() => {
    aplicarTema(cfg.tema); IDB.all().then(l => setImgs(l.map(x => ({ ...x, url: x.blob ? URL.createObjectURL(x.blob) : x.url }))));
    const local = () => { migrarV2(); setFase('local'); recarregarIA(); abrirHash(); };
    if (!MODO.servidor) { local(); return; }
    SRV.get('/api/status').then(async s => { setStatus(s); if (s.sessao) entrar(await SRV.get('/api/auth/eu')); else setFase('entrada'); })
      .catch(e => { if (e.offline || e.status === 404) local(); else { toast(e.message, true); setFase('entrada'); } });
    // sessão expirada em qualquer chamada: volta para a tela de entrada sem perder o que está pendente de envio
    const exp = () => { if (MODO.perfil) { toast('Sua sessão expirou. Entre novamente; nada do que foi editado se perdeu.', true); paraEntrada(); } };
    SRV.ouvintes.add(exp); return () => SRV.ouvintes.delete(exp);
  }, []);
  useEffect(() => { const t = aberto ? (aberto.estudo.nome || 'Estudo') + ' · PREDIC' : 'PREDIC · Viabilidade imobiliária'; document.title = t; if (fase === 'pronto' || fase === 'local') history.replaceState(null, '', aberto ? '#estudo=' + aberto.id : location.pathname + location.search); }, [aberto && aberto.id, fase]);
  const sair = async () => {
    const n = SYNC.pendentes().length;
    if (n && !confirmar(n + ' estudo(s) ainda não foram enviados ao servidor e serão perdidos se você sair agora. Sair mesmo assim?')) return;
    try { await SRV.post('/api/auth/logout'); } catch (e) { }
    SYNC.limpar(); paraEntrada();
  };
  const addImg = async im => { const key = 'img-' + Date.now() + '-' + uid(); await IDB.put(key, im); setImgs(l => l.concat([{ ...im, key, url: im.blob ? URL.createObjectURL(im.blob) : im.url }])); return key; };
  const delImg = async key => { await IDB.del(key); setImgs(l => l.filter(x => x.key !== key)); };
  async function abrir(id, silencioso) {
    if (MODO.perfil) { try { await SYNC.garantir(id); } catch (e) { if (!STORE.load(id)) { if (!silencioso) toast('Não foi possível abrir o estudo: ' + e.message, true); return; } toast('Sem conexão com o servidor: abrindo a cópia deste navegador.', true); } }
    const s = STORE.load(id); if (s) { setAberto(s); window.scrollTo(0, 0); } else if (!silencioso) toast('Estudo não encontrado.', true);
  }
  const recarregar = id => { const s = STORE.load(id); if (s) { setAberto(s); setNonce(n => n + 1); } };
  const novoEstudo = tipo => { const b = tipo === 'exemplo' ? estudoExemplo() : estudoVazio(); const s = STORE.novo(b); setAberto(s); if (tipo !== 'exemplo') toast('Estudo em branco criado. Comece pelo endereço em Localização.'); };
  const importarArquivo = async f => {
    try {
      if (/\.json$/i.test(f.name)) { const l = lerBackup(await f.text()); toast(l.length + ' estudo(s) importado(s).'); if (l.length === 1) setAberto(l[0]); return; }
      const r = importarPlanilha(await f.arrayBuffer(), estudoVazio()); const s = STORE.novo(r.st); toast('Planilha importada' + (r.avisos.length ? ' · atenção: ' + r.avisos.join('; ') : '.'), r.avisos.length > 0); setAberto(s);
    } catch (e) { toast('Não foi possível importar: ' + e.message, true); }
  };
  const alternarTema = () => { const escuro = document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches); setCfg({ ...cfg, tema: escuro ? 'claro' : 'escuro' }); };
  // com conta, empresa, logotipo e responsável vêm do servidor
  const cfgEf = perfil ? { ...cfg, empresa: perfil.empresa.nome, logo: perfil.empresa.logo, analista: perfil.usuario.nome, cargo: perfil.usuario.cargo } : cfg;
  const abrirConfig = aba => setCfgOpen(aba || true);

  if (fase === 'carregando') return html`<div className="splash"><${Marca} s=${56} /><span className="spin"></span></div>`;
  if (fase === 'entrada') return html`<${React.Fragment}><${Entrada} status=${status} onEntrou=${entrar} /><${Toasts} /><//>`;
  if (fase === 'senha') return html`<${React.Fragment}><${TrocarSenha} perfil=${perfil} onPronto=${p => { setPerfil(p); setFase('pronto'); }} onSair=${sair} /><${Toasts} /><//>`;
  return html`<${React.Fragment}>
    ${aberto ? html`<${Estudio} key=${aberto.id + ':' + nonce} inicial=${aberto} cfg=${cfgEf} ai=${ai} perfil=${perfil} imgs=${imgs} addImg=${addImg} delImg=${delImg} setImgs=${setImgs} recarregarIA=${recarregarIA} alternarTema=${alternarTema}
        voltar=${() => setAberto(null)} abrirConfig=${abrirConfig} sair=${sair} recarregar=${recarregar} />`
      : html`<${Biblioteca} cfg=${cfgEf} perfil=${perfil} imgs=${imgs} abrir=${abrir} novoEstudo=${novoEstudo} importarArquivo=${importarArquivo} abrirConfig=${abrirConfig} sair=${sair} />`}
    ${cfgOpen ? html`<${ConfigModal} cfg=${cfg} setCfg=${setCfg} ai=${ai} perfil=${perfil} setPerfil=${setPerfil} aba0=${typeof cfgOpen === 'string' ? cfgOpen : null} onSair=${sair} onClose=${() => { setCfgOpen(false); aplicarTema(cfg.tema); }} />` : null}
    ${perfil && !perfil.usuario.termos ? html`<${AceiteTermos} onPronto=${setPerfil} onSair=${sair} />` : null}
    <${Toasts} />
  <//>`;
}

class Boundary extends React.Component {
  constructor(p) { super(p); this.state = { e: null }; }
  static getDerivedStateFromError(e) { return { e }; }
  componentDidCatch(e, info) { console.error('[PREDIC]', e, info); }
  render() {
    if (!this.state.e) return this.props.children;
    return html`<div style=${{ padding: 40, maxWidth: 640, margin: '0 auto' }}><h1>Algo deu errado</h1><p className="note" style=${{ margin: '10px 0' }}>${String(this.state.e.message || this.state.e)}</p>
      <p className="sub" style=${{ marginBottom: 14 }}>Seus estudos continuam salvos.</p>
      <div style=${{ display: 'flex', gap: 8 }}><button className="btn pri" onClick=${() => { location.hash = ''; location.reload(); }}>Voltar à biblioteca</button></div></div>`;
  }
}
if (!window.React || !window.htm) document.getElementById('root').innerHTML = '<div style="padding:40px;font:14px sans-serif">Não foi possível carregar as bibliotecas do PREDIC. Recarregue a página.</div>';
else ReactDOM.createRoot(document.getElementById('root')).render(html`<${Boundary}><${App} /><//>`);
