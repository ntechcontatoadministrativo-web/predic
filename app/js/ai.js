'use strict';
/* PREDIC · IA integrada: cliente do servidor, assistente com ferramentas, leitura de documentos, produtos, parecer e auditoria */

/* ============================ cliente ============================ */
const AI = {
  // a sessão vai no cookie; o cabeçalho x-predic protege contra requisições forjadas por outros sites
  headers: () => ({ 'Content-Type': 'application/json', 'x-predic': '1' }),
  falha(r, j) { if (r.status === 401) SRV.ouvintes.forEach(f => f()); return new Error(j.erro || 'Falha na IA (HTTP ' + r.status + ')'); },
  async status() {
    if (location.protocol === 'file:') return { ai: false, motivo: 'arquivo' };
    try { const r = await fetch('/api/status', { cache: 'no-store' }); if (!r.ok) throw 0; const j = await r.json(); return { ...j, motivo: j.ai ? '' : 'chave' }; } catch (e) { return { ai: false, motivo: 'servidor' }; }
  },
  async stream(rota, body, onEvent, signal) {
    const r = await fetch(rota, { method: 'POST', headers: AI.headers(), body: JSON.stringify(body), signal });
    if (!r.ok) { const j = await r.json().catch(() => ({})); throw AI.falha(r, j); }
    const rd = r.body.getReader(), dec = new TextDecoder(); let buf = '', fim = null;
    for (;;) {
      const { value, done } = await rd.read(); if (done) break;
      buf += dec.decode(value, { stream: true }); let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const bloco = buf.slice(0, i); buf = buf.slice(i + 2);
        for (const ln of bloco.split('\n')) {
          if (!ln.startsWith('data: ')) continue;
          const ev = JSON.parse(ln.slice(6));
          if (ev.t === 'done') fim = ev; else if (ev.t === 'error') throw new Error(ev.msg); else onEvent(ev);
        }
      }
    }
    if (!fim) throw new Error('A conexão com a IA caiu antes do fim da resposta. Tente de novo.');
    return fim;
  },
  async json(tarefa, body) {
    const r = await fetch('/api/ai/json', { method: 'POST', headers: AI.headers(), body: JSON.stringify({ tarefa, ...body }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw AI.falha(r, j);
    return j.dados;
  }
};
const MOTIVO_IA = {
  arquivo: 'O PREDIC foi aberto direto do arquivo. Para usar a IA, inicie o servidor (iniciar.bat ou "npm start") e acesse http://localhost:8787.',
  servidor: 'O servidor do PREDIC não respondeu. Verifique se ele está rodando.',
  chave: 'A IA ainda não foi configurada no servidor. Defina ANTHROPIC_API_KEY no arquivo .env e reinicie.'
};
const lerArquivo = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res({ name: f.name, media_type: f.type || (/\.pdf$/i.test(f.name) ? 'application/pdf' : 'text/plain'), data: String(r.result).split(',')[1], size: f.size }); r.onerror = () => rej(r.error); r.readAsDataURL(f); });
const ACEITOS = '.pdf,.png,.jpg,.jpeg,.webp,.gif,.txt,.csv,.md';
const hashStr = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = (h * 33 ^ s.charCodeAt(i)) >>> 0; return s.length + ':' + h; };
function IASemAcesso({ ai, compacto }) {
  return html`<div className="alert na" style=${{ display: 'flex', gap: 10, alignItems: 'flex-start' }}><${Icon} n="alert" s=${16} style=${{ marginTop: 1, color: 'var(--y)' }} /><div><strong>IA indisponível.</strong> ${MOTIVO_IA[ai?.motivo] || MOTIVO_IA.servidor}${compacto ? '' : html`<div className="sub" style=${{ marginTop: 4 }}>Os cálculos, mapas e dados públicos continuam funcionando normalmente.</div>`}</div></div>`;
}

/* ============================ ferramentas do assistente ============================ */
const LISTAS_IA = { riscosMercado: 'riscos de mercado', condicionantes: 'condicionantes para aprovação', pareceres: 'parecer jurídico', condUrb: 'condicionantes de urbanização' };
const CONFIRMA = ['aplicar_alteracoes', 'adicionar_registros', 'adicionar_concorrentes', 'registrar_parecer'];
function descreverFerramenta(nome, inp) {
  const i = inp || {}; const alts = a => (a || []).filter(x => AI_VARS[x?.variavel]).map(x => AI_VARS[x.variavel][0].toLowerCase() + ' → ' + fmtVar(x.variavel, +x.valor)).join(', ');
  switch (nome) {
    case 'simular_cenario': return ['sliders', 'Simulou: ' + (alts(i.alteracoes) || 'cenário')];
    case 'buscar_meta': return ['target', 'Buscou ' + (AI_VARS[i.variavel]?.[0] || 'valor').toLowerCase() + ' para ' + (i.indicador === 'vpl' ? 'VPL de ' + milhoes(i.alvo) : (i.indicador || '').toUpperCase() + ' de ' + num(i.alvo, 1) + '%')];
    case 'aplicar_alteracoes': return ['sliders', 'Propôs alterar: ' + (alts(i.alteracoes) || '—')];
    case 'adicionar_registros': return ['plus', 'Propôs ' + (i.itens?.length || 0) + ' item(ns) em ' + (LISTAS_IA[i.lista] || 'lista')];
    case 'adicionar_concorrentes': return ['building', 'Propôs ' + (i.itens?.length || 0) + ' concorrente(s)'];
    case 'registrar_parecer': return ['doc', 'Propôs texto para as recomendações finais'];
    case 'navegar': return ['grid', 'Abriu ' + ((SECS.find(s => s[0] === i.secao) || [])[1] || 'seção')];
    default: return ['spark', nome];
  }
}
const validaAlts = a => Array.isArray(a) && a.length > 0 && a.every(x => x && AI_VARS[x.variavel] && ok(+x.valor));
// Executa ferramentas sem confirmação; devolve null quando a ferramenta exige confirmação do usuário.
function executarDireto(u, st, api) {
  const i = u.input || {};
  if (u.name === 'simular_cenario') return validaAlts(i.alteracoes) ? simularVars(st, i.alteracoes) : { erro: 'alteracoes inválidas: use [{variavel, valor}] com valores absolutos.' };
  if (u.name === 'buscar_meta') return AI_VARS[i.variavel] && ['tir', 'margem', 'vpl'].includes(i.indicador) && ok(+i.alvo) ? buscarMeta(st, i.variavel, i.indicador, +i.alvo) : { erro: 'parâmetros inválidos' };
  if (u.name === 'navegar') { if (!SECS.some(s => s[0] === i.secao)) return { erro: 'seção inexistente' }; api.set({ sec: i.secao }); return { ok: true, secao: i.secao }; }
  if (!CONFIRMA.includes(u.name)) return { erro: 'ferramenta desconhecida' };
  return null;
}
function validarConfirmavel(u) {
  const i = u.input || {};
  if (u.name === 'aplicar_alteracoes') return validaAlts(i.alteracoes);
  if (u.name === 'adicionar_registros') return LISTAS_IA[i.lista] && Array.isArray(i.itens) && i.itens.length && i.itens.every(x => x && typeof x.texto === 'string');
  if (u.name === 'adicionar_concorrentes') return Array.isArray(i.itens) && i.itens.length && i.itens.every(x => x && typeof x.nome === 'string');
  if (u.name === 'registrar_parecer') return typeof i.texto === 'string' && i.texto.trim().length > 0;
  return false;
}
// Aplica uma ferramenta confirmada ao estudo (função pura sobre o estado).
function aplicarConfirmada(u, s) {
  const i = u.input;
  if (u.name === 'aplicar_alteracoes') return aplicarVars(s, i.alteracoes).st;
  if (u.name === 'adicionar_registros') {
    const nv = i.itens.map(x => i.lista === 'condicionantes' ? { id: uid(), t: x.texto } : i.lista === 'condUrb' ? { id: uid(), grupo: 'Condicionantes', t: x.texto, v: x.valor || '', k: x.nivel || 'at' } : { id: uid(), t: x.texto, v: x.valor || '', k: x.nivel || 'at' });
    return { ...s, listas: { ...s.listas, [i.lista]: (s.listas[i.lista] || []).concat(nv) } };
  }
  if (u.name === 'adicionar_concorrentes') return { ...s, concs: s.concs.concat(i.itens.map(c => ({ id: uid(), nome: c.nome, tipo: c.tipo || '', padrao: c.padrao || '', m2: +c.m2 || 0, ticket: +c.ticket || 0, vso: +c.vso || 0, estoque: +c.estoque || 0 }))) };
  if (u.name === 'registrar_parecer') return { ...s, notas: i.modo === 'acrescentar' && s.notas ? s.notas.trim() + '\n\n' + i.texto : i.texto };
  return s;
}
function DetalheConfirma({ u, st }) {
  const i = u.input;
  if (u.name === 'aplicar_alteracoes') {
    const { st: s2, feitas } = aplicarVars(st, i.alteracoes); const a = quick(st), b = quick(s2);
    const lin = (l, x, y) => html`<tr><td>${l}</td><td className="num">${x}</td><td className="num" style=${{ fontWeight: 600 }}>${y}</td></tr>`;
    return html`<div>${i.justificativa ? html`<div className="sub" style=${{ marginBottom: 6 }}>${i.justificativa}</div>` : null}<table><tbody>
      ${descreverFeitas(feitas).map((f, k) => html`<tr key=${k}><td>${f.variavel}</td><td className="num">${f.de}</td><td className="num" style=${{ fontWeight: 600 }}>${f.para}</td></tr>`)}
      ${lin('TIR', pct(a.R.tir), pct(b.R.tir))}${lin('Margem', pct(a.R.margem), pct(b.R.margem))}${lin('Exposição', milhoes(Math.abs(a.R.expo)), milhoes(Math.abs(b.R.expo)))}${lin('Veredito', a.veredito, b.veredito)}
    </tbody></table></div>`;
  }
  if (u.name === 'adicionar_registros') return html`<ul style=${{ paddingLeft: 18, fontSize: 12 }}>${i.itens.map((x, k) => html`<li key=${k}>${x.texto}${x.valor ? html` <span className="sub">(${x.valor})</span>` : null}</li>`)}</ul>`;
  if (u.name === 'adicionar_concorrentes') return html`<div className="tblwrap"><table><thead><tr><th>EMPREENDIMENTO</th><th className="num">R$/M²</th><th className="num">TICKET</th><th className="num">ESTOQUE</th></tr></thead><tbody>${i.itens.map((c, k) => html`<tr key=${k}><td>${c.nome}<div className="sub">${[c.tipo, c.padrao, c.fonte].filter(Boolean).join(' · ')}</div></td><td className="num">${num(c.m2)}</td><td className="num">${c.ticket ? num(c.ticket) + ' mil' : '—'}</td><td className="num">${c.estoque || '—'}</td></tr>`)}</tbody></table></div>`;
  if (u.name === 'registrar_parecer') return html`<div className="md" style=${{ maxHeight: 180, overflowY: 'auto', fontSize: 12 }}><${Md} text=${i.texto} /></div>`;
  return null;
}

/* ============================ assistente (painel lateral) ============================ */
function sugestoesPara(st) {
  const E = st.estudo, base = ['Resuma a viabilidade deste estudo para o comitê em 5 linhas.', 'Quais premissas parecem otimistas demais e por quê?', 'Qual o preço mínimo por m² para atingir a TIR mínima do comitê?', 'Como reduzir a exposição de caixa sem perder margem?'];
  const por = {
    local: ['O que o entorno e a altimetria dizem sobre o terreno?', 'Que condicionantes de urbanização devo prever para este lote?'],
    legis: ['Quais itens jurídicos impedem a escritura e como resolvê-los?', 'Monte o caminho crítico de aprovação e o prazo realista até o registro.'],
    mercado: ['Pesquise na web lançamentos concorrentes perto de ' + (E.endereco || 'meu terreno') + '.', 'O preço adotado é competitivo frente à concorrência e à renda local?'],
    produto: ['O mix de unidades está adequado à demanda? Sugira ajustes e simule.', 'Vale a pena incluir unidades em permuta física? Compare com a permuta financeira.'],
    orcamento: ['O custo de obra está coerente com o SINAPI e o padrão?', 'Compare autofinanciamento com plano empresário para este produto.'],
    financeiro: ['Explique por que a TIR e o VPL estão nesse patamar.', 'O que acontece se os juros subirem 2 p.p. e a VSO cair 20%?'],
    sensibilidade: ['Qual variável mais ameaça a viabilidade e como me proteger dela?'],
    conclusao: ['Redija as condicionantes de aprovação para o comitê e grave no estudo.']
  };
  return (por[st.sec] || []).concat(base).slice(0, 6);
}
function Copilot({ ctx, onClose, fila, consumir }) {
  const { st, M, real, ai, estudoId } = ctx;
  const [hist, setHist] = useState([]); const [pronto, setPronto] = useState(false);
  const [vivo, setVivo] = useState(null); const [pend, setPend] = useState(null);
  const [web, setWeb] = useState(false); const [txt, setTxt] = useState(''); const [anex, setAnex] = useState([]);
  const [busy, setBusy] = useState(false); const [erro, setErro] = useState('');
  const webRef = useRef(false); webRef.current = web;
  const abortRef = useRef(null), corpo = useRef(), ultimoCtx = useRef(null), stRef = useRef(st), mRef = useRef(M), realRef = useRef(real), ctxRef = useRef(ctx), taRef = useRef();
  stRef.current = st; mRef.current = M; realRef.current = real; ctxRef.current = ctx;

  useEffect(() => { let vivoE = true; setPronto(false); setHist([]); setVivo(null); setPend(null); setErro('');
    IDB.get(estudoId, 'chat').then(d => { if (!vivoE) return; setHist(d?.hist || []); ultimoCtx.current = d?.ctx || null; setPronto(true); });
    return () => { vivoE = false; abortRef.current && abortRef.current.abort(); }; }, [estudoId]);
  const salvar = h => { setHist(h); IDB.put(estudoId, { hist: h, ctx: ultimoCtx.current, em: Date.now() }, 'chat'); };
  useEffect(() => { const el = corpo.current; if (el) el.scrollTop = el.scrollHeight; }, [hist, vivo, pend]);
  useEffect(() => { if (fila && pronto && !busy) { consumir(); enviar(fila.texto, { web: fila.web }); } }, [fila, pronto, busy]);
  useEffect(() => { const t = taRef.current; if (t) { t.style.height = 'auto'; t.style.height = Math.min(180, t.scrollHeight) + 'px'; } }, [txt]);

  // Fecha tool_use pendentes (ex.: página recarregada no meio de uma confirmação) para manter o histórico válido.
  const sanear = h => {
    const ult = h[h.length - 1];
    if (ult && ult.role === 'assistant' && Array.isArray(ult.content)) {
      const us = ult.content.filter(b => b.type === 'tool_use');
      if (us.length) return h.concat([{ role: 'user', content: us.map(u => ({ type: 'tool_result', tool_use_id: u.id, is_error: true, content: 'Ação interrompida antes da confirmação do usuário.' })) }]);
    }
    return h;
  };

  const confirmar = usos => new Promise(resolve => {
    const itens = usos.map(u => ({ u, estado: 'aguardando' }));
    const decidir = (id, sim) => setPend(p => {
      const n = { ...p, itens: p.itens.map(x => x.u.id === id ? { ...x, estado: sim ? 'aplicado' : 'recusado' } : x) };
      if (n.itens.every(x => x.estado !== 'aguardando')) setTimeout(() => { resolve(n.itens); setPend(null); }, 350);
      return n;
    });
    setPend({ itens, decidir, cancelar: () => { resolve(itens.map(x => ({ ...x, estado: x.estado === 'aguardando' ? 'recusado' : x.estado }))); setPend(null); } });
  });

  async function executar(usos) {
    let cur = stRef.current; const res = {}; const conf = [];
    for (const u of usos) {
      const r = executarDireto(u, cur, ctxRef.current);
      if (r) res[u.id] = { type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(r) };
      else if (!validarConfirmavel(u)) res[u.id] = { type: 'tool_result', tool_use_id: u.id, is_error: true, content: JSON.stringify({ INVALID_JSON: JSON.stringify(u.input) }) };
      else conf.push(u);
    }
    if (conf.length) {
      const dec = await confirmar(conf);
      for (const d of dec) {
        if (d.estado === 'aplicado') {
          const antes = quick(cur); cur = aplicarConfirmada(d.u, cur); const nx = aplicarConfirmada.bind(null, d.u);
          ctxRef.current.replaceSt(nx);
          res[d.u.id] = { type: 'tool_result', tool_use_id: d.u.id, content: JSON.stringify({ aplicado: true, antes: resumoR(antes), depois: resumoR(quick(cur)) }) };
        } else res[d.u.id] = { type: 'tool_result', tool_use_id: d.u.id, content: JSON.stringify({ aplicado: false, motivo: 'O usuário recusou esta alteração.' }) };
      }
    }
    return usos.map(u => res[u.id]);
  }

  async function laco(h) {
    let msgs = h;
    for (let volta = 0; volta < 14; volta++) {
      const ac = new AbortController(); abortRef.current = ac;
      setVivo({ texto: '', pensando: '', acoes: [] });
      let fim;
      try {
        fim = await AI.stream('/api/ai/chat', { messages: msgs, web: webRef.current }, ev => setVivo(v => {
          if (!v) return v;
          if (ev.t === 'text') return { ...v, texto: v.texto + ev.d };
          if (ev.t === 'thinking') return { ...v, pensando: v.pensando + ev.d };
          if (ev.t === 'tool') return { ...v, acoes: v.acoes.concat([ev.name === 'simular_cenario' ? 'Simulando cenário…' : ev.name === 'buscar_meta' ? 'Buscando meta…' : 'Preparando ação…']) };
          if (ev.t === 'search') return { ...v, acoes: v.acoes.concat(['Pesquisando na web…']) };
          if (ev.t === 'reset') return { texto: '', pensando: '', acoes: [] };
          return v;
        }), ac.signal);
      } catch (e) { setVivo(null); if (e.name !== 'AbortError') setErro(e.message); return; }
      msgs = msgs.concat([{ role: 'assistant', content: fim.content }]); salvar(msgs); setVivo(null);
      if (fim.stop_reason === 'pause_turn') continue;
      if (fim.stop_reason === 'refusal') { setErro('A IA não pôde responder a este pedido. Reformule a pergunta.'); return; }
      const usos = fim.content.filter(b => b.type === 'tool_use');
      if (!usos.length) return;
      const results = fim.stop_reason === 'max_tokens'
        ? usos.map(u => ({ type: 'tool_result', tool_use_id: u.id, is_error: true, content: 'Entrada da ferramenta truncada; refaça com menos conteúdo.' }))
        : await executar(usos);
      msgs = msgs.concat([{ role: 'user', content: results }]); salvar(msgs);
      if (abortRef.current?.signal.aborted) return;
    }
  }

  async function enviar(texto, op = {}) {
    const t = (texto ?? txt).trim(); if ((!t && !anex.length) || busy || !ai?.ai) return;
    if (op.web != null && ai.webSearch) { setWeb(op.web); webRef.current = op.web; }
    setErro(''); setBusy(true); setTxt('');
    const contexto = JSON.stringify(contextoIA(stRef.current, mRef.current, realRef.current)), hs = hashStr(contexto);
    const content = anex.map(f => f.media_type === 'application/pdf' ? { type: 'document', title: f.name, source: { type: 'base64', media_type: 'application/pdf', data: f.data } }
      : /^image\//.test(f.media_type) ? { type: 'image', source: { type: 'base64', media_type: f.media_type, data: f.data } }
        : { type: 'document', title: f.name, source: { type: 'text', media_type: 'text/plain', data: new TextDecoder().decode(Uint8Array.from(atob(f.data), ch => ch.charCodeAt(0))) } });
    content.push({ type: 'text', text: hs === ultimoCtx.current ? '<estudo>inalterado desde a mensagem anterior</estudo>' : '<estudo>\n' + contexto + '\n</estudo>' });
    content.push({ type: 'text', text: t || 'Analise os anexos no contexto do estudo.' });
    ultimoCtx.current = hs; setAnex([]);
    const h = sanear(hist).concat([{ role: 'user', content }]);
    salvar(h);
    try { await laco(h); } finally { setBusy(false); abortRef.current = null; }
  }
  const parar = () => { abortRef.current && abortRef.current.abort(); pend && pend.cancelar(); };
  const limpar = () => { if (!confirmar_('Apagar esta conversa?')) return; ultimoCtx.current = null; salvar([]); setErro(''); };
  const anexar = async fl => { const arr = []; for (const f of [...fl].slice(0, 6)) { if (f.size > 20e6) { toast(f.name + ': arquivo acima de 20 MB.', true); continue; } arr.push(await lerArquivo(f)); } setAnex(a => a.concat(arr).slice(0, 6)); };

  // Renderização do histórico
  const resultados = useMemo(() => { const m = {}; hist.forEach(x => Array.isArray(x.content) && x.content.forEach(b => { if (b.type === 'tool_result') m[b.tool_use_id] = b; })); return m; }, [hist]);
  const blocos = [];
  hist.forEach((m, mi) => {
    const c = typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : m.content;
    if (m.role === 'user') {
      const textos = c.filter(b => b.type === 'text' && !b.text.startsWith('<estudo>')), at = c.filter(b => b.type === 'document' || b.type === 'image');
      if (textos.length || at.length) blocos.push(html`<div key=${mi} className="msg u">${at.length ? html`<div className="att">${at.map((a, k) => html`<span key=${k} className="filechip"><${Icon} n=${a.type === 'image' ? 'grid' : 'doc'} s=${13} /><span>${a.title || 'imagem'}</span></span>`)}</div>` : null}${textos.map((b, k) => html`<div key=${k} className="bub">${b.text}</div>`)}</div>`);
      return;
    }
    const fontes = [];
    const partes = c.map((b, k) => {
      if (b.type === 'text' && b.text.trim()) { (b.citations || []).forEach(ci => ci.url && fontes.push({ url: ci.url, title: ci.title })); return html`<${Md} key=${k} text=${b.text} className="bub" />`; }
      if (b.type === 'thinking' && b.thinking) return html`<details key=${k} className="think"><summary><${Icon} n="brain" s=${12} />Raciocínio</summary><div>${b.thinking}</div></details>`;
      if (b.type === 'tool_use') { const [ic, d] = descreverFerramenta(b.name, b.input); const r = resultados[b.id]; let st2 = ''; try { const j = JSON.parse(r?.content || '{}'); st2 = j.aplicado === true ? ' · aplicado' : j.aplicado === false ? ' · recusado' : r?.is_error ? ' · não concluído' : ''; } catch (e) { } return html`<span key=${k} className="act" title=${d + st2}><${Icon} n=${ic} /><span>${d}${st2}</span></span>`; }
      if (b.type === 'server_tool_use') return html`<span key=${k} className="act"><${Icon} n="globe" /><span>Pesquisou: ${b.input?.query || 'web'}</span></span>`;
      if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) { b.content.forEach(x => x.url && fontes.push({ url: x.url, title: x.title })); return null; }
      return null;
    }).filter(Boolean);
    const uniq = [...new Map(fontes.map(f => [f.url, f])).values()].slice(0, 8);
    if (partes.length || uniq.length) blocos.push(html`<div key=${mi} className="msg a">${partes}${uniq.length ? html`<div className="srcs"><span className="k-mono" style=${{ color: 'var(--mute)' }}>Fontes</span>${uniq.map((f, k) => html`<a key=${k} href=${f.url} target="_blank" rel="noopener noreferrer" title=${f.url}>${k + 1}. ${f.title || f.url}</a>`)}</div>` : null}</div>`);
  });

  const semIA = !ai?.ai;
  return html`<aside className="copilot noprint" aria-label="Assistente de IA">
    <div className="cp-h">
      <div className="cp-av"><${Icon} n="ia" s=${16} /></div>
      <div className="t"><b>Assistente PREDIC</b><span>${semIA ? 'indisponível' : 'Claude · ' + String(ai.model || '').replace(/^claude-/, '')}</span></div>
      ${hist.length ? html`<button className="iconbtn" title="Nova conversa" onClick=${limpar}><${Icon} n="trash" s=${15} /></button>` : null}
      <button className="iconbtn" title="Fechar (Esc)" onClick=${onClose}><${Icon} n="x" /></button>
    </div>
    <div className="cp-body" ref=${corpo}>
      ${semIA ? html`<${IASemAcesso} ai=${ai} />` : null}
      ${!hist.length && !semIA ? html`<div className="cp-empty">
        <div><h3>Como posso ajudar no estudo?</h3><p className="sub" style=${{ marginTop: 4 }}>Eu leio todas as premissas e resultados, simulo cenários no motor financeiro, pesquiso o mercado na web e, com sua confirmação, altero o estudo.</p></div>
        <div className="sugs">${sugestoesPara(st).map((s, i) => html`<button key=${i} className="sug" onClick=${() => enviar(s, { web: /pesquise/i.test(s) })}>${s}</button>`)}</div>
        <p className="note">Anexe matrículas, certidões, tabelas de vendas ou fotos com o clipe para eu analisar.</p>
      </div>` : null}
      ${blocos}
      ${vivo ? html`<div className="msg a">
        ${vivo.pensando ? html`<details className="think" open=${!vivo.texto}><summary><${Icon} n="brain" s=${12} />Raciocinando…</summary><div>${vivo.pensando.slice(-1200)}</div></details>` : null}
        ${vivo.acoes.map((a, k) => html`<span key=${k} className="act"><span className="spin ia" style=${{ width: 11, height: 11, borderWidth: 2 }}></span><span>${a}</span></span>`)}
        ${vivo.texto ? html`<div className="bub"><${Md} text=${vivo.texto} /><span className="typing"></span></div>` : !vivo.pensando && !vivo.acoes.length ? html`<span className="act"><span className="spin ia" style=${{ width: 11, height: 11, borderWidth: 2 }}></span><span>Analisando o estudo…</span></span>` : null}
      </div>` : null}
      ${pend ? pend.itens.map(x => html`<div key=${x.u.id} className="confirm">
        <h4><${Icon} n="alert" s=${14} style=${{ color: 'var(--p2)' }} />${descreverFerramenta(x.u.name, x.u.input)[1]}</h4>
        <${DetalheConfirma} u=${x.u} st=${st} />
        ${x.estado === 'aguardando' ? html`<div style=${{ display: 'flex', gap: 6 }}><button className="btn g sm" onClick=${() => pend.decidir(x.u.id, true)}><${Icon} n="check" s=${13} />Aplicar</button><button className="btn sm" onClick=${() => pend.decidir(x.u.id, false)}>Recusar</button></div>`
          : html`<div className="done" style=${{ color: x.estado === 'aplicado' ? 'var(--g)' : 'var(--mute)' }}>${x.estado === 'aplicado' ? '✓ Aplicado ao estudo (Ctrl+Z desfaz)' : 'Recusado'}</div>`}
      </div>`) : null}
      ${erro ? html`<div className="alert cr">${erro}</div>` : null}
    </div>
    <div className="cp-in">
      ${anex.length ? html`<div style=${{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>${anex.map((a, k) => html`<span key=${k} className="filechip"><${Icon} n="doc" s=${13} /><span>${a.name}</span><button className="rowx" onClick=${() => setAnex(l => l.filter((_, j) => j !== k))}>×</button></span>`)}</div>` : null}
      <div className="cp-box" onDragOver=${e => e.preventDefault()} onDrop=${e => { e.preventDefault(); anexar(e.dataTransfer.files); }}>
        <textarea ref=${taRef} rows="1" value=${txt} disabled=${semIA} placeholder=${semIA ? 'IA indisponível' : 'Pergunte sobre o estudo…'} onChange=${e => setTxt(e.target.value)}
          onKeyDown=${e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } }}></textarea>
        <div className="cp-tools">
          <label className="iconbtn" title="Anexar PDF, imagem ou texto" style=${{ cursor: 'pointer', width: 28, height: 28 }}><${Icon} n="clip" s=${15} /><input type="file" multiple accept=${ACEITOS} style=${{ display: 'none' }} onChange=${e => { anexar(e.target.files); e.target.value = ''; }} /></label>
          ${ai?.ai && ai?.webSearch ? html`<button className=${'tgl' + (web ? ' on' : '')} onClick=${() => setWeb(w => !w)} title="Permite que a IA pesquise na internet"><${Icon} n="globe" s=${13} />Pesquisa web</button>` : null}
          <span className="sp"></span>
          ${busy ? html`<button className="send" style=${{ background: 'var(--r2)' }} title="Parar" onClick=${parar}><${Icon} n="stop" s=${14} /></button>`
            : html`<button className="send" title="Enviar (Enter)" disabled=${semIA || (!txt.trim() && !anex.length)} onClick=${() => enviar()}><${Icon} n="send" s=${15} /></button>`}
        </div>
      </div>
      ${anex.length ? html`<div className="privnote"><${Icon} n="shield" s=${12} />Anexos vão à Anthropic para a resposta e não ficam guardados no PREDIC.</div>` : null}
      <div className="note" style=${{ fontSize: 10, textAlign: 'center' }}>A IA pode errar. Confira números importantes antes de levar ao comitê.</div>
    </div>
  </aside>`;
}
const confirmar_ = m => window.confirm(m);

/* ============================ cartão de IA no painel ============================ */
function IACard({ ctx }) {
  const { ai, st } = ctx;
  return html`<${Card} className="iacard noprint" title=${html`<${Icon} n="ia" s=${17} />Assistente de viabilidade`} sub="pergunte em linguagem natural · a IA lê o estudo inteiro, simula cenários e pesquisa o mercado"
    right=${ai?.ai ? html`<div style=${{ display: 'flex', gap: 6, flexWrap: 'wrap' }}><button className="btn sm" onClick=${() => ctx.abrirIA('extracao')}><${Icon} n="doc" s=${14} />Ler documentos</button><button className="btn sm" onClick=${() => { ctx.set({ sec: 'conclusao' }); window.scrollTo(0, 0); }}><${Icon} n="check" s=${14} />Parecer e auditoria</button><button className="btn ia sm" onClick=${() => ctx.abrirCopilot()}><${Icon} n="ia" s=${14} />Abrir assistente</button></div>` : null}>
    ${ai?.ai ? html`<div className="sugs">${sugestoesPara({ ...st, sec: 'painel' }).map((s, i) => html`<button key=${i} className="sug" onClick=${() => ctx.perguntar(s)}>${s}</button>`)}</div>` : html`<${IASemAcesso} ai=${ai} />`}
  <//>`;
}

/* ============================ parecer técnico ============================ */
function ParecerIA({ ctx }) {
  const { st, M, real, ai, set } = ctx; const P = st.ia?.parecer;
  const [txt, setTxt] = useState(null), [busy, setBusy] = useState(false), [inst, setInst] = useState(''), [verInst, setVerInst] = useState(false);
  const acRef = useRef();
  useEffect(() => () => acRef.current && acRef.current.abort(), []);
  const gerar = async () => {
    setBusy(true); setTxt(''); const ac = new AbortController(); acRef.current = ac; let acc = '';
    try {
      const fim = await AI.stream('/api/ai/parecer', { contexto: contextoIA(st, M, real), instrucoes: inst }, ev => { if (ev.t === 'text') { acc += ev.d; setTxt(acc); } else if (ev.t === 'reset') { acc = ''; setTxt(''); } }, ac.signal);
      const final = fim.content.filter(b => b.type === 'text').map(b => b.text).join('\n\n').trim() || acc;
      if (fim.stop_reason === 'refusal') throw new Error('A IA não pôde redigir este parecer.');
      set(s => ({ ia: { ...(s.ia || {}), parecer: { texto: final, em: Date.now(), modelo: fim.model, produto: M.PR.nome } } })); setTxt(null); toast('Parecer gerado e salvo no estudo.');
    } catch (e) { if (e.name !== 'AbortError') toast(e.message, true); setTxt(null); }
    setBusy(false);
  };
  const texto = txt ?? P?.texto;
  const copiar = () => navigator.clipboard?.writeText(texto).then(() => toast('Parecer copiado.'), () => toast('Não foi possível copiar.', true));
  return html`<${Card} className="iacard" title=${html`<${Icon} n="doc" s=${16} />Parecer técnico`} sub=${P && txt == null ? 'gerado em ' + horaBR(P.em) + ' · ' + (P.produto || '') + ' · revise antes de enviar' : 'redigido pela IA a partir de todo o estudo, pronto para o comitê'}
    right=${ai?.ai ? html`<div className="noprint" style=${{ display: 'flex', gap: 6 }}>${texto && !busy ? html`<button className="btn sm" onClick=${copiar}><${Icon} n="copy" s=${13} />Copiar</button><button className="btn sm" title="Substitui as recomendações finais por este texto" onClick=${() => { set({ notas: texto }); toast('Texto levado às recomendações finais.'); }}>Usar nas recomendações</button>` : null}
      ${busy ? html`<button className="btn sm" onClick=${() => acRef.current?.abort()}>Parar</button>` : html`<button className="btn ia sm" onClick=${gerar}><${Icon} n="ia" s=${13} />${P ? 'Regerar' : 'Gerar parecer'}</button>`}</div>` : null}>
    ${!ai?.ai ? html`<${IASemAcesso} ai=${ai} compacto=${true} />` : null}
    ${ai?.ai && !busy ? html`<div className="noprint" style=${{ marginBottom: texto ? 10 : 0 }}>${verInst ? html`<${Field} label="Orientações para a IA (opcional)"><textarea className="in box" rows="2" value=${inst} onChange=${e => setInst(e.target.value)} placeholder="Ex.: destaque o risco de lançamento concorrente; tom mais conservador; cite a necessidade de 30% de pré-venda."></textarea><//>` : html`<button className="btn ghost sm" style=${{ paddingLeft: 0 }} onClick=${() => setVerInst(true)}>+ orientações para a IA</button>`}</div>` : null}
    ${busy && !txt ? html`<div style=${{ display: 'flex', gap: 10, alignItems: 'center' }}><span className="spin ia"></span><span className="sub">Lendo o estudo e redigindo o parecer… (30 s a 2 min)</span></div>` : null}
    ${texto ? html`<div className="doc" style=${{ maxHeight: 560, overflowY: 'auto' }}><${Md} text=${texto} className="doc" />${busy ? html`<span className="typing"></span>` : null}</div>` : !busy && ai?.ai ? html`<div className="note">Nenhum parecer ainda. A IA redige síntese, mercado, resultado, riscos, aspectos legais e condicionantes, com recomendação explícita.</div>` : null}
  <//>`;
}

/* ============================ auditoria de premissas ============================ */
const SEV = { critico: ['cr', 'crítico'], atencao: ['at', 'atenção'], ok: ['ok', 'adequado'] };
function AuditoriaIA({ ctx }) {
  const { st, M, real, ai, set } = ctx; const A = st.ia?.auditoria; const [busy, setBusy] = useState(false);
  const rodar = async () => {
    setBusy(true);
    try { const d = await AI.json('auditoria', { contexto: contextoIA(st, M, real) }); set(s => ({ ia: { ...(s.ia || {}), auditoria: { dados: d, em: Date.now(), produto: M.PR.nome } } })); toast('Auditoria concluída.'); }
    catch (e) { toast(e.message, true); }
    setBusy(false);
  };
  const aplicar = aj => { ctx.replaceSt(s => aplicarVars(s, [aj]).st); toast(AI_VARS[aj.variavel][0] + ' ajustado para ' + fmtVar(aj.variavel, aj.valor) + ' (Ctrl+Z desfaz).'); };
  const d = A?.dados; const k = d ? (d.nota >= 75 ? 'ok' : d.nota >= 50 ? 'at' : 'cr') : 'na';
  return html`<${Card} className="iacard" title=${html`<${Icon} n="search" s=${16} />Auditoria de premissas`} sub=${A ? 'feita em ' + horaBR(A.em) + ' · ' + (A.produto || '') : 'revisão crítica das premissas, como faria o comitê'}
    right=${ai?.ai ? html`<button className="btn ia sm noprint" disabled=${busy} onClick=${rodar}>${busy ? html`<span className="spin" style=${{ width: 12, height: 12, borderWidth: 2, borderColor: 'rgba(255,255,255,.3)', borderTopColor: '#fff' }}></span>Auditando…` : html`<${Icon} n="search" s=${13} />${A ? 'Refazer' : 'Auditar agora'}`}</button>` : null}>
    ${!ai?.ai ? html`<${IASemAcesso} ai=${ai} compacto=${true} />` : null}
    ${d ? html`<div>
      <div style=${{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 6 }}><${Gauge} v=${d.nota} k=${k} /><div><div className="k-mono" style=${{ color: 'var(--mute)' }}>Robustez das premissas</div><p style=${{ fontSize: 12.5, marginTop: 4 }}>${d.resumo}</p></div></div>
      ${d.achados.map((f, i) => html`<div key=${i} className="find">
        <${Pill} k=${SEV[f.severidade]?.[0] || 'na'}>${SEV[f.severidade]?.[1] || f.severidade}<//>
        <div><b style=${{ fontSize: 12.5 }}>${f.titulo}</b><div style=${{ fontSize: 12, marginTop: 3, color: 'var(--ink2)' }}>${f.explicacao}</div><div className="sub" style=${{ marginTop: 4 }}><strong>Sugestão:</strong> ${f.sugestao}</div></div>
        <div className="noprint" style=${{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
          ${f.ajuste && f.ajuste.variavel !== 'nenhuma' && ok(f.ajuste.valor) && AI_VARS[f.ajuste.variavel] ? html`<button className="btn sm" title=${'Aplicar ' + AI_VARS[f.ajuste.variavel][0] + ' = ' + fmtVar(f.ajuste.variavel, f.ajuste.valor)} onClick=${() => aplicar(f.ajuste)}>Aplicar ${fmtVar(f.ajuste.variavel, f.ajuste.valor)}</button>` : null}
          <button className="btn ghost sm" onClick=${() => { ctx.set({ sec: f.secao }); window.scrollTo(0, 0); }}>Ver seção →</button>
        </div></div>`)}
    </div>` : busy ? html`<div style=${{ display: 'flex', gap: 10, alignItems: 'center' }}><span className="spin ia"></span><span className="sub">Confrontando premissas com mercado, SINAPI, renda e metas do comitê…</span></div>`
      : ai?.ai ? html`<div className="note">A IA confronta preço, VSO, custo, prazo, terreno, capital próprio, potencial construtivo e itens jurídicos, e sugere ajustes que você aplica com um clique.</div>` : null}
  <//>`;
}

/* ============================ leitura de documentos ============================ */
const CAMPOS_EXT = [['endereco', 'Endereço'], ['matricula', 'Matrícula'], ['cartorio', 'Cartório'], ['area', 'Área do terreno (m²)'], ['zona', 'Zoneamento'], ['ca', 'Coef. de aproveitamento'], ['to', 'Taxa de ocupação (%)'], ['gabarito', 'Gabarito (m)'], ['lote', 'Descrição do lote']];
function ExtracaoModal({ ctx, onClose }) {
  const { st, M, real } = ctx;
  const [arqs, setArqs] = useState([]), [busy, setBusy] = useState(false), [res, setRes] = useState(null), [sel, setSel] = useState({}), [over, setOver] = useState(false);
  const add = async fl => { const a = []; for (const f of [...fl]) { if (f.size > 20e6) { toast(f.name + ': acima de 20 MB.', true); continue; } a.push(await lerArquivo(f)); } setArqs(l => l.concat(a).slice(0, 8)); };
  const total = arqs.reduce((a, f) => a + f.size, 0);
  const analisar = async () => {
    setBusy(true);
    try {
      const d = await AI.json('extracao', { contexto: { empreendimento: contextoIA(st, M, real).empreendimento, dueDiligenceAtual: st.listas.dd.map(x => x.nome) }, arquivos: arqs.map(({ name, media_type, data }) => ({ name, media_type, data })) });
      const s = {}; CAMPOS_EXT.forEach(([k]) => { if (d.campos_estudo[k] != null && d.campos_estudo[k] !== '') s['c:' + k] = true; });
      d.itens_due_diligence.forEach((_, i) => { s['d:' + i] = true; }); d.concorrentes.forEach((_, i) => { s['k:' + i] = true; }); if (d.alertas.length) s.alertas = true;
      setRes(d); setSel(s);
    } catch (e) { toast(e.message, true); }
    setBusy(false);
  };
  const aplicar = () => {
    const d = res;
    ctx.replaceSt(s => {
      const E = { ...s.estudo }; CAMPOS_EXT.forEach(([k]) => { if (sel['c:' + k]) E[k] = d.campos_estudo[k]; });
      let dd = s.listas.dd.slice();
      d.itens_due_diligence.forEach((x, i) => {
        if (!sel['d:' + i]) return;
        const j = dd.findIndex(y => norm(y.nome).includes(norm(x.item).slice(0, 18)) || norm(x.item).includes(norm(y.nome).slice(0, 18)));
        if (j >= 0) dd[j] = { ...dd[j], k: x.nivel, status: x.situacao, fonte: dd[j].fonte || x.fonte }; else dd.push(it(x.grupo, x.item, x.fonte, x.nivel, x.situacao));
      });
      const concs = s.concs.concat(d.concorrentes.filter((_, i) => sel['k:' + i]).map(c => ({ id: uid(), ...c })));
      const pareceres = sel.alertas ? s.listas.pareceres.concat(d.alertas.map(a => ({ id: uid(), t: a, v: d.tipo_documento, k: 'at' }))) : s.listas.pareceres;
      return { ...s, estudo: E, concs, listas: { ...s.listas, dd, pareceres } };
    });
    toast('Dados do documento aplicados ao estudo (Ctrl+Z desfaz).');
    if (sel['c:endereco']) setTimeout(() => ctx.localizar(), 100);
    onClose();
  };
  const tg = k => setSel(s => ({ ...s, [k]: !s[k] }));
  const nSel = Object.values(sel).filter(Boolean).length;
  return html`<${Modal} title="Ler documentos com IA" icon="doc" lg=${!!res} onClose=${onClose} footer=${res ? html`<button className="btn" onClick=${() => setRes(null)}>Voltar</button><button className="btn g" disabled=${!nSel} onClick=${aplicar}>Aplicar ${nSel} item(ns) ao estudo</button>`
      : html`<button className="btn" onClick=${onClose}>Cancelar</button><button className="btn ia" disabled=${!arqs.length || busy} onClick=${analisar}>${busy ? html`<span className="spin" style=${{ width: 12, height: 12, borderWidth: 2, borderColor: 'rgba(255,255,255,.3)', borderTopColor: '#fff' }}></span>Lendo documentos…` : 'Analisar com IA'}</button>`}>
    ${!res ? html`<p className="sub">Envie matrícula, certidões, consulta prévia/zoneamento, IPTU ou tabela de vendas de concorrentes (PDF ou foto). A IA extrai os dados, classifica os riscos de due diligence e você escolhe o que aplicar.</p>
      <label className=${'drop' + (over ? ' over' : '')} onDragOver=${e => { e.preventDefault(); setOver(true); }} onDragLeave=${() => setOver(false)} onDrop=${e => { e.preventDefault(); setOver(false); add(e.dataTransfer.files); }}>
        <${Icon} n="up" s=${26} /><b>Arraste os arquivos aqui ou clique para escolher</b><span className="sub">PDF, PNG, JPG ou TXT · até 8 arquivos · 30 MB no total</span>
        <input type="file" multiple accept=${ACEITOS} style=${{ display: 'none' }} onChange=${e => { add(e.target.files); e.target.value = ''; }} /></label>
      ${arqs.length ? html`<div style=${{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>${arqs.map((a, i) => html`<span key=${i} className="filechip"><${Icon} n="doc" s=${13} /><span>${a.name}</span><span className="sub">${num(a.size / 1e6, 1)} MB</span><button className="rowx" onClick=${() => setArqs(l => l.filter((_, j) => j !== i))}>×</button></span>`)}</div>` : null}
      ${total > 28e6 ? html`<div className="alert cr">Os arquivos somam mais de 28 MB. Remova algum para enviar.</div>` : null}
      <div className="privnote"><${Icon} n="shield" s=${13} />Os arquivos são enviados à Anthropic só para esta leitura e não ficam guardados no PREDIC. Matrículas e certidões contêm dados pessoais: envie apenas o necessário ao estudo.</div>
      ${busy ? html`<div className="alert na">A leitura leva de 20 segundos a 2 minutos, conforme o número de páginas.</div>` : null}`
    : html`<div className="alert na"><strong>${({ matricula: 'Matrícula', certidao: 'Certidão', zoneamento: 'Zoneamento / consulta prévia', tabela_vendas: 'Tabela de vendas', iptu: 'IPTU', outro: 'Documento' })[res.tipo_documento]}.</strong> ${res.resumo}</div>
      ${res.alertas.length ? html`<label className="check"><input type="checkbox" checked=${!!sel.alertas} onChange=${() => tg('alertas')} /><div><b>Alertas</b> <span className="sub">(adicionar ao parecer jurídico)</span><ul style=${{ paddingLeft: 18, marginTop: 4 }}>${res.alertas.map((a, i) => html`<li key=${i}>${a}</li>`)}</ul></div></label>` : null}
      ${CAMPOS_EXT.some(([k]) => res.campos_estudo[k] != null && res.campos_estudo[k] !== '') ? html`<div><h3 style=${{ margin: '6px 0' }}>Dados do terreno</h3>${CAMPOS_EXT.filter(([k]) => res.campos_estudo[k] != null && res.campos_estudo[k] !== '').map(([k, l]) => html`<label key=${k} className="check"><input type="checkbox" checked=${!!sel['c:' + k]} onChange=${() => tg('c:' + k)} /><div style=${{ flex: 1 }}>${l}<div className="sub">atual: ${String(st.estudo[k] || '—')} → <strong style=${{ color: 'var(--ink)' }}>${String(res.campos_estudo[k])}</strong></div></div></label>`)}</div>` : null}
      ${res.proprietarios.length ? html`<div className="kv"><span>Proprietários identificados</span><b style=${{ fontFamily: 'var(--sans)' }}>${res.proprietarios.join('; ')}</b></div>` : null}
      ${res.itens_due_diligence.length ? html`<div><h3 style=${{ margin: '6px 0' }}>Due diligence</h3>${res.itens_due_diligence.map((x, i) => html`<label key=${i} className="check"><input type="checkbox" checked=${!!sel['d:' + i]} onChange=${() => tg('d:' + i)} /><div style=${{ flex: 1 }}>${x.item} <span className="sub">· ${x.grupo} · ${x.fonte}</span><div className="sub">${x.situacao}</div></div><${Pill} k=${x.nivel}>${NIVTXT[x.nivel]}<//></label>`)}</div>` : null}
      ${res.concorrentes.length ? html`<div><h3 style=${{ margin: '6px 0' }}>Concorrentes</h3>${res.concorrentes.map((c, i) => html`<label key=${i} className="check"><input type="checkbox" checked=${!!sel['k:' + i]} onChange=${() => tg('k:' + i)} /><div style=${{ flex: 1 }}>${c.nome} <span className="sub">· ${c.tipo} · ${c.padrao}</span></div><span className="mono" style=${{ fontSize: 11 }}>${mil(c.m2)}/m² · ${c.estoque} un.</span></label>`)}</div>` : null}
      <p className="note">Confira os dados extraídos no documento original antes de decidir.</p>`}
  <//>`;
}

/* ============================ sugestão de produtos ============================ */
function produtoDaIA(x, base, tetos = TETO_MCMV) {
  const P = novoProduto(x.nome, false);
  const mcmv = x.programa === 'mcmv';
  return { ...P, nome: x.nome, descr: x.descricao + (x.racional ? '\n\nRacional: ' + x.racional : ''), padrao: x.padrao, tipoEdif: x.tipoEdif, programa: x.programa, faixa: mcmv ? 3 : null, teto: mcmv ? tetos[3] : null,
    pavimentos: Math.max(1, Math.round(x.pavimentos)), unAndar: Math.max(1, Math.round(x.unAndar)), custo: x.custo_obra_m2, vso: x.vso, prazo: Math.max(6, Math.round(x.prazo_obra)), comum: x.area_comum, garagem: x.area_garagem, vagas: Math.round(x.vagas),
    mix: x.mix.filter(m => m.un > 0 && m.area > 0).map(m => ({ tipo: m.tipo, un: Math.round(m.un), area: m.area, preco: Math.round(m.preco), perm: 0 })), lazer: x.lazer,
    custos: { ...clone(base.custos), ret: mcmv ? 1 : (base.programa === 'mcmv' ? 4 : base.custos?.ret ?? 4) }, crono: clone(base.crono).map(c => ({ ...c, id: uid() })), permFin: base.permFin, terrenoCash: base.terrenoCash,
    capModelo: base.capModelo, finPct: base.finPct, finJuros: base.finJuros, assoc: base.assoc, entrada: base.entrada, ader: [50, 50, 50, 50, 50], capa: null };
}
function ProdutosModal({ ctx, onClose }) {
  const { st, M, real } = ctx; const [inst, setInst] = useState(''), [busy, setBusy] = useState(false), [res, setRes] = useState(null), [add, setAdd] = useState({});
  const gerar = async () => { setBusy(true); try { setRes(await AI.json('produtos', { contexto: contextoIA(st, M, real), instrucoes: inst })); setAdd({}); } catch (e) { toast(e.message, true); } setBusy(false); };
  const base = M.PR;
  const calc = useMemo(() => res ? res.produtos.map(x => { const P = produtoDaIA(x, base, M.PM.tetoMcmv); if (!P.mix.length) return { P, q: null }; return { P, q: quick({ ...st, produtos: [P], prodSel: 0 }), D: derive(P) }; }) : [], [res]);
  const atual = quick(st);
  const incluir = i => { const P = calc[i].P; ctx.replaceSt(s => ({ ...s, produtos: s.produtos.concat([{ ...P, id: uid() }]) })); setAdd(a => ({ ...a, [i]: true })); toast(P.nome + ' adicionado ao estudo.'); };
  return html`<${Modal} title="Sugerir produtos com IA" icon="ia" lg=${true} onClose=${onClose} footer=${html`<button className="btn" onClick=${onClose}>Fechar</button>${Object.keys(add).length ? html`<button className="btn pri" onClick=${() => { ctx.set({ sec: 'conclusao' }); onClose(); }}>Comparar produtos →</button>` : null}<button className="btn ia" disabled=${busy} onClick=${gerar}>${busy ? 'Gerando…' : res ? 'Gerar novas alternativas' : 'Gerar alternativas'}</button>`}>
    <p className="sub">A IA propõe três produtos diferentes para o terreno, coerentes com zoneamento, demanda, renda e concorrência. O motor do PREDIC calcula a viabilidade de cada um com as mesmas premissas de terreno, custos e cenários do estudo.</p>
    <${Field} label="Orientações (opcional)"><textarea className="in box" rows="2" value=${inst} onChange=${e => setInst(e.target.value)} placeholder="Ex.: considerar MCMV faixa 3; até 18 pavimentos; incluir studios para investidor."></textarea><//>
    ${busy ? html`<div style=${{ display: 'flex', gap: 10, alignItems: 'center' }}><span className="spin ia"></span><span className="sub">Estudando o terreno e o mercado… (30 s a 1 min)</span></div>` : null}
    ${res ? html`<div className="alert na">${res.analise}</div>
      <div className="grid g3">${calc.map((c, i) => { const x = res.produtos[i]; return html`<div key=${i} className="card" style=${{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div><h2>${x.nome}</h2><div className="sub">${x.tipoEdif} · ${x.padrao} · ${x.programa === 'mcmv' ? 'MCMV' : 'mercado'} · ${x.pavimentos} pav.</div></div>
        <div style=${{ fontSize: 12 }}>${x.descricao}</div>
        <div className="sub"><strong>Racional:</strong> ${x.racional}</div>
        <table><tbody>${x.mix.map((m, k) => html`<tr key=${k}><td>${m.tipo}</td><td className="num">${m.un} un.</td><td className="num">${num(m.area)} m²</td><td className="num">${mil(m.preco)}</td></tr>`)}</tbody></table>
        ${c.q ? html`<div>
          <div className="kv"><span>VGV</span><b>${milhoes(c.q.R.vgv)}</b></div>
          <div className="kv"><span>TIR</span><b style=${{ color: ok(c.q.R.tir) && ok(atual.R.tir) && c.q.R.tir > atual.R.tir ? 'var(--g)' : '' }}>${pct(c.q.R.tir)}</b></div>
          <div className="kv"><span>Margem</span><b>${pct(c.q.R.margem)}</b></div>
          <div className="kv"><span>Exposição</span><b>${milhoes(Math.abs(c.q.R.expo))}</b></div>
          <div className="kv"><span>Veredito</span><${Pill} k=${c.q.k}>${c.q.veredito}<//></div></div>` : html`<div className="alert cr">Mix inválido.</div>`}
        <button className=${'btn ' + (add[i] ? '' : 'g')} disabled=${add[i] || !c.q} onClick=${() => incluir(i)} style=${{ marginTop: 'auto' }}>${add[i] ? '✓ Adicionado' : '+ Adicionar ao estudo'}</button>
      </div>`; })}</div>
      <p className="note">Referência atual (${base.nome}): TIR ${pct(atual.R.tir)} · margem ${pct(atual.R.margem)} · ${atual.veredito}.</p>` : null}
  <//>`;
}
