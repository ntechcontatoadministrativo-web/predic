'use strict';
/* PREDIC · conta: cliente do servidor, sessão, sincronização dos estudos, telas de entrada e configurações da conta */

/* ============================ cliente do servidor ============================ */
// No modo servidor os estudos ficam no banco da empresa; aberto como arquivo (dist/PREDIC.html), tudo fica no navegador.
const MODO = { servidor: location.protocol === 'http:' || location.protocol === 'https:', perfil: null };
const SRV = {
  ouvintes: new Set(),
  async req(metodo, rota, corpo) {
    let r;
    try { r = await fetch(rota, { method: metodo, headers: { 'Content-Type': 'application/json', 'x-predic': '1' }, body: corpo === undefined ? undefined : JSON.stringify(corpo), cache: 'no-store', credentials: 'same-origin' }); }
    catch (e) { throw Object.assign(new Error('Sem conexão com o servidor do PREDIC.'), { offline: true }); }
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 && !/^\/api\/(auth|conta\/excluir)/.test(rota)) SRV.ouvintes.forEach(f => f());
    if (!r.ok) throw Object.assign(new Error(j.erro || 'Erro do servidor (HTTP ' + r.status + ')'), { status: r.status, dados: j });
    return j;
  },
  get: r => SRV.req('GET', r), post: (r, b) => SRV.req('POST', r, b || {}), put: (r, b) => SRV.req('PUT', r, b), patch: (r, b) => SRV.req('PATCH', r, b), del: r => SRV.req('DELETE', r)
};

/* ============================ sincronização dos estudos ============================ */
// O navegador guarda uma cópia de trabalho (abre rápido e aguenta queda de rede) e envia cada alteração ao servidor.
// Cada estudo tem versão: se outra pessoa salvou antes, o servidor recusa e o usuário escolhe o que fazer.
const SYNC = {
  ns: '', fila: new Set(), estado: {}, conflitos: {}, ouv: new Set(), t: null, ocupado: false, iv: null,
  k: s => 'predic3s-' + SYNC.ns + '-' + s,
  meta() { return lsGet(SYNC.k('meta'), {}); },
  setMeta(f) { const m = SYNC.meta(); f(m); lsSet(SYNC.k('meta'), m); },
  emitir() { SYNC.ouv.forEach(f => f()); },
  status: id => SYNC.estado[id] || 'ok',
  pendentes() { return Object.entries(SYNC.meta()).filter(([, v]) => v.pendente).map(([id]) => id); },
  iniciar(empresaId) {
    SYNC.ns = empresaId; SYNC.estado = {}; SYNC.conflitos = {};
    SYNC.fila = new Set(SYNC.pendentes());
    clearInterval(SYNC.iv); SYNC.iv = setInterval(SYNC.tentar, 20000);
    window.addEventListener('online', SYNC.tentar);
    if (SYNC.fila.size) SYNC.tentar();
  },
  agendar(id) {
    SYNC.setMeta(m => { m[id] = { ...(m[id] || { versao: 0 }), pendente: true }; });
    SYNC.fila.add(id); if (SYNC.estado[id] !== 'conflito') SYNC.estado[id] = 'enviando'; SYNC.emitir();
    clearTimeout(SYNC.t); SYNC.t = setTimeout(SYNC.tentar, 900);
  },
  async tentar() {
    if (SYNC.ocupado || !SYNC.ns) return; SYNC.ocupado = true;
    try { for (const id of [...SYNC.fila]) await SYNC.enviar(id); } finally { SYNC.ocupado = false; }
  },
  async enviar(id, forcar) {
    const st = lsGet(ST_KEY(id), null); if (!st) { SYNC.fila.delete(id); return; }
    if (SYNC.estado[id] === 'conflito' && !forcar) { SYNC.fila.delete(id); return; }
    const v = (SYNC.meta()[id] || {}).versao || 0;
    try {
      const r = await SRV.put('/api/estudos/' + encodeURIComponent(id), { dados: st, resumo: resumoEstudo(normalizar(st)), versao: v, forcar: !!forcar });
      SYNC.setMeta(m => { m[id] = { versao: r.versao, remota: r.versao, pendente: false }; });
      SYNC.fila.delete(id); SYNC.estado[id] = 'ok'; delete SYNC.conflitos[id];
    } catch (e) {
      if (e.status === 409) { SYNC.fila.delete(id); SYNC.estado[id] = 'conflito'; SYNC.conflitos[id] = e.dados.atual; }
      else if (e.offline || e.status === 401 || e.status >= 500) SYNC.estado[id] = 'offline';
      else { SYNC.fila.delete(id); SYNC.estado[id] = 'erro'; toast('Não foi possível salvar no servidor: ' + e.message, true); }
    }
    SYNC.emitir();
  },
  // Atualiza a biblioteca com o índice do servidor (resumos), sem baixar estudos inteiros.
  async puxar() {
    const { estudos } = await SRV.get('/api/estudos');
    const meta = SYNC.meta(), local = lsGet(IDX_KEY(), []), remotos = new Set(estudos.map(e => e.id));
    const lista = estudos.map(e => ({ ...e.resumo, id: e.id, autor: e.autor, atualizado: e.atualizado }));
    local.forEach(x => { if (!remotos.has(x.id) && meta[x.id]?.pendente) lista.push(x); });
    // estudos apagados no servidor por outra pessoa saem do cache deste navegador
    local.forEach(x => { if (!remotos.has(x.id) && !meta[x.id]?.pendente) { try { localStorage.removeItem(ST_KEY(x.id)); } catch (e) { } delete meta[x.id]; } });
    estudos.forEach(e => { meta[e.id] = { ...(meta[e.id] || { versao: 0 }), remota: e.versao }; });
    lsSet(SYNC.k('meta'), meta);
    lista.sort((a, b) => (b.atualizado || 0) - (a.atualizado || 0));
    lsSet(IDX_KEY(), lista);
    return lista;
  },
  // Garante que a cópia local do estudo é a mais nova antes de abrir.
  async garantir(id) {
    const m = SYNC.meta()[id];
    if (m?.pendente) return;
    if (lsGet(ST_KEY(id), null) && m && (m.remota || 0) <= (m.versao || 0)) return;
    const r = await SRV.get('/api/estudos/' + encodeURIComponent(id));
    lsSet(ST_KEY(id), r.dados);
    SYNC.setMeta(mm => { mm[id] = { versao: r.versao, remota: r.versao, pendente: false }; });
  },
  async excluir(id) {
    SYNC.fila.delete(id); SYNC.setMeta(m => { delete m[id]; });
    try { await SRV.del('/api/estudos/' + encodeURIComponent(id)); } catch (e) { toast('O estudo saiu deste navegador, mas o servidor não confirmou a exclusão: ' + e.message, true); }
  },
  usarRemota(id, atual) {
    lsSet(ST_KEY(id), atual.dados);
    SYNC.setMeta(m => { m[id] = { versao: atual.versao, remota: atual.versao, pendente: false }; });
    SYNC.estado[id] = 'ok'; delete SYNC.conflitos[id]; SYNC.fila.delete(id); SYNC.emitir();
  },
  // Ao sair, a cópia de trabalho deste navegador é apagada (computadores compartilhados).
  limpar() {
    const pref = 'predic3s-' + SYNC.ns + '-';
    try { Object.keys(localStorage).filter(k => k.startsWith(pref)).forEach(k => localStorage.removeItem(k)); } catch (e) { }
    clearInterval(SYNC.iv); SYNC.ns = ''; SYNC.fila.clear(); SYNC.estado = {}; SYNC.conflitos = {};
  }
};
function useSync() { const [, f] = useState(0); useEffect(() => { const g = () => f(x => x + 1); SYNC.ouv.add(g); return () => SYNC.ouv.delete(g); }, []); }

// Estudos da versão anterior (salvos só no navegador, sem conta)
const estudosLegados = () => { try { return (JSON.parse(localStorage.getItem('predic3-index') || '[]') || []).filter(x => localStorage.getItem('predic3-st-' + x.id)); } catch (e) { return []; } };
async function migrarLegados() {
  const l = estudosLegados(); let n = 0;
  for (const x of l) { try { const d = JSON.parse(localStorage.getItem('predic3-st-' + x.id)); STORE.novo({ ...d, id: undefined }); n++; } catch (e) { } }
  lsSet('predic3-migrado-' + SYNC.ns, Date.now());
  await SYNC.tentar();
  return n;
}

/* ============================ telas de entrada ============================ */
const iniciais = n => String(n || '?').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join('') || '?';
function Senha({ value, onChange, placeholder, auto = 'current-password', autoFocus }) {
  const [ver, setVer] = useState(false);
  return html`<div className="pwd"><input className="in box lg" type=${ver ? 'text' : 'password'} value=${value} onChange=${e => onChange(e.target.value)} placeholder=${placeholder} autoComplete=${auto} autoFocus=${autoFocus} required />
    <button type="button" className="pwd-eye" onClick=${() => setVer(v => !v)} aria-label=${ver ? 'Ocultar senha' : 'Mostrar senha'} title=${ver ? 'Ocultar senha' : 'Mostrar senha'}><${Icon} n="eye" s=${15} /></button></div>`;
}
// Painel de marca à esquerda das telas de entrada
const PainelMarca = () => html`<aside className="auth-brand">
  <div className="auth-sky" aria-hidden="true"><svg viewBox="0 0 600 260" preserveAspectRatio="xMidYMax slice">
    <defs><linearGradient id="ab-t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#D9B46C" stopOpacity=".55" /><stop offset="1" stopColor="#D9B46C" stopOpacity="0" /></linearGradient></defs>
    ${[[20, 120, 46], [72, 70, 38], [116, 150, 54], [176, 96, 40], [222, 190, 58], [286, 128, 44], [336, 220, 62], [404, 150, 46], [456, 110, 40], [502, 176, 52], [560, 92, 36]].map(([x, h, w], i) => html`<g key=${i}><rect x=${x} y=${260 - h} width=${w} height=${h} rx="3" fill="url(#ab-t)" />
      ${Array.from({ length: Math.floor(h / 22) }, (_, j) => html`<rect key=${j} x=${x + 8} y=${260 - h + 12 + j * 22} width=${w - 16} height="2" fill="#F6E4AE" opacity=${(i * 7 + j * 3) % 5 === 0 ? 0.55 : 0.12} />`)}</g>`)}
    <path d="M0 210 C120 200 180 150 260 140 S420 70 600 30" fill="none" stroke="#5EEAB0" strokeWidth="2" strokeDasharray="1 7" strokeLinecap="round" opacity=".7" />
  </svg></div>
  <div className="auth-brand-in">
    <${Logo} s=${44} sub="Inteligência para incorporação" claro=${true} />
    <div className="auth-pitch">
      <h1>Decida o próximo empreendimento com a precisão de um comitê.</h1>
      <p>Localização, legislação, mercado, produto e fluxo de caixa mensal num só estudo, com dados públicos ao vivo e um analista de IA que lê tudo.</p>
    </div>
    <ul className="auth-pts">
      <li><${Icon} n="chart" s=${15} />TIR, VPL, exposição e payback em cenários</li>
      <li><${Icon} n="users" s=${15} />Estudos compartilhados com a sua equipe</li>
      <li><${Icon} n="shield" s=${15} />Dados da empresa protegidos no seu servidor</li>
    </ul>
  </div>
</aside>`;

function Entrada({ status, onEntrou }) {
  const setup = status.setup;
  const [f, setF] = useState({ empresa: '', nome: '', email: '', cargo: '', senha: '', senha2: '', codigo: '', termos: false });
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState('');
  const up = p => setF(x => ({ ...x, ...p }));
  const enviar = async e => {
    e.preventDefault(); setMsg('');
    if (setup && f.senha !== f.senha2) { setMsg('As senhas não conferem.'); return; }
    if (setup && !f.termos) { setMsg('Aceite os termos de uso e a política de privacidade para continuar.'); return; }
    setBusy(true);
    try { onEntrou(await SRV.post(setup ? '/api/auth/setup' : '/api/auth/login', setup ? f : { email: f.email, senha: f.senha })); }
    catch (err) { setMsg(err.message); setBusy(false); }
  };
  return html`<div className="auth">
    <${PainelMarca} />
    <main className="auth-main">
      <form className="auth-card" onSubmit=${enviar}>
        <div className="auth-mlogo"><${Logo} s=${36} /></div>
        <div className="eyebrow gold">${setup ? 'Primeiro acesso' : 'Bem-vindo de volta'}</div>
        <h2 className="disp">${setup ? 'Configure o PREDIC da sua empresa' : 'Entrar no PREDIC'}</h2>
        <p className="sub lead">${setup ? 'Esta conta será a de administrador: ela convida a equipe, define a cota de IA e cuida dos dados da empresa.' : 'Use o e-mail e a senha cadastrados pelo administrador da sua empresa.'}</p>
        ${setup ? html`<div className="grid g2 tight">
          <${Field} label="Empresa / incorporadora" style=${{ gridColumn: '1 / -1' }}><input className="in box lg" value=${f.empresa} onChange=${e => up({ empresa: e.target.value })} placeholder="Ex.: Construtora Horizonte" required autoFocus /><//>
          <${Field} label="Seu nome"><input className="in box lg" value=${f.nome} onChange=${e => up({ nome: e.target.value })} autoComplete="name" required /><//>
          <${Field} label="Cargo (opcional)"><input className="in box lg" value=${f.cargo} onChange=${e => up({ cargo: e.target.value })} placeholder="Ex.: Diretor de novos negócios" /><//>
        </div>` : null}
        <${Field} label="E-mail"><input className="in box lg" type="email" value=${f.email} onChange=${e => up({ email: e.target.value })} autoComplete="username" required autoFocus=${!setup} /><//>
        <${Field} label="Senha"><${Senha} value=${f.senha} onChange=${v => up({ senha: v })} auto=${setup ? 'new-password' : 'current-password'} placeholder=${setup ? 'mínimo de 8 caracteres, com letras e números' : ''} /><//>
        ${setup ? html`<${Field} label="Confirme a senha"><${Senha} value=${f.senha2} onChange=${v => up({ senha2: v })} auto="new-password" /><//>
          ${!status.setupLocal ? html`<${Field} label="Código de configuração"><input className="in box lg mono" value=${f.codigo} onChange=${e => up({ codigo: e.target.value })} placeholder="XXXX-XXXX" required /><span className="sub">Aparece no terminal onde o servidor do PREDIC foi iniciado. Protege a criação do administrador quando o sistema está na rede.</span><//>` : null}
          <label className="check auth-terms"><input type="checkbox" checked=${f.termos} onChange=${e => up({ termos: e.target.checked })} /><span>Li e aceito os <a href="privacidade.html" target="_blank" rel="noopener">termos de uso e a política de privacidade</a>, inclusive o envio de documentos e dados dos estudos à Anthropic para processamento pela IA.</span></label>` : null}
        ${msg ? html`<div className="alert cr" role="alert">${msg}</div>` : null}
        <button className="btn g lg block" disabled=${busy}>${busy ? html`<span className="spin sm"></span>` : null}${setup ? 'Criar empresa e entrar' : 'Entrar'}</button>
        ${!setup ? html`<p className="sub center">Esqueceu a senha? Peça ao administrador da sua empresa para redefini-la.</p>` : null}
        <div className="auth-foot"><a href="privacidade.html" target="_blank" rel="noopener">Privacidade</a><span>·</span><span>PREDIC ${status.versao || ''}</span>${location.protocol === 'http:' && !/^(localhost|127\.)/.test(location.hostname) ? html`<span>·</span><span className="warn" title="A conexão não usa HTTPS. Peça ao administrador para ativar o certificado (veja o README).">conexão sem HTTPS</span>` : null}</div>
      </form>
    </main>
  </div>`;
}

function TrocarSenha({ perfil, onPronto, onSair }) {
  const [a, setA] = useState(''), [n, setN] = useState(''), [n2, setN2] = useState(''), [busy, setBusy] = useState(false), [msg, setMsg] = useState('');
  const obrig = perfil.usuario.trocarSenha;
  const enviar = async e => {
    e.preventDefault(); setMsg('');
    if (n !== n2) { setMsg('As senhas não conferem.'); return; }
    setBusy(true);
    try { onPronto(await SRV.post('/api/conta/senha', { atual: a, nova: n })); toast('Senha definida.'); } catch (err) { setMsg(err.message); setBusy(false); }
  };
  return html`<div className="auth solo"><main className="auth-main"><form className="auth-card" onSubmit=${enviar}>
    <div className="auth-mlogo show"><${Logo} s=${36} /></div>
    <div className="eyebrow gold">Segurança da conta</div>
    <h2 className="disp">${obrig ? 'Defina a sua senha' : 'Trocar senha'}</h2>
    <p className="sub lead">${obrig ? 'Você entrou com uma senha provisória. Escolha uma senha pessoal para continuar.' : ''}</p>
    ${!obrig ? html`<${Field} label="Senha atual"><${Senha} value=${a} onChange=${setA} /><//>` : null}
    <${Field} label="Nova senha"><${Senha} value=${n} onChange=${setN} auto="new-password" placeholder="mínimo de 8 caracteres, com letras e números" autoFocus=${obrig} /><//>
    <${Field} label="Confirme a nova senha"><${Senha} value=${n2} onChange=${setN2} auto="new-password" /><//>
    ${msg ? html`<div className="alert cr">${msg}</div>` : null}
    <button className="btn g lg block" disabled=${busy}>Salvar senha</button>
    <button type="button" className="btn ghost block" onClick=${onSair}>Sair</button>
  </form></main></div>`;
}

function AceiteTermos({ onPronto, onSair }) {
  const [ok, setOk] = useState(false), [busy, setBusy] = useState(false);
  const aceitar = async () => { setBusy(true); try { onPronto(await SRV.post('/api/conta/termos')); } catch (e) { toast(e.message, true); setBusy(false); } };
  return html`<${Modal} title="Termos de uso e privacidade" icon="shield" onClose=${onSair} footer=${html`<button className="btn" onClick=${onSair}>Sair</button><button className="btn g" disabled=${!ok || busy} onClick=${aceitar}>Aceitar e continuar</button>`}>
    <p>Antes do primeiro uso, confirme que leu como o PREDIC trata os dados:</p>
    <ul className="bul">
      <li>Os estudos pertencem à sua empresa e ficam no servidor dela; os administradores podem gerenciar contas e acessos.</li>
      <li>Quando você usa a IA, o conteúdo do estudo e os documentos anexados são enviados à Anthropic para processamento. O PREDIC não guarda os arquivos enviados à IA.</li>
      <li>Registramos acessos (data, IP, navegador) por segurança, por até 12 meses. Você pode baixar seus dados ou excluir sua conta em Configurações › Privacidade.</li>
    </ul>
    <label className="check"><input type="checkbox" checked=${ok} onChange=${e => setOk(e.target.checked)} /><span>Li e aceito os <a href="privacidade.html" target="_blank" rel="noopener">termos de uso e a política de privacidade</a>.</span></label>
  <//>`;
}

/* ============================ menu do usuário ============================ */
function MenuUsuario({ perfil, onConfig, onSair, compacto }) {
  if (!perfil) return html`<button className="iconbtn" title="Configurações" onClick=${() => onConfig()}><${Icon} n="gear" /></button>`;
  const u = perfil.usuario;
  return html`<${Menu} button=${t => html`<button className=${'avatarbtn' + (compacto ? ' sm' : '')} onClick=${t} title=${u.nome + ' · ' + perfil.empresa.nome}><span className="avatar">${iniciais(u.nome)}</span>${compacto ? null : html`<span className="avn"><b>${u.nome.split(' ')[0]}</b><small>${u.papel === 'admin' ? 'Administrador' : 'Equipe'}</small></span>`}</button>`}>
    <div className="menu-id"><span className="avatar lg">${iniciais(u.nome)}</span><div><b>${u.nome}</b><small>${u.email}</small><small>${perfil.empresa.nome}</small></div></div>
    <hr />
    <button onClick=${() => onConfig('perfil')}><${Icon} n="user" />Minha conta</button>
    ${u.papel === 'admin' ? html`<button onClick=${() => onConfig('usuarios')}><${Icon} n="users" />Equipe e acessos</button>` : null}
    <button onClick=${() => onConfig('ia')}><${Icon} n="chart" />Uso da IA</button>
    <button onClick=${() => onConfig('dados')}><${Icon} n="shield" />Dados e privacidade</button>
    <hr />
    <button onClick=${onSair}><${Icon} n="logout" />Sair</button>
  <//>`;
}

/* ============================ configurações ============================ */
const usd = v => 'US$ ' + nf(2).format(v || 0);
const ABAS_SRV = [['perfil', 'Minha conta', 'user'], ['empresa', 'Empresa', 'briefcase'], ['usuarios', 'Equipe', 'users'], ['ia', 'Uso da IA', 'chart'], ['dados', 'Dados e privacidade', 'shield']];
function ConfigModal({ cfg, setCfg, ai, perfil, setPerfil, aba0, onClose, onSair }) {
  const adm = perfil?.usuario.papel === 'admin';
  const abas = perfil ? ABAS_SRV.filter(a => a[0] !== 'usuarios' || adm) : [['local', 'Geral', 'gear'], ['dados', 'Dados', 'shield']];
  const [aba, setAba] = useState(abas.some(a => a[0] === aba0) ? aba0 : abas[0][0]);
  return html`<${Modal} title="Configurações" icon="gear" lg=${true} onClose=${onClose}>
    <div className="cfg">
      <nav className="cfg-nav">${abas.map(([k, l, ic]) => html`<button key=${k} className=${aba === k ? 'on' : ''} onClick=${() => setAba(k)}><${Icon} n=${ic} s=${15} />${l}</button>`)}</nav>
      <div className="cfg-body">
        ${aba === 'perfil' ? html`<${AbaPerfil} perfil=${perfil} setPerfil=${setPerfil} cfg=${cfg} setCfg=${setCfg} />` : null}
        ${aba === 'empresa' ? html`<${AbaEmpresa} perfil=${perfil} setPerfil=${setPerfil} adm=${adm} />` : null}
        ${aba === 'usuarios' ? html`<${AbaUsuarios} perfil=${perfil} />` : null}
        ${aba === 'ia' ? html`<${AbaIA} perfil=${perfil} setPerfil=${setPerfil} adm=${adm} ai=${ai} />` : null}
        ${aba === 'dados' ? html`<${AbaDados} perfil=${perfil} onSair=${onSair} />` : null}
        ${aba === 'local' ? html`<${AbaLocal} cfg=${cfg} setCfg=${setCfg} ai=${ai} onClose=${onClose} />` : null}
      </div>
    </div>
  <//>`;
}
const SecH = ({ t, d }) => html`<div className="cfg-h"><h3>${t}</h3>${d ? html`<p className="sub">${d}</p>` : null}</div>`;
const Tema = ({ cfg, setCfg }) => html`<div><${SecH} t="Aparência" d="Vale para este navegador." /><${Seg} opts=${[['sistema', 'Automático'], ['claro', 'Claro'], ['escuro', 'Escuro']]} value=${cfg.tema} onChange=${v => setCfg({ ...cfg, tema: v })} /></div>`;

function AbaPerfil({ perfil, setPerfil, cfg, setCfg }) {
  const u = perfil.usuario;
  const [f, setF] = useState({ nome: u.nome, cargo: u.cargo }), [s, setS] = useState({ atual: '', nova: '', nova2: '' }), [busy, setBusy] = useState('');
  const salvar = async () => { setBusy('p'); try { setPerfil(await SRV.patch('/api/conta', f)); toast('Perfil atualizado.'); } catch (e) { toast(e.message, true); } setBusy(''); };
  const senha = async () => { if (s.nova !== s.nova2) { toast('As senhas não conferem.', true); return; } setBusy('s'); try { setPerfil(await SRV.post('/api/conta/senha', { atual: s.atual, nova: s.nova })); setS({ atual: '', nova: '', nova2: '' }); toast('Senha alterada. As outras sessões foram encerradas.'); } catch (e) { toast(e.message, true); } setBusy(''); };
  return html`<div className="cfg-sec">
    <div className="cfg-hero"><span className="avatar xl">${iniciais(u.nome)}</span><div><h2>${u.nome}</h2><div className="sub">${u.email} · ${u.papel === 'admin' ? 'Administrador' : 'Equipe'} · ${perfil.empresa.nome}</div></div></div>
    <div><${SecH} t="Seus dados" d="Seu nome e cargo aparecem como responsável na capa dos relatórios." />
      <div className="grid g2"><${Field} label="Nome"><input className="in box" value=${f.nome} onChange=${e => setF({ ...f, nome: e.target.value })} /><//><${Field} label="Cargo / registro"><input className="in box" value=${f.cargo} onChange=${e => setF({ ...f, cargo: e.target.value })} placeholder="Ex.: Gerente de novos negócios · CRECI 00000" /><//></div>
      <div className="row-end"><button className="btn g" disabled=${busy === 'p'} onClick=${salvar}>Salvar</button></div></div>
    <div><${SecH} t="Senha" d="Ao trocar a senha, as sessões abertas em outros aparelhos são encerradas." />
      <div className="grid g3"><${Field} label="Senha atual"><${Senha} value=${s.atual} onChange=${v => setS({ ...s, atual: v })} /><//><${Field} label="Nova senha"><${Senha} value=${s.nova} onChange=${v => setS({ ...s, nova: v })} auto="new-password" /><//><${Field} label="Confirme"><${Senha} value=${s.nova2} onChange=${v => setS({ ...s, nova2: v })} auto="new-password" /><//></div>
      <div className="row-end"><button className="btn" disabled=${busy === 's' || !s.nova} onClick=${senha}><${Icon} n="lock" s=${14} />Trocar senha</button></div></div>
    <${Tema} cfg=${cfg} setCfg=${setCfg} />
  </div>`;
}

function AbaEmpresa({ perfil, setPerfil, adm }) {
  const e0 = perfil.empresa; const [f, setF] = useState({ nome: e0.nome, logo: e0.logo }), [busy, setBusy] = useState(false);
  const logo = e => { const fl = e.target.files[0]; e.target.value = ''; if (!fl) return; if (fl.size > 400e3) { toast('Use um logotipo de até 400 KB.', true); return; } const r = new FileReader(); r.onload = () => setF(x => ({ ...x, logo: r.result })); r.readAsDataURL(fl); };
  const salvar = async () => { setBusy(true); try { setPerfil(await SRV.patch('/api/empresa', { nome: f.nome, logo: f.logo })); toast('Dados da empresa salvos.'); } catch (e) { toast(e.message, true); } setBusy(false); };
  return html`<div className="cfg-sec">
    <${SecH} t="Identidade da empresa" d=${adm ? 'Aparece na barra lateral, na capa e no rodapé dos relatórios de todos da equipe.' : 'Somente administradores podem alterar.'} />
    <div className="grid g2">
      <${Field} label="Empresa / incorporadora"><input className="in box" value=${f.nome} disabled=${!adm} onChange=${e => setF({ ...f, nome: e.target.value })} /><//>
      <${Field} label="Logotipo (PNG, JPG, SVG ou WEBP, até 400 KB)"><div className="logo-pick">${f.logo ? html`<img src=${f.logo} alt="logotipo" />` : html`<span className="sub">sem logotipo</span>`}
        ${adm ? html`<label className="btn sm">Escolher…<input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" hidden onChange=${logo} /></label>${f.logo ? html`<button className="btn sm danger" onClick=${() => setF({ ...f, logo: '' })}>Remover</button>` : null}` : null}</div><//>
    </div>
    ${adm ? html`<div className="row-end"><button className="btn g" disabled=${busy} onClick=${salvar}>Salvar</button></div>` : null}
  </div>`;
}

function AbaUsuarios({ perfil }) {
  const [l, setL] = useState(null), [novo, setNovo] = useState({ nome: '', email: '', papel: 'membro' }), [prov, setProv] = useState(null), [busy, setBusy] = useState(false);
  const carregar = () => SRV.get('/api/usuarios').then(r => setL(r.usuarios)).catch(e => toast(e.message, true));
  useEffect(() => { carregar(); }, []);
  const criar = async e => { e.preventDefault(); setBusy(true); try { const r = await SRV.post('/api/usuarios', novo); setProv({ nome: r.usuario.nome, email: r.usuario.email, senha: r.senhaProvisoria }); setNovo({ nome: '', email: '', papel: 'membro' }); carregar(); } catch (err) { toast(err.message, true); } setBusy(false); };
  const alterar = async (x, p, txt) => { try { const r = await SRV.patch('/api/usuarios/' + x.id, p); if (r.senhaProvisoria) setProv({ nome: x.nome, email: x.email, senha: r.senhaProvisoria }); else toast(txt); carregar(); } catch (e) { toast(e.message, true); } };
  const excluir = async x => { if (!confirmar('Excluir a conta de ' + x.nome + '? Os estudos continuam na empresa; o histórico de uso fica anônimo.')) return; try { await SRV.del('/api/usuarios/' + x.id); toast('Conta excluída.'); carregar(); } catch (e) { toast(e.message, true); } };
  const copiar = t => navigator.clipboard?.writeText(t).then(() => toast('Copiado.'), () => { });
  return html`<div className="cfg-sec">
    <${SecH} t="Equipe" d="Cada pessoa tem login próprio. Todos veem e editam os estudos da empresa; administradores também gerenciam contas, identidade e cota de IA." />
    ${prov ? html`<div className="alert ok prov"><div><b>Conta pronta para ${prov.nome}.</b> Envie por um canal seguro: e-mail <span className="mono">${prov.email}</span> e senha provisória <span className="mono strong">${prov.senha}</span>. A pessoa define a senha dela no primeiro acesso; esta senha não será mostrada de novo.</div>
      <div style=${{ display: 'flex', gap: 6 }}><button className="btn sm" onClick=${() => copiar('PREDIC · ' + location.origin + '\nE-mail: ' + prov.email + '\nSenha provisória: ' + prov.senha)}><${Icon} n="copy" s=${13} />Copiar acesso</button><button className="btn sm ghost" onClick=${() => setProv(null)}>Fechar</button></div></div>` : null}
    <form className="newuser" onSubmit=${criar}>
      <input className="in box" placeholder="Nome" value=${novo.nome} onChange=${e => setNovo({ ...novo, nome: e.target.value })} required />
      <input className="in box" type="email" placeholder="E-mail" value=${novo.email} onChange=${e => setNovo({ ...novo, email: e.target.value })} required />
      <select className="in box" value=${novo.papel} onChange=${e => setNovo({ ...novo, papel: e.target.value })}><option value="membro">Equipe</option><option value="admin">Administrador</option></select>
      <button className="btn g" disabled=${busy}><${Icon} n="plus" s=${14} />Adicionar</button>
    </form>
    ${!l ? html`<div className="spin"></div>` : html`<div className="ulist">${l.map(x => html`<div key=${x.id} className=${'urow' + (x.ativo ? '' : ' off')}>
      <span className="avatar">${iniciais(x.nome)}</span>
      <div className="uinfo"><b>${x.nome}${x.id === perfil.usuario.id ? html` <span className="tagx">você</span>` : null}</b><small>${x.email}</small></div>
      <div className="umeta"><span className=${'pill ' + (x.papel === 'admin' ? 'p-gold' : 'p-na')}>${x.papel === 'admin' ? 'Administrador' : 'Equipe'}</span>${!x.ativo ? html`<span className="pill p-cr">desativado</span>` : x.trocarSenha ? html`<span className="pill p-at">aguardando 1º acesso</span>` : null}
        <small>${x.ultimoAcesso ? 'último acesso ' + horaBR(x.ultimoAcesso) : 'nunca entrou'}</small></div>
      ${x.id !== perfil.usuario.id ? html`<${Menu} button=${t => html`<button className="iconbtn" onClick=${t} aria-label="Ações"><${Icon} n="more" /></button>`}>
        <button onClick=${() => alterar(x, { papel: x.papel === 'admin' ? 'membro' : 'admin' }, 'Permissão alterada.')}><${Icon} n="key" />${x.papel === 'admin' ? 'Tornar membro da equipe' : 'Tornar administrador'}</button>
        <button onClick=${() => alterar(x, { redefinirSenha: true })}><${Icon} n="lock" />Gerar nova senha provisória</button>
        <button onClick=${() => alterar(x, { ativo: !x.ativo }, x.ativo ? 'Acesso suspenso.' : 'Acesso reativado.')}><${Icon} n=${x.ativo ? 'x' : 'check'} />${x.ativo ? 'Suspender acesso' : 'Reativar acesso'}</button>
        <hr /><button onClick=${() => excluir(x)}><${Icon} n="trash" />Excluir conta</button>
      <//>` : html`<span style=${{ width: 32 }}></span>`}
    </div>`)}</div>`}
  </div>`;
}

function AbaIA({ perfil, setPerfil, adm, ai }) {
  const [u, setU] = useState(null), [cota, setCota] = useState(perfil.empresa.cota), [busy, setBusy] = useState(false);
  useEffect(() => { SRV.get('/api/uso').then(setU).catch(e => toast(e.message, true)); }, []);
  const salvarCota = async () => { setBusy(true); try { setPerfil(await SRV.patch('/api/empresa', { cota })); toast('Cota atualizada.'); SRV.get('/api/uso').then(setU); } catch (e) { toast(e.message, true); } setBusy(false); };
  const p = u && u.cota > 0 ? Math.min(1, u.gasto / u.cota) : 0;
  const ROT = { chat: 'Assistente', parecer: 'Parecer técnico', auditoria: 'Auditoria de premissas', extracao: 'Leitura de documentos', produtos: 'Sugestão de produtos' };
  return html`<div className="cfg-sec">
    <${SecH} t="Uso da IA neste mês" d=${'Estimativa pelos preços públicos da Anthropic. A cobrança oficial está no Console da Anthropic de quem paga a chave.'} />
    ${!ai?.ai ? html`<${IASemAcesso} ai=${ai} compacto=${true} />` : null}
    ${!u ? html`<div className="spin"></div>` : html`
      <div className="usage">
        <div className="usage-top"><div><span className="eyebrow">Gasto estimado</span><b className="big">${usd(u.gasto)}</b></div><div className="r"><span className="eyebrow">Cota mensal</span><b>${u.cota > 0 ? usd(u.cota) : 'sem limite'}</b></div></div>
        ${u.cota > 0 ? html`<div className="meter"><i style=${{ width: p * 100 + '%', background: p > 0.9 ? 'var(--r2)' : p > 0.7 ? 'var(--y2)' : 'var(--brand)' }}></i></div><div className="sub">${pct(p, 0)} da cota · ${u.chamadas} chamada(s) · ao atingir a cota, a IA fica bloqueada até o mês seguinte ou até um administrador aumentá-la.</div>` : html`<div className="sub">${u.chamadas} chamada(s) no mês.</div>`}
      </div>
      <div className="grid g2">
        <div><h4 className="minih">Por recurso</h4>${u.porRota.length ? u.porRota.map((r, i) => html`<div key=${i} className="kv"><span>${ROT[r.rota] || r.rota}<small className="sub"> · ${r.n}× · ${r.modelo}</small></span><b>${usd(r.usd)}</b></div>`) : html`<p className="sub">Nenhum uso ainda.</p>`}</div>
        ${adm ? html`<div><h4 className="minih">Por pessoa</h4>${u.porUsuario.length ? u.porUsuario.map((r, i) => html`<div key=${i} className="kv"><span>${r.nome}<small className="sub"> · ${r.n}×</small></span><b>${usd(r.usd)}</b></div>`) : html`<p className="sub">Nenhum uso ainda.</p>`}</div>` : null}
      </div>
      <div className="note">Modelo: ${u.modelo}${u.modeloExtracao !== u.modelo ? ' · leitura de documentos: ' + u.modeloExtracao : ''}. Para baratear a leitura de documentos, o administrador do servidor pode definir PREDIC_MODEL_EXTRACAO=claude-sonnet-5-5 no arquivo .env.</div>`}
    ${adm ? html`<div><${SecH} t="Cota mensal da empresa" d="Limite de gasto estimado com IA por mês. Use 0 para não limitar." />
      <div className="row"><div style=${{ width: 180 }}><${Num} className="box" value=${cota} onChange=${setCota} min=${0} dec=${2} /></div><span className="sub">US$ por mês</span><button className="btn g" disabled=${busy} onClick=${salvarCota}>Salvar cota</button></div></div>` : null}
  </div>`;
}

function AbaDados({ perfil, onSair }) {
  const [senha, setSenha] = useState(''), [conf, setConf] = useState(false);
  const leg = MODO.servidor ? estudosLegados() : [];
  const tudo = async () => {
    try { if (perfil) { await SYNC.puxar(); for (const x of STORE.idx()) await SYNC.garantir(x.id).catch(() => { }); } exportarBackup(STORE.idx().map(x => STORE.load(x.id)).filter(Boolean)); }
    catch (e) { toast(e.message, true); }
  };
  const meus = async () => { try { const r = await fetch('/api/conta/exportar', { cache: 'no-store' }); if (!r.ok) throw new Error('HTTP ' + r.status); baixar('predic-meus-dados.json', await r.text(), 'application/json'); } catch (e) { toast('Não foi possível exportar: ' + e.message, true); } };
  const excluir = async () => {
    try { const r = await SRV.post('/api/conta/excluir', { senha }); SYNC.limpar(); toast(r.empresaExcluida ? 'Conta e dados da empresa excluídos.' : 'Sua conta foi excluída.'); setTimeout(() => location.reload(), 1200); }
    catch (e) { toast(e.message, true); }
  };
  const migrar = async () => { const n = await migrarLegados(); toast(n + ' estudo(s) enviados para a conta da empresa.'); };
  return html`<div className="cfg-sec">
    <${SecH} t="Backup dos estudos" d=${perfil ? 'Os estudos ficam no servidor da empresa. Baixe uma cópia completa periodicamente.' : 'Os estudos ficam salvos neste navegador. Faça backups periódicos.'} />
    <div className="row"><button className="btn" onClick=${tudo}><${Icon} n="down" s=${14} />Backup de todos os estudos (.json)</button></div>
    ${leg.length ? html`<div className="alert at"><b>${leg.length} estudo(s) da versão anterior</b> estão salvos só neste navegador. <button className="btn sm" style=${{ marginLeft: 8 }} onClick=${migrar}>Enviar para a conta da empresa</button></div>` : null}
    ${perfil ? html`
      <div><${SecH} t="Seus dados pessoais (LGPD)" d="Baixe tudo o que o PREDIC guarda sobre você: cadastro, sessões, uso da IA e registro de acessos." />
        <div className="row"><button className="btn" onClick=${meus}><${Icon} n="down" s=${14} />Baixar meus dados</button><a className="btn ghost" href="privacidade.html" target="_blank" rel="noopener"><${Icon} n="shield" s=${14} />Política de privacidade</a></div></div>
      <div className="danger-zone"><${SecH} t="Excluir minha conta" d=${'Remove seu login e anonimiza seu histórico. Os estudos pertencem à empresa e continuam disponíveis para a equipe. Se você for a última pessoa da empresa, todos os dados da empresa são apagados.'} />
        ${conf ? html`<div className="row"><div style=${{ width: 260 }}><${Senha} value=${senha} onChange=${setSenha} placeholder="Confirme com a sua senha" /></div><button className="btn danger-solid" disabled=${!senha} onClick=${excluir}>Excluir definitivamente</button><button className="btn ghost" onClick=${() => setConf(false)}>Cancelar</button></div>`
          : html`<button className="btn danger" onClick=${() => setConf(true)}><${Icon} n="trash" s=${14} />Excluir minha conta…</button>`}</div>` : null}
  </div>`;
}

function AbaLocal({ cfg, setCfg, ai }) {
  const up = p => setCfg({ ...cfg, ...p });
  const logo = e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; if (f.size > 400e3) { toast('Use um logotipo de até 400 KB.', true); return; } const r = new FileReader(); r.onload = () => up({ logo: r.result }); r.readAsDataURL(f); };
  return html`<div className="cfg-sec">
    <${SecH} t="Sua empresa" d="Aparece na barra lateral, na capa e no rodapé dos relatórios." />
    <div className="grid g2">
      <${Field} label="Empresa / incorporadora"><${Txt} className="box" value=${cfg.empresa} onChange=${v => up({ empresa: v })} placeholder="Ex.: Construtora Horizonte" /><//>
      <${Field} label="Analista responsável"><${Txt} className="box" value=${cfg.analista} onChange=${v => up({ analista: v })} placeholder="Nome" /><//>
      <${Field} label="Cargo / registro"><${Txt} className="box" value=${cfg.cargo} onChange=${v => up({ cargo: v })} placeholder="Ex.: Gerente de novos negócios · CRECI 00000" /><//>
      <${Field} label="Logotipo (até 400 KB)"><div className="logo-pick">${cfg.logo ? html`<img src=${cfg.logo} alt="logotipo" />` : null}<label className="btn sm">Escolher…<input type="file" accept="image/*" hidden onChange=${logo} /></label>${cfg.logo ? html`<button className="btn sm danger" onClick=${() => up({ logo: '' })}>Remover</button>` : null}</div><//>
    </div>
    <${Tema} cfg=${cfg} setCfg=${setCfg} />
    <div><${SecH} t="Inteligência artificial" /><p className="sub">${MOTIVO_IA[ai?.motivo] || MOTIVO_IA.servidor}</p></div>
  </div>`;
}
