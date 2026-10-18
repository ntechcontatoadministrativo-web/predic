// PREDIC · servidor: entrega o aplicativo e faz a ponte segura com a IA (a chave nunca vai para o navegador).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { SYSTEM_CHAT, SYSTEM_PARECER, CHAT_TOOLS, WEB_SEARCH_TOOL, JSON_TASKS } from './prompts.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..');
const APP = path.join(ROOT, 'app');

// .env simples (sem dependência): CHAVE=valor por linha
try {
  for (const l of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
} catch { /* sem .env */ }

const PORT = +process.env.PORT || 8787;
const HOST = process.env.HOST || '127.0.0.1';
const MODEL = process.env.PREDIC_MODEL || 'claude-opus-5-5';
const ACCESS = process.env.PREDIC_ACCESS_KEY || '';
const RATE = +process.env.PREDIC_RATE_PER_HOUR || 150;
const WEB = process.env.PREDIC_WEB_SEARCH !== 'off';
const HAS_KEY = !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
const client = HAS_KEY ? new Anthropic() : null;
// Recusas dos classificadores de segurança são refeitas no modelo de reserva recomendado pela Anthropic.
const FALLBACK = { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' };

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' };

function serveStatic(req, res) {
  const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.resolve(APP, '.' + (u === '/' ? '/index.html' : u));
  if (!file.startsWith(APP + path.sep)) { res.writeHead(403).end(); return; }
  fs.stat(file, (err, s) => {
    if (err || !s.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Não encontrado'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
  });
}

function readBody(req, limit = 30 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let n = 0; const chunks = [];
    req.on('data', c => { n += c.length; if (n > limit) { reject(Object.assign(new Error('Arquivos grandes demais (limite de 30 MB por envio).'), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { reject(Object.assign(new Error('JSON inválido'), { status: 400 })); } });
    req.on('error', reject);
  });
}

const hits = new Map();
function limited(ip) {
  const now = Date.now(), l = (hits.get(ip) || []).filter(t => now - t < 3600e3);
  l.push(now); hits.set(ip, l);
  return l.length > RATE;
}

const json = (res, status, obj) => res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify(obj));

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
  if (!Array.isArray(m) || !m.length || m.length > 200) throw Object.assign(new Error('Conversa inválida.'), { status: 400 });
  for (const x of m) if (!x || !['user', 'assistant'].includes(x.role) || x.content == null) throw Object.assign(new Error('Mensagem inválida.'), { status: 400 });
  if (m[0].role !== 'user') throw Object.assign(new Error('A conversa deve começar pelo usuário.'), { status: 400 });
  return m;
}

function anexos(files = []) {
  return files.slice(0, 10).map(f => {
    if (f.media_type === 'application/pdf') return { type: 'document', title: f.name, source: { type: 'base64', media_type: 'application/pdf', data: f.data } };
    if (/^image\/(png|jpeg|gif|webp)$/.test(f.media_type)) return { type: 'image', source: { type: 'base64', media_type: f.media_type, data: f.data } };
    return { type: 'document', title: f.name, source: { type: 'text', media_type: 'text/plain', data: Buffer.from(f.data, 'base64').toString('utf8') } };
  });
}

function sse(res) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  return o => res.write('data: ' + JSON.stringify(o) + '\n\n');
}

// Faz o streaming de uma chamada e repassa texto, raciocínio e uso de ferramentas ao navegador.
async function streamTurn(req, res, params) {
  const send = sse(res);
  const ac = new AbortController();
  res.on('close', () => ac.abort());
  const beat = setInterval(() => res.write(': ping\n\n'), 15000);
  try {
    for (let tent = 0; ; tent++) {
      try {
        const stream = client.beta.messages.stream({ model: MODEL, ...FALLBACK, ...params }, { signal: ac.signal });
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
        const msg = await stream.finalMessage();
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

async function api(req, res, route) {
  if (route === '/api/status' && req.method === 'GET') return json(res, 200, { ai: HAS_KEY, model: MODEL, webSearch: WEB, protegido: !!ACCESS, versao: '3.0.0' });
  if (req.method !== 'POST') return json(res, 405, { erro: 'Método não permitido' });
  if (!client) return json(res, 503, { erro: 'IA não configurada: defina ANTHROPIC_API_KEY no arquivo .env do servidor e reinicie.' });
  if (ACCESS) {
    const k = String(req.headers['x-predic-key'] || '');
    if (k.length !== ACCESS.length || !crypto.timingSafeEqual(Buffer.from(k), Buffer.from(ACCESS))) return json(res, 401, { erro: 'Chave de acesso do PREDIC inválida. Informe-a em Configurações.' });
  }
  if (limited(req.socket.remoteAddress || '?')) return json(res, 429, { erro: 'Muitas solicitações de IA nesta hora. Tente mais tarde.' });
  let body;
  try { body = await readBody(req); } catch (e) { return json(res, e.status || 400, { erro: e.message }); }

  try {
    if (route === '/api/ai/chat') {
      const messages = cleanMessages(body.messages);
      return streamTurn(req, res, {
        max_tokens: 64000,
        thinking: { type: 'adaptive', display: 'summarized' },
        output_config: { effort: 'medium' },
        cache_control: { type: 'ephemeral' },
        system: [{ type: 'text', text: SYSTEM_CHAT, cache_control: { type: 'ephemeral' } }],
        tools: CHAT_TOOLS.concat(WEB && body.web ? [WEB_SEARCH_TOOL] : []),
        messages
      });
    }
    if (route === '/api/ai/parecer') {
      return streamTurn(req, res, {
        max_tokens: 32000,
        thinking: { type: 'adaptive', display: 'summarized' },
        output_config: { effort: 'high' },
        system: SYSTEM_PARECER,
        messages: [{ role: 'user', content: '<estudo>\n' + JSON.stringify(body.contexto ?? {}) + '\n</estudo>\n\nRedija o parecer técnico.' + (body.instrucoes ? '\n\nOrientações do analista: ' + String(body.instrucoes).slice(0, 2000) : '') }]
      });
    }
    if (route === '/api/ai/json') {
      const T = JSON_TASKS[body.tarefa];
      if (!T) return json(res, 400, { erro: 'Tarefa desconhecida.' });
      const content = anexos(body.arquivos).concat([{ type: 'text', text: '<estudo>\n' + JSON.stringify(body.contexto ?? {}) + '\n</estudo>\n\n' + T.pedido + (body.instrucoes ? '\n\n' + String(body.instrucoes).slice(0, 4000) : '') }]);
      const r = await client.beta.messages.parse({
        model: MODEL, ...FALLBACK, max_tokens: 16000,
        output_config: { effort: T.effort, format: betaZodOutputFormat(T.schema) },
        system: T.system,
        messages: [{ role: 'user', content }]
      });
      if (r.stop_reason === 'refusal') return json(res, 422, { erro: 'A IA não pôde processar este pedido.' });
      if (r.stop_reason === 'max_tokens' || !r.parsed_output) return json(res, 502, { erro: 'A resposta da IA veio incompleta. Tente de novo com menos documentos.' });
      return json(res, 200, { dados: r.parsed_output, usage: r.usage, model: r.model });
    }
    return json(res, 404, { erro: 'Rota não encontrada' });
  } catch (e) {
    const [st, msg] = explain(e);
    if (!res.headersSent) json(res, st, { erro: msg }); else res.end();
  }
}

process.on('uncaughtException', e => console.error('[PREDIC] erro não tratado:', e));
process.on('unhandledRejection', e => console.error('[PREDIC] promessa rejeitada:', e));

const server = http.createServer((req, res) => {
  const route = new URL(req.url, 'http://x').pathname;
  if (route.startsWith('/api/')) { api(req, res, route).catch(e => { if (!res.headersSent) json(res, 500, { erro: e.message }); }); return; }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
  serveStatic(req, res);
});
server.on('error', e => { console.error(e.code === 'EADDRINUSE' ? `
  A porta ${PORT} já está em uso. Feche o outro PREDIC ou defina PORT no .env.
` : e); process.exit(1); });
server.listen(PORT, HOST, () => {
  console.log(`\n  PREDIC rodando em http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  console.log(`  IA: ${HAS_KEY ? 'ativa · ' + MODEL : 'desativada (defina ANTHROPIC_API_KEY no .env)'}${ACCESS ? ' · protegida por chave de acesso' : ''}\n`);
});
