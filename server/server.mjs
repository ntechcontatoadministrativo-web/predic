// PREDIC · servidor: entrega o aplicativo, guarda os estudos de cada empresa, controla o acesso e faz a ponte segura com a IA.
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { SYSTEM_CHAT, SYSTEM_PARECER, CHAT_TOOLS, WEB_SEARCH_TOOL, JSON_TASKS } from './prompts.mjs';
import { abrirBanco } from './db.mjs';
import { hashSenha, confereSenha, HASH_FICTICIO, novoToken, hashToken, novoId, senhaProvisoria, validaSenha, emailValido, lerCookie, cookieSessao } from './auth.mjs';
import { custoUso } from './precos.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..');
const APP = path.join(ROOT, 'app');
const VERSAO = '3.1.0';

// .env simples (sem dependência): CHAVE=valor por linha
try {
  for (const l of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
} catch { /* sem .env */ }

const env = process.env;
const PORT = +env.PORT || 8787;
const HOST = env.HOST || '127.0.0.1';
const MODEL = env.PREDIC_MODEL || 'claude-opus-5-5';
// Modelo da leitura de documentos: o mesmo do restante, salvo se o administrador escolher outro (ex.: claude-sonnet-5-5, mais barato).
const MODEL_EXTRACAO = env.PREDIC_MODEL_EXTRACAO || MODEL;
const RATE = +env.PREDIC_RATE_PER_HOUR || 150;
const WEB = env.PREDIC_WEB_SEARCH !== 'off';
const COTA_PADRAO = env.PREDIC_COTA_MENSAL_USD === undefined || env.PREDIC_COTA_MENSAL_USD === '' ? 100 : +env.PREDIC_COTA_MENSAL_USD;
const TRUST_PROXY = /^(1|true|sim)$/i.test(env.TRUST_PROXY || '');
const DATA_DIR = path.resolve(ROOT, env.PREDIC_DATA_DIR || 'dados');
const SESSAO_DIAS = +env.PREDIC_SESSAO_DIAS || 30;
const HAS_KEY = !!(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN);
const client = HAS_KEY ? new Anthropic() : null;
// Recusas dos classificadores de segurança são refeitas no modelo de reserva recomendado pela Anthropic (desligue com PREDIC_FALLBACK=off).
const FALLBACK_ON = env.PREDIC_FALLBACK !== 'off';
const fallbackPara = m => FALLBACK_ON && !/haiku/.test(m) ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } : {};
let fallbackRecusado = false; // a API recusou o beta uma vez: segue sem ele até reiniciar

const { q, tx } = abrirBanco(DATA_DIR);

// Sem nenhum usuário, o primeiro acesso cria a empresa e o administrador.
const precisaSetup = () => q.contarUsuarios.get().n === 0;

/* ============================ utilidades HTTP ============================ */
const TLS = env.PREDIC_TLS_CERT && env.PREDIC_TLS_KEY ? { cert: fs.readFileSync(env.PREDIC_TLS_CERT), key: fs.readFileSync(env.PREDIC_TLS_KEY) } : null;
const ipDe = req => {
  // O proxy acrescenta o IP real no fim da lista; o início pode ter sido forjado pelo cliente.
  if (TRUST_PROXY) { const f = String(req.headers['x-forwarded-for'] || '').split(',').pop().trim(); if (f) return f; }
  return (req.socket.remoteAddress || '?').replace(/^::ffff:/, '');
};
const seguro = req => !!TLS || (TRUST_PROXY && String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https');
const erro = (status, msg) => Object.assign(new Error(msg), { status });

const CSP = ["default-src 'self'", "script-src 'self' 'unsafe-inline'", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:", "connect-src 'self' https:", "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'", "object-src 'none'"].join('; ');
function cabecalhos(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('Content-Security-Policy', CSP);
  if (seguro(req)) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' };
function serveStatic(req, res) {
  const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.resolve(APP, '.' + (u === '/' ? '/index.html' : u));
  if (!file.startsWith(APP + path.sep)) { res.writeHead(403).end(); return; }
  fs.stat(file, (err, s) => {
    if (err || !s.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Não encontrado'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    if (req.method === 'HEAD') { res.end(); return; }
    fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
  });
}

function readBody(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let n = 0; const chunks = [];
    req.on('data', c => { n += c.length; if (n > limit) { reject(erro(413, 'Envio grande demais (limite de ' + Math.round(limit / 1048576) + ' MB).')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { reject(erro(400, 'JSON inválido')); } });
    req.on('error', reject);
  });
}
const json = (res, status, obj, extra = {}) => res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra }).end(JSON.stringify(obj));

/* ============================ limites de uso ============================ */
// Janela deslizante por chave (usuário, IP, e-mail); limpa periodicamente para não crescer sem limite.
const janelas = new Map();
function estourou(chave, max, ms) {
  const now = Date.now(), l = (janelas.get(chave) || []).filter(t => now - t < ms);
  l.push(now); janelas.set(chave, l);
  return l.length > max;
}
const falhasLogin = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [k, l] of janelas) { const v = l.filter(t => now - t < 3600e3); if (v.length) janelas.set(k, v); else janelas.delete(k); }
  for (const [k, f] of falhasLogin) if (now - f.em > 15 * 60e3) falhasLogin.delete(k);
  q.limparSessoes.run(now);
  q.limparRegistros.run(now - 365 * 24 * 3600e3); // registro de acessos guardado por 12 meses
}, 10 * 60e3).unref();

/* ============================ sessão ============================ */
const registrar = (req, u, acao, detalhe = '') => q.registrar.run(u?.empresa_id ?? null, u?.id ?? null, acao, String(detalhe).slice(0, 500), ipDe(req), Date.now());
function usuarioDaSessao(req) {
  const t = lerCookie(req); if (!t) return null;
  const h = hashToken(t), s = q.sessao.get(h);
  if (!s || s.expira < Date.now() || !s.ativo) return null;
  const now = Date.now();
  if (s.expira - now < SESSAO_DIAS * 24 * 3600e3 / 2) q.renovarSessao.run(now + SESSAO_DIAS * 24 * 3600e3, h);
  if (!s.ultimo_acesso || now - s.ultimo_acesso > 300e3) q.acessoUsuario.run(now, s.id);
  return { ...s, tokenHash: h };
}
function abrirSessao(req, res, u) {
  const t = novoToken(), now = Date.now();
  q.novaSessao.run(hashToken(t), u.id, now, now + SESSAO_DIAS * 24 * 3600e3, ipDe(req), String(req.headers['user-agent'] || '').slice(0, 200));
  res.setHeader('Set-Cookie', cookieSessao(t, SESSAO_DIAS * 24 * 3600, seguro(req)));
}
const inicioDoMes = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).getTime(); };
const cotaDe = emp => emp.cota_usd == null ? COTA_PADRAO : emp.cota_usd;
function perfil(u) {
  const emp = q.empresa.get(u.empresa_id), g = q.gastoDesde.get(u.empresa_id, inicioDoMes());
  return {
    usuario: { id: u.id, nome: u.nome, email: u.email, cargo: u.cargo, papel: u.papel, trocarSenha: !!u.trocar_senha, termos: u.termos_em || null },
    empresa: { id: emp.id, nome: emp.nome, logo: emp.logo, cota: cotaDe(emp) },
    uso: { mes: +g.usd.toFixed(4), chamadas: g.n }
  };
}
const publicoUsuario = x => ({ id: x.id, email: x.email, nome: x.nome, cargo: x.cargo, papel: x.papel, ativo: !!x.ativo, trocarSenha: !!x.trocar_senha, criado: x.criado, ultimoAcesso: x.ultimo_acesso });

/* ============================ IA ============================ */
function explain(e) {
  if (e instanceof Anthropic.AuthenticationError) return [401, 'A chave da API Anthropic configurada no servidor é inválida.'];
  if (e instanceof Anthropic.PermissionDeniedError) return [403, 'A chave da API não tem permissão para este modelo.'];
  if (e instanceof Anthropic.RateLimitError) return [429, 'Limite de uso da IA atingido. Aguarde um minuto e tente de novo.'];
  if (e instanceof Anthropic.BadRequestError) return [400, 'A IA recusou o pedido: ' + e.message];
  if (e instanceof Anthropic.APIConnectionError) return [502, 'Sem conexão com a IA. Verifique a internet do servidor.'];
  if (e instanceof Anthropic.APIError) return [e.status || 500, 'Erro da IA (' + (e.status || '?') + '): ' + e.message];
  return [e.status || 500, e.message || String(e)];
}
// Valida o histórico vindo do navegador: só papéis user/assistant e tamanho razoável.
function cleanMessages(m) {
  if (!Array.isArray(m) || !m.length || m.length > 200) throw erro(400, 'Conversa inválida.');
  for (const x of m) if (!x || !['user', 'assistant'].includes(x.role) || x.content == null) throw erro(400, 'Mensagem inválida.');
  if (m[0].role !== 'user') throw erro(400, 'A conversa deve começar pelo usuário.');
  return m;
}
function anexos(files = []) {
  return files.slice(0, 10).map(f => {
    if (f.media_type === 'application/pdf') return { type: 'document', title: f.name, source: { type: 'base64', media_type: 'application/pdf', data: f.data } };
    if (/^image\/(png|jpeg|gif|webp)$/.test(f.media_type)) return { type: 'image', source: { type: 'base64', media_type: f.media_type, data: f.data } };
    return { type: 'document', title: f.name, source: { type: 'text', media_type: 'text/plain', data: Buffer.from(f.data, 'base64').toString('utf8') } };
  });
}
function registrarUso(u, rota, modelo, usage) {
  if (!usage) return;
  const { usd, buscas } = custoUso(modelo, usage);
  q.registrarUso.run(u.empresa_id, u.id, rota, modelo || '', usage.input_tokens || 0, usage.output_tokens || 0, usage.cache_read_input_tokens || 0, usage.cache_creation_input_tokens || 0, buscas, usd, Date.now());
}
function checarCota(u) {
  const emp = q.empresa.get(u.empresa_id), cota = cotaDe(emp);
  if (!(cota > 0)) return;
  const g = q.gastoDesde.get(u.empresa_id, inicioDoMes());
  if (g.usd >= cota) throw erro(402, `A cota mensal de IA da empresa (US$ ${cota.toFixed(2)}) foi atingida. Um administrador pode aumentá-la em Configurações › Uso da IA.`);
}
// Chama a API com o beta de reserva; se a API recusar o beta (400), refaz uma vez sem ele.
async function comFallback(modelo, fn) {
  if (!fallbackRecusado) {
    const fb = fallbackPara(modelo);
    if (fb.betas) {
      try { return await fn(fb); } catch (e) {
        if (!(e instanceof Anthropic.BadRequestError)) throw e;
        console.warn('[PREDIC] a API recusou o modelo de reserva; seguindo sem ele:', e.message); fallbackRecusado = true;
      }
    }
  }
  return fn({});
}

function sse(res) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  return o => res.write('data: ' + JSON.stringify(o) + '\n\n');
}
// Faz o streaming de uma chamada e repassa texto, raciocínio e uso de ferramentas ao navegador.
async function streamTurn(req, res, u, rota, params) {
  const send = sse(res);
  const ac = new AbortController();
  res.on('close', () => ac.abort());
  const beat = setInterval(() => res.write(': ping\n\n'), 15000);
  try {
    for (let tent = 0; ; tent++) {
      try {
        const msg = await comFallback(MODEL, async fb => {
          const stream = client.beta.messages.stream({ model: MODEL, ...fb, ...params }, { signal: ac.signal });
          for await (const ev of stream) {
            if (ev.type === 'content_block_start') {
              const b = ev.content_block;
              if (b.type === 'tool_use') send({ t: 'tool', name: b.name, id: b.id });
              else if (b.type === 'server_tool_use') send({ t: 'search' });
              else if (b.type === 'web_search_tool_result') send({ t: 'search_done', n: Array.isArray(b.content) ? b.content.length : 0 });
              else if (b.type === 'thinking') send({ t: 'thinking_start' });
            } else if (ev.type === 'content_block_delta') {
              if (ev.delta.type === 'text_delta') send({ t: 'text', d: ev.delta.text });
              else if (ev.delta.type === 'thinking_delta') send({ t: 'thinking', d: ev.delta.thinking });
            }
          }
          return stream.finalMessage();
        });
        registrarUso(u, rota, msg.model, msg.usage);
        send({ t: 'done', content: msg.content, stop_reason: msg.stop_reason, stop_details: msg.stop_details || null, model: msg.model, usage: msg.usage });
        break;
      } catch (e) {
        // JSON de ferramenta que não pôde ser lido (streaming antecipado): refaz o turno, no máximo duas vezes.
        if (e instanceof Anthropic.APIError || ac.signal.aborted || tent >= 2) throw e;
        send({ t: 'reset' });
      }
    }
  } catch (e) {
    if (!ac.signal.aborted) send({ t: 'error', msg: explain(e)[1] });
  } finally { clearInterval(beat); res.end(); }
}

/* ============================ dados públicos (proxy com cache) ============================ */
// O navegador consulta BCB, IBGE e OpenStreetMap através do servidor: respostas ficam em cache e, se a fonte cair, a última resposta boa é devolvida.
const FONTES = [
  { host: 'api.bcb.gov.br', ttl: 6 * 3600e3 },
  { host: 'servicodados.ibge.gov.br', ttl: 30 * 24 * 3600e3 },
  { host: 'apisidra.ibge.gov.br', ttl: 24 * 3600e3 },
  { host: 'api.open-meteo.com', ttl: 90 * 24 * 3600e3 },
  { host: 'nominatim.openstreetmap.org', ttl: 30 * 24 * 3600e3, fila: true }
];
const UA = 'PREDIC/' + VERSAO + ' (estudos de viabilidade imobiliaria; servidor proprio)';
let filaNominatim = Promise.resolve();
async function buscarFonte(alvo, f) {
  const go = async () => {
    const ac = new AbortController(), t = setTimeout(() => ac.abort(), 25000);
    try {
      const r = await fetch(alvo, { headers: { 'User-Agent': UA, Accept: 'application/json', 'Accept-Language': 'pt-BR' }, signal: ac.signal });
      if (!r.ok) throw erro(502, 'HTTP ' + r.status);
      const txt = await r.text(); JSON.parse(txt); return txt;
    } finally { clearTimeout(t); }
  };
  if (!f.fila) return go();
  // Nominatim: no máximo uma requisição por segundo (política de uso do OpenStreetMap)
  const p = filaNominatim.then(go, go); filaNominatim = p.then(() => new Promise(r => setTimeout(r, 1100)), () => new Promise(r => setTimeout(r, 1100)));
  return p;
}
async function proxyDados(req, res) {
  const alvo = new URL(req.url, 'http://x').searchParams.get('u') || '';
  let url; try { url = new URL(alvo); } catch { return json(res, 400, { erro: 'URL inválida' }); }
  const f = FONTES.find(x => x.host === url.hostname);
  if (url.protocol !== 'https:' || !f) return json(res, 403, { erro: 'Fonte não permitida' });
  const c = q.cacheLer.get(url.href);
  if (c && Date.now() - c.em < f.ttl) return res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'X-Predic-Cache': 'hit' }).end(c.corpo);
  try {
    const corpo = await buscarFonte(url.href, f);
    q.cacheGravar.run(url.href, corpo, Date.now());
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'X-Predic-Cache': 'miss' }).end(corpo);
  } catch (e) {
    if (c) return res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'X-Predic-Cache': 'stale', 'X-Predic-Cache-Em': String(c.em) }).end(c.corpo);
    json(res, 502, { erro: 'Fonte indisponível: ' + url.hostname });
  }
}

/* ============================ rotas ============================ */
const ROTAS = [];
const rota = (metodo, padrao, op, fn) => ROTAS.push({ metodo, re: new RegExp('^' + padrao.replace(/:(\w+)/g, '(?<$1>[\\w-]{1,80})') + '$'), op, fn });
// op: publico | sessao | admin

rota('GET', '/api/status', 'publico', (req, res) => {
  const u = usuarioDaSessao(req);
  json(res, 200, { ai: HAS_KEY, model: MODEL, modelExtracao: MODEL_EXTRACAO, webSearch: WEB, versao: VERSAO, setup: precisaSetup(),sessao: !!u, servidor: true });
});

rota('POST', '/api/auth/setup', 'publico', async (req, res, b) => {
  if (!precisaSetup()) throw erro(409, 'O PREDIC já foi configurado. Entre com sua conta.');
  if (!b.termos) throw erro(400, 'É preciso aceitar os termos de uso e a política de privacidade.');
  const nome = String(b.nome || '').trim(), email = String(b.email || '').trim(), empresa = String(b.empresa || '').trim();
  if (!empresa || !nome) throw erro(400, 'Informe o nome da empresa e o seu nome.');
  if (!emailValido(email)) throw erro(400, 'E-mail inválido.');
  const ps = validaSenha(b.senha); if (ps) throw erro(400, ps);
  const senha = await hashSenha(b.senha), now = Date.now(), eid = novoId('emp_'), uid = novoId('usr_');
  tx(() => { q.novaEmpresa.run(eid, empresa.slice(0, 120), null, now); q.novoUsuario.run(uid, eid, email, nome.slice(0, 120), String(b.cargo || '').slice(0, 120), senha, 'admin', 0, now, now); });
  const u = q.usuario.get(uid); registrar(req, u, 'setup', 'empresa criada'); abrirSessao(req, res, u);
  json(res, 200, perfil(u));
});

rota('POST', '/api/auth/login', 'publico', async (req, res, b) => {
  const email = String(b.email || '').trim().toLowerCase(), ip = ipDe(req), k = ip + '|' + email;
  const f = falhasLogin.get(k);
  if ((f && f.n >= 8) || estourou('login:' + ip, 30, 15 * 60e3)) throw erro(429, 'Muitas tentativas. Aguarde 15 minutos e tente de novo.');
  const u = q.usuarioEmail.get(email);
  const okSenha = await confereSenha(String(b.senha || ''), u ? u.senha : HASH_FICTICIO);
  if (!u || !okSenha || !u.ativo) {
    falhasLogin.set(k, { n: (f?.n || 0) + 1, em: Date.now() });
    if (u) registrar(req, u, 'login_falhou');
    throw erro(401, u && okSenha && !u.ativo ? 'Esta conta foi desativada pelo administrador da empresa.' : 'E-mail ou senha incorretos.');
  }
  falhasLogin.delete(k);
  abrirSessao(req, res, u); q.acessoUsuario.run(Date.now(), u.id); registrar(req, u, 'login');
  json(res, 200, perfil(u));
});

rota('POST', '/api/auth/logout', 'publico', (req, res) => {
  const t = lerCookie(req); if (t) q.excluirSessao.run(hashToken(t));
  res.setHeader('Set-Cookie', cookieSessao('', 0, seguro(req)));
  json(res, 200, { ok: true });
});

rota('GET', '/api/auth/eu', 'sessao', (req, res, b, u) => json(res, 200, perfil(u)));

/* ---------- conta ---------- */
rota('PATCH', '/api/conta', 'sessao', (req, res, b, u) => {
  const nome = String(b.nome ?? u.nome).trim().slice(0, 120); if (!nome) throw erro(400, 'Informe o seu nome.');
  q.atualizarUsuario.run(nome, String(b.cargo ?? u.cargo).slice(0, 120), u.papel, u.ativo, u.id);
  json(res, 200, perfil(q.usuario.get(u.id)));
});
rota('POST', '/api/conta/senha', 'sessao', async (req, res, b, u) => {
  if (!u.trocar_senha && !(await confereSenha(String(b.atual || ''), u.senha))) throw erro(400, 'A senha atual não confere.');
  const ps = validaSenha(b.nova); if (ps) throw erro(400, ps);
  q.senhaUsuario.run(await hashSenha(b.nova), 0, u.id);
  q.excluirOutrasSessoes.run(u.id, u.tokenHash);
  registrar(req, u, 'senha_alterada');
  json(res, 200, perfil(q.usuario.get(u.id)));
});
rota('POST', '/api/conta/termos', 'sessao', (req, res, b, u) => { q.termosUsuario.run(Date.now(), u.id); registrar(req, u, 'termos_aceitos'); json(res, 200, perfil(q.usuario.get(u.id))); });
// LGPD: titular pode baixar seus dados pessoais e o histórico ligado à conta.
rota('GET', '/api/conta/exportar', 'sessao', (req, res, b, u) => {
  registrar(req, u, 'dados_exportados');
  const emp = q.empresa.get(u.empresa_id);
  json(res, 200, {
    formato: 'predic-dados-pessoais', gerado: new Date().toISOString(),
    titular: { nome: u.nome, email: u.email, cargo: u.cargo, papel: u.papel, criado: new Date(u.criado).toISOString(), ultimoAcesso: u.ultimo_acesso ? new Date(u.ultimo_acesso).toISOString() : null, termosAceitos: u.termos_em ? new Date(u.termos_em).toISOString() : null },
    empresa: { nome: emp.nome },
    sessoesAtivas: q.sessoesUsuario.all(u.id).map(s => ({ criada: new Date(s.criado).toISOString(), expira: new Date(s.expira).toISOString(), ip: s.ip, navegador: s.ua })),
    usoDaIA: q.usoUsuario.all(u.id).map(x => ({ ...x, em: new Date(x.em).toISOString() })),
    registroDeAcessos: q.registrosUsuario.all(u.id).map(x => ({ ...x, em: new Date(x.em).toISOString() })),
    observacao: 'Os estudos de viabilidade pertencem à empresa e podem ser exportados pela biblioteca de estudos (backup .json).'
  }, { 'Content-Disposition': 'attachment; filename="predic-meus-dados.json"' });
});
rota('POST', '/api/conta/excluir', 'sessao', async (req, res, b, u) => {
  if (!(await confereSenha(String(b.senha || ''), u.senha))) throw erro(400, 'Senha incorreta.');
  const outros = q.usuariosEmpresa.all(u.empresa_id).filter(x => x.id !== u.id);
  if (u.papel === 'admin' && q.adminsAtivos.get(u.empresa_id).n <= 1 && outros.some(x => x.ativo)) throw erro(409, 'Você é o único administrador. Promova outra pessoa a administrador antes de excluir sua conta.');
  tx(() => {
    if (!outros.length) { q.excluirEmpresa.run(u.empresa_id); } // última conta: apaga a empresa, os estudos e o uso
    else { q.anonimizarUso.run(u.id); q.anonimizarRegistros.run(u.id); q.excluirUsuario.run(u.id); }
  });
  res.setHeader('Set-Cookie', cookieSessao('', 0, seguro(req)));
  json(res, 200, { ok: true, empresaExcluida: !outros.length });
});

/* ---------- empresa e usuários (administrador) ---------- */
rota('PATCH', '/api/empresa', 'admin', (req, res, b, u) => {
  const emp = q.empresa.get(u.empresa_id);
  const nome = String(b.nome ?? emp.nome).trim().slice(0, 120) || emp.nome;
  const logo = b.logo === undefined ? emp.logo : String(b.logo || '');
  if (logo && (!/^data:image\/(png|jpeg|svg\+xml|webp);base64,/.test(logo) || logo.length > 600e3)) throw erro(400, 'Logotipo inválido (PNG, JPG, SVG ou WEBP de até 400 KB).');
  const cota = b.cota === undefined ? emp.cota_usd : b.cota === null || b.cota === '' ? null : Math.max(0, +b.cota);
  if (cota !== null && !Number.isFinite(cota)) throw erro(400, 'Cota inválida.');
  q.atualizarEmpresa.run(nome, logo, cota, emp.id);
  registrar(req, u, 'empresa_alterada');
  json(res, 200, perfil(u));
});
rota('GET', '/api/usuarios', 'admin', (req, res, b, u) => json(res, 200, { usuarios: q.usuariosEmpresa.all(u.empresa_id).map(publicoUsuario) }));
rota('POST', '/api/usuarios', 'admin', async (req, res, b, u) => {
  const email = String(b.email || '').trim(), nome = String(b.nome || '').trim();
  if (!nome) throw erro(400, 'Informe o nome.');
  if (!emailValido(email)) throw erro(400, 'E-mail inválido.');
  if (q.usuarioEmail.get(email)) throw erro(409, 'Já existe uma conta com este e-mail.');
  const prov = senhaProvisoria(), id = novoId('usr_');
  q.novoUsuario.run(id, u.empresa_id, email, nome.slice(0, 120), String(b.cargo || '').slice(0, 120), await hashSenha(prov), b.papel === 'admin' ? 'admin' : 'membro', 1, null, Date.now());
  registrar(req, u, 'usuario_criado', email);
  json(res, 200, { usuario: publicoUsuario(q.usuario.get(id)), senhaProvisoria: prov });
});
rota('PATCH', '/api/usuarios/:id', 'admin', async (req, res, b, u, p) => {
  const x = q.usuario.get(p.id); if (!x || x.empresa_id !== u.empresa_id) throw erro(404, 'Usuário não encontrado.');
  const papel = b.papel === undefined ? x.papel : b.papel === 'admin' ? 'admin' : 'membro', ativo = b.ativo === undefined ? x.ativo : b.ativo ? 1 : 0;
  if (x.id === u.id && (papel !== 'admin' || !ativo)) throw erro(400, 'Você não pode tirar o seu próprio acesso de administrador.');
  q.atualizarUsuario.run(String(b.nome ?? x.nome).trim().slice(0, 120) || x.nome, String(b.cargo ?? x.cargo).slice(0, 120), papel, ativo, x.id);
  if (!ativo) q.excluirSessoesUsuario.run(x.id);
  let prov;
  if (b.redefinirSenha) { prov = senhaProvisoria(); q.senhaUsuario.run(await hashSenha(prov), 1, x.id); q.excluirSessoesUsuario.run(x.id); }
  registrar(req, u, 'usuario_alterado', x.email + (b.redefinirSenha ? ' (senha redefinida)' : ''));
  json(res, 200, { usuario: publicoUsuario(q.usuario.get(x.id)), senhaProvisoria: prov });
});
rota('DELETE', '/api/usuarios/:id', 'admin', (req, res, b, u, p) => {
  const x = q.usuario.get(p.id); if (!x || x.empresa_id !== u.empresa_id) throw erro(404, 'Usuário não encontrado.');
  if (x.id === u.id) throw erro(400, 'Para excluir a sua própria conta, use Configurações › Privacidade.');
  tx(() => { q.anonimizarUso.run(x.id); q.anonimizarRegistros.run(x.id); q.excluirUsuario.run(x.id); });
  registrar(req, u, 'usuario_excluido', x.email);
  json(res, 200, { ok: true });
});
rota('GET', '/api/uso', 'sessao', (req, res, b, u) => {
  const ini = inicioDoMes(), emp = q.empresa.get(u.empresa_id), g = q.gastoDesde.get(u.empresa_id, ini);
  const adm = u.papel === 'admin';
  json(res, 200, { desde: ini, gasto: g.usd, chamadas: g.n, cota: cotaDe(emp), modelo: MODEL, modeloExtracao: MODEL_EXTRACAO,
    porUsuario: adm ? q.gastoPorUsuario.all(u.empresa_id, ini).map(x => ({ nome: x.nome || 'conta excluída', usd: x.usd, n: x.n })) : [],
    porRota: q.gastoPorRota.all(u.empresa_id, ini) });
});

/* ---------- estudos ---------- */
const LIMITE_ESTUDO = 8 * 1024 * 1024;
rota('GET', '/api/estudos', 'sessao', (req, res, b, u) => json(res, 200, { estudos: q.indiceEstudos.all(u.empresa_id).map(e => ({ id: e.id, versao: e.versao, atualizado: e.atualizado, autor: e.autor || '', resumo: JSON.parse(e.resumo || '{}') })) }));
rota('GET', '/api/estudos/:id', 'sessao', (req, res, b, u, p) => {
  const e = q.estudo.get(u.empresa_id, p.id); if (!e) throw erro(404, 'Estudo não encontrado.');
  json(res, 200, { id: e.id, versao: e.versao, atualizado: e.atualizado, autor: e.autor || '', dados: JSON.parse(e.dados) });
});
rota('PUT', '/api/estudos/:id', 'sessao', (req, res, b, u, p) => {
  if (!b.dados || typeof b.dados !== 'object') throw erro(400, 'Estudo sem dados.');
  const dados = JSON.stringify({ ...b.dados, id: p.id }), now = Date.now();
  if (dados.length > LIMITE_ESTUDO) throw erro(413, 'Estudo grande demais para salvar (limite de 8 MB).');
  const atual = q.estudo.get(u.empresa_id, p.id);
  const resumo = b.resumo ? JSON.stringify(b.resumo).slice(0, 20000) : atual ? atual.resumo : '{}';
  if (!atual) {
    q.inserirEstudo.run(u.empresa_id, p.id, dados, resumo, now, now, u.id);
    return json(res, 200, { versao: 1, atualizado: now });
  }
  // controle de concorrência: só grava se o navegador partiu da versão atual (ou se pediu para sobrescrever)
  const base = b.forcar ? atual.versao : +b.versao;
  const r = q.atualizarEstudo.run(dados, resumo, now, u.id, u.empresa_id, p.id, base);
  if (!r.changes) return json(res, 409, { erro: 'Este estudo foi alterado por ' + (atual.autor || 'outra pessoa') + ' depois que você o abriu.', atual: { versao: atual.versao, atualizado: atual.atualizado, autor: atual.autor || '', dados: JSON.parse(atual.dados) } });
  json(res, 200, { versao: base + 1, atualizado: now });
});
rota('DELETE', '/api/estudos/:id', 'sessao', (req, res, b, u, p) => { q.excluirEstudo.run(u.empresa_id, p.id); registrar(req, u, 'estudo_excluido', p.id); json(res, 200, { ok: true }); });

rota('GET', '/api/dados', 'sessao', (req, res) => proxyDados(req, res));

/* ---------- IA ---------- */
const exigeIA = u => {
  if (!client) throw erro(503, 'IA não configurada: defina ANTHROPIC_API_KEY no arquivo .env do servidor e reinicie.');
  if (estourou('ia:' + u.id, RATE, 3600e3)) throw erro(429, 'Muitas solicitações de IA nesta hora. Tente mais tarde.');
  checarCota(u);
};
rota('POST', '/api/ai/chat', 'sessao', (req, res, b, u) => {
  exigeIA(u);
  const messages = cleanMessages(b.messages);
  return streamTurn(req, res, u, 'chat', {
    max_tokens: 64000,
    thinking: { type: 'adaptive', display: 'summarized' },
    output_config: { effort: 'medium' },
    cache_control: { type: 'ephemeral' },
    system: [{ type: 'text', text: SYSTEM_CHAT, cache_control: { type: 'ephemeral' } }],
    tools: CHAT_TOOLS.concat(WEB && b.web ? [WEB_SEARCH_TOOL] : []),
    messages
  });
});
rota('POST', '/api/ai/parecer', 'sessao', (req, res, b, u) => {
  exigeIA(u);
  return streamTurn(req, res, u, 'parecer', {
    max_tokens: 32000,
    thinking: { type: 'adaptive', display: 'summarized' },
    output_config: { effort: 'high' },
    system: SYSTEM_PARECER,
    messages: [{ role: 'user', content: '<estudo>\n' + JSON.stringify(b.contexto ?? {}) + '\n</estudo>\n\nRedija o parecer técnico.' + (b.instrucoes ? '\n\nOrientações do analista: ' + String(b.instrucoes).slice(0, 2000) : '') }]
  });
});
rota('POST', '/api/ai/json', 'sessao', async (req, res, b, u) => {
  const T = JSON_TASKS[b.tarefa];
  if (!T) throw erro(400, 'Tarefa desconhecida.');
  exigeIA(u);
  const modelo = b.tarefa === 'extracao' ? MODEL_EXTRACAO : MODEL;
  const content = anexos(b.arquivos).concat([{ type: 'text', text: '<estudo>\n' + JSON.stringify(b.contexto ?? {}) + '\n</estudo>\n\n' + T.pedido + (b.instrucoes ? '\n\n' + String(b.instrucoes).slice(0, 4000) : '') }]);
  const r = await comFallback(modelo, fb => client.beta.messages.parse({
    model: modelo, ...fb, max_tokens: 16000,
    output_config: { effort: T.effort, format: betaZodOutputFormat(T.schema) },
    system: T.system,
    messages: [{ role: 'user', content }]
  }));
  registrarUso(u, b.tarefa, r.model, r.usage);
  if (r.stop_reason === 'refusal') throw erro(422, 'A IA não pôde processar este pedido.');
  if (r.stop_reason === 'max_tokens' || !r.parsed_output) throw erro(502, 'A resposta da IA veio incompleta. Tente de novo com menos documentos.');
  json(res, 200, { dados: r.parsed_output, usage: r.usage, model: r.model });
});

const LIMITES = { '/api/ai/chat': 30 * 1048576, '/api/ai/json': 30 * 1048576, '/api/ai/parecer': 4 * 1048576 };
async function api(req, res, caminho) {
  const r = ROTAS.find(x => x.metodo === req.method && x.re.test(caminho)) || (req.method === 'HEAD' && ROTAS.find(x => x.metodo === 'GET' && x.re.test(caminho)));
  if (!r) return json(res, ROTAS.some(x => x.re.test(caminho)) ? 405 : 404, { erro: 'Rota não encontrada' });
  try {
    // Proteção contra CSRF: escritas exigem um cabeçalho que formulários de outros sites não conseguem enviar.
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.headers['x-predic'] !== '1') throw erro(403, 'Requisição recusada.');
    let u = null;
    if (r.op !== 'publico') {
      u = usuarioDaSessao(req);
      if (!u) throw erro(401, 'Sua sessão expirou. Entre novamente.');
      if (r.op === 'admin' && u.papel !== 'admin') throw erro(403, 'Apenas administradores da empresa podem fazer isso.');
    }
    const b = req.method === 'GET' || req.method === 'HEAD' ? {} : await readBody(req, LIMITES[caminho] || (caminho.startsWith('/api/estudos/') ? LIMITE_ESTUDO + 65536 : 1048576));
    await r.fn(req, res, b, u, caminho.match(r.re).groups || {});
  } catch (e) {
    const [st, msg] = e instanceof Anthropic.APIError ? explain(e) : [e.status || 500, e.status ? e.message : 'Erro interno do servidor.'];
    if (!e.status && !(e instanceof Anthropic.APIError)) console.error('[PREDIC]', e);
    if (!res.headersSent) json(res, st, { erro: msg }); else res.end();
  }
}

process.on('uncaughtException', e => console.error('[PREDIC] erro não tratado:', e));
process.on('unhandledRejection', e => console.error('[PREDIC] promessa rejeitada:', e));

const handler = (req, res) => {
  cabecalhos(req, res);
  const caminho = new URL(req.url, 'http://x').pathname;
  if (caminho.startsWith('/api/')) { api(req, res, caminho).catch(e => { if (!res.headersSent) json(res, 500, { erro: e.message }); }); return; }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
  serveStatic(req, res);
};
const server = TLS ? https.createServer(TLS, handler) : http.createServer(handler);
server.on('error', e => { console.error(e.code === 'EADDRINUSE' ? `
  A porta ${PORT} já está em uso. Feche o outro PREDIC ou defina PORT no .env.
` : e); process.exit(1); });
server.listen(PORT, HOST, () => {
  const prot = TLS ? 'https' : 'http';
  console.log(`\n  PREDIC ${VERSAO} rodando em ${prot}://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  console.log(`  Dados em ${DATA_DIR}`);
  console.log(`  IA: ${HAS_KEY ? 'ativa · ' + MODEL + (MODEL_EXTRACAO !== MODEL ? ' (documentos: ' + MODEL_EXTRACAO + ')' : '') + (COTA_PADRAO > 0 ? ' · cota padrão US$ ' + COTA_PADRAO + '/mês por empresa' : '') : 'desativada (defina ANTHROPIC_API_KEY no .env)'}`);
  if (HOST === '0.0.0.0' && !TLS && !TRUST_PROXY) console.log('  Aviso: aberto na rede sem HTTPS. Senhas trafegam sem criptografia; veja "HTTPS" no README.');
  if (precisaSetup()) console.log('\n  Primeiro acesso: crie a conta de administrador no navegador.');
  console.log('');
});
