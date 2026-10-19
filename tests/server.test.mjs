// Testa o servidor do PREDIC contra uma API Anthropic simulada: contas, estudos, streaming, ferramentas, JSON estruturado, cota e segurança.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const recebidos = [];
let mock, srv, DADOS;
const PORTA_MOCK = 9911, PORTA = 8799, BASE = 'http://127.0.0.1:' + PORTA;

function sseAnthropic(res, blocks, stop) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  const w = (ev, d) => res.write(`event: ${ev}\ndata: ${JSON.stringify({ type: ev, ...d })}\n\n`);
  w('message_start', { message: { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } } });
  blocks.forEach((b, i) => {
    if (b.type === 'text') { w('content_block_start', { index: i, content_block: { type: 'text', text: '' } }); for (const p of b.text.match(/.{1,6}/g)) w('content_block_delta', { index: i, delta: { type: 'text_delta', text: p } }); }
    if (b.type === 'tool_use') { w('content_block_start', { index: i, content_block: { type: 'tool_use', id: b.id, name: b.name, input: {} } }); w('content_block_delta', { index: i, delta: { type: 'input_json_delta', partial_json: JSON.stringify(b.input) } }); }
    w('content_block_stop', { index: i });
  });
  w('message_delta', { delta: { stop_reason: stop }, usage: { output_tokens: 20 } });
  w('message_stop', {}); res.end();
}

before(async () => {
  DADOS = fs.mkdtempSync(path.join(os.tmpdir(), 'predic-teste-'));
  mock = http.createServer((req, res) => {
    let b = ''; req.on('data', c => b += c); req.on('end', () => {
      const body = JSON.parse(b || '{}'); recebidos.push({ headers: req.headers, body });
      if (body.stream) {
        if (body.tools) return sseAnthropic(res, [{ type: 'text', text: 'Simulando o cenário pedido.' }, { type: 'tool_use', id: 'toolu_1', name: 'simular_cenario', input: { alteracoes: [{ variavel: 'vso', valor: 4 }] } }], 'tool_use');
        return sseAnthropic(res, [{ type: 'text', text: '## Síntese e recomendação\nAprovar com ressalvas.' }], 'end_turn');
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: 'msg_2', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'end_turn', usage: { input_tokens: 1000000, output_tokens: 5 },
        content: [{ type: 'text', text: JSON.stringify({ resumo: 'ok', nota: 70, achados: [{ titulo: 'VSO alta', severidade: 'atencao', secao: 'mercado', explicacao: 'x', sugestao: 'y', ajuste: { variavel: 'vso', valor: 2.8 } }] }) }] }));
    });
  }).listen(PORTA_MOCK);
  srv = spawn(process.execPath, ['server/server.mjs'], { env: { ...process.env, PORT: String(PORTA), HOST: '127.0.0.1', ANTHROPIC_API_KEY: 'sk-teste', ANTHROPIC_BASE_URL: 'http://127.0.0.1:' + PORTA_MOCK, PREDIC_DATA_DIR: DADOS, PREDIC_COTA_MENSAL_USD: '0', PREDIC_MODEL: '', PREDIC_MODEL_EXTRACAO: '', TRUST_PROXY: '' }, stdio: 'pipe' });
  await new Promise((ok, err) => { srv.stdout.on('data', d => /rodando/.test(d) && ok()); srv.on('exit', c => err(new Error('servidor saiu: ' + c))); });
});
after(() => { srv?.kill(); mock?.close(); try { fs.rmSync(DADOS, { recursive: true, force: true }); } catch { } });

const lerSSE = async r => (await r.text()).split('\n\n').filter(x => x.startsWith('data: ')).map(x => JSON.parse(x.slice(6)));
// Cliente com cookie de sessão próprio
function cliente() {
  let cookie = '';
  const f = async (rota, op = {}) => {
    const r = await fetch(BASE + rota, { ...op, headers: { 'Content-Type': 'application/json', 'x-predic': '1', ...(cookie ? { Cookie: cookie } : {}), ...op.headers }, body: op.body && typeof op.body !== 'string' ? JSON.stringify(op.body) : op.body });
    const sc = r.headers.get('set-cookie'); if (sc) { const c = sc.split(';')[0]; cookie = c.endsWith('=') ? '' : c; }
    return r;
  };
  f.j = async (rota, op) => { const r = await f(rota, op); return { status: r.status, body: await r.json().catch(() => null) }; };
  return f;
}
const admin = cliente(), membro = cliente();

test('primeiro acesso: status pede configuração e o setup cria o administrador', async () => {
  const s = await admin.j('/api/status');
  assert.equal(s.body.setup, true); assert.equal(s.body.sessao, false); assert.equal(s.body.ai, true);
  assert.equal((await admin.j('/api/auth/setup', { method: 'POST', body: { empresa: 'Horizonte', nome: 'Ana', email: 'ana@horizonte.com', senha: 'curta', termos: true } })).status, 400);
  // Pedido que passou por proxy não conta como "esta máquina": sem o código do console, o setup é recusado.
  const viaProxy = { 'X-Forwarded-For': '127.0.0.1' };
  assert.equal((await admin.j('/api/status', { headers: viaProxy })).body.setupLocal, false);
  assert.equal((await admin.j('/api/auth/setup', { method: 'POST', headers: viaProxy, body: { empresa: 'Horizonte', nome: 'Ana', email: 'ana@horizonte.com', senha: 'senha-forte-1', termos: true } })).status, 403);
  const r = await admin.j('/api/auth/setup', { method: 'POST', body: { empresa: 'Horizonte', nome: 'Ana', email: 'ana@horizonte.com', senha: 'senha-forte-1', termos: true } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.usuario.papel, 'admin'); assert.equal(r.body.empresa.nome, 'Horizonte');
  assert.equal((await admin.j('/api/auth/setup', { method: 'POST', body: { empresa: 'X', nome: 'Y', email: 'y@y.com', senha: 'senha-forte-1', termos: true } })).status, 409);
  assert.equal((await admin.j('/api/status')).body.sessao, true);
});

test('rotas protegidas exigem sessão e o cabeçalho anti-CSRF', async () => {
  const anon = cliente();
  assert.equal((await anon.j('/api/estudos')).status, 401);
  assert.equal((await anon.j('/api/ai/chat', { method: 'POST', body: { messages: [{ role: 'user', content: 'oi' }] } })).status, 401);
  const semCabecalho = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'ana@horizonte.com', senha: 'senha-forte-1' }) });
  assert.equal(semCabecalho.status, 403);
  assert.equal((await anon.j('/api/auth/login', { method: 'POST', body: { email: 'ana@horizonte.com', senha: 'errada-123' } })).status, 401);
  const r = await fetch(BASE + '/');
  assert.match(r.headers.get('content-security-policy') || '', /frame-ancestors 'none'/);
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
});

test('chat: repassa streaming e tool_use; envia ferramentas, cache e fallback', async () => {
  const r = await admin('/api/ai/chat', { method: 'POST', body: { messages: [{ role: 'user', content: 'oi' }], web: true } });
  const evs = await lerSSE(r);
  assert.equal(evs.filter(e => e.t === 'text').map(e => e.d).join(''), 'Simulando o cenário pedido.');
  assert.ok(evs.some(e => e.t === 'tool' && e.name === 'simular_cenario'));
  const done = evs.find(e => e.t === 'done');
  assert.equal(done.stop_reason, 'tool_use');
  assert.deepEqual(done.content[1].input, { alteracoes: [{ variavel: 'vso', valor: 4 }] });
  const q = recebidos.at(-1);
  assert.equal(q.body.model, 'claude-opus-5-5');
  assert.equal(q.body.fallbacks, 'default');
  assert.match(q.headers['anthropic-beta'], /server-side-fallback-2026-07-01/);
  assert.deepEqual(q.body.thinking, { type: 'adaptive', display: 'summarized' });
  assert.ok(q.body.tools.some(t => t.type === 'web_search_20260209'));
  assert.ok(q.body.tools.filter(t => t.input_schema).every(t => t.eager_input_streaming === true));
  assert.equal(q.body.system[0].cache_control.type, 'ephemeral');
});

test('parecer: streaming de texto com esforço alto', async () => {
  const evs = await lerSSE(await admin('/api/ai/parecer', { method: 'POST', body: { contexto: { a: 1 } } }));
  assert.match(evs.filter(e => e.t === 'text').map(e => e.d).join(''), /Aprovar com ressalvas/);
  assert.equal(recebidos.at(-1).body.output_config.effort, 'high');
  assert.equal(recebidos.at(-1).body.tools, undefined);
});

test('json: saída estruturada validada (auditoria) e uso registrado com custo', async () => {
  const r = await admin.j('/api/ai/json', { method: 'POST', body: { tarefa: 'auditoria', contexto: {} } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.dados.nota, 70);
  assert.equal(recebidos.at(-1).body.output_config.format.type, 'json_schema');
  const uso = await admin.j('/api/uso');
  assert.ok(uso.body.chamadas >= 3);
  assert.ok(uso.body.gasto >= 4, 'um milhão de tokens de entrada no Opus 5.5 custam US$ 4: ' + uso.body.gasto);
  assert.ok(uso.body.porRota.some(x => x.rota === 'auditoria'));
});

test('cota mensal da empresa bloqueia novas chamadas de IA', async () => {
  assert.equal((await admin.j('/api/empresa', { method: 'PATCH', body: { cota: 1 } })).status, 200);
  const r = await admin.j('/api/ai/json', { method: 'POST', body: { tarefa: 'auditoria', contexto: {} } });
  assert.equal(r.status, 402); assert.match(r.body.erro, /cota/i);
  assert.equal((await admin.j('/api/empresa', { method: 'PATCH', body: { cota: 0 } })).status, 200);
});

test('rejeita tarefa desconhecida, conversa inválida, fonte de dados externa e caminho fora do app', async () => {
  assert.equal((await admin.j('/api/ai/json', { method: 'POST', body: { tarefa: 'xpto' } })).status, 400);
  assert.equal((await admin.j('/api/ai/chat', { method: 'POST', body: { messages: [{ role: 'system', content: 'x' }] } })).status, 400);
  assert.equal((await admin.j('/api/dados?u=' + encodeURIComponent('https://example.com/x.json'))).status, 403);
  const t = await new Promise(ok => http.get({ host: '127.0.0.1', port: PORTA, path: '/../package.json' }, res => { res.resume(); ok(res.statusCode); }).on('error', () => ok(0)));
  assert.notEqual(t, 200);
});

test('estudos: salvar, listar, ler e detectar edição concorrente', async () => {
  const dados = { estudo: { nome: 'Alta Vista' }, produtos: [] };
  let r = await admin.j('/api/estudos/e1', { method: 'PUT', body: { dados, resumo: { nome: 'Alta Vista' } } });
  assert.equal(r.status, 200); assert.equal(r.body.versao, 1);
  r = await admin.j('/api/estudos/e1', { method: 'PUT', body: { dados: { ...dados, notas: 'a' }, versao: 1 } });
  assert.equal(r.body.versao, 2);
  r = await admin.j('/api/estudos/e1', { method: 'PUT', body: { dados: { ...dados, notas: 'b' }, versao: 1 } });
  assert.equal(r.status, 409); assert.equal(r.body.atual.versao, 2); assert.equal(r.body.atual.dados.notas, 'a');
  r = await admin.j('/api/estudos/e1', { method: 'PUT', body: { dados: { ...dados, notas: 'c' }, versao: 1, forcar: true } });
  assert.equal(r.body.versao, 3);
  const l = await admin.j('/api/estudos');
  assert.equal(l.body.estudos.length, 1); assert.equal(l.body.estudos[0].resumo.nome, 'Alta Vista'); assert.equal(l.body.estudos[0].autor, 'Ana');
  assert.equal((await admin.j('/api/estudos/e1')).body.dados.notas, 'c');
});

test('usuários: administrador cria membro com senha provisória; membro vê os estudos da empresa mas não administra', async () => {
  const c = await admin.j('/api/usuarios', { method: 'POST', body: { nome: 'Bruno', email: 'bruno@horizonte.com' } });
  assert.equal(c.status, 200, JSON.stringify(c.body)); assert.ok(c.body.senhaProvisoria);
  const l = await membro.j('/api/auth/login', { method: 'POST', body: { email: 'BRUNO@horizonte.com', senha: c.body.senhaProvisoria } });
  assert.equal(l.status, 200); assert.equal(l.body.usuario.trocarSenha, true); assert.equal(l.body.usuario.papel, 'membro');
  assert.equal((await membro.j('/api/conta/senha', { method: 'POST', body: { nova: 'nova-senha-22' } })).status, 200);
  assert.equal((await membro.j('/api/estudos')).body.estudos.length, 1);
  assert.equal((await membro.j('/api/usuarios')).status, 403);
  assert.equal((await membro.j('/api/empresa', { method: 'PATCH', body: { cota: 999 } })).status, 403);
  // desativar derruba a sessão
  await admin.j('/api/usuarios/' + c.body.usuario.id, { method: 'PATCH', body: { ativo: false } });
  assert.equal((await membro.j('/api/estudos')).status, 401);
});

test('LGPD: titular exporta seus dados; exclusão da conta encerra a sessão', async () => {
  const outro = cliente();
  const c = await admin.j('/api/usuarios', { method: 'POST', body: { nome: 'Carla', email: 'carla@horizonte.com' } });
  await outro.j('/api/auth/login', { method: 'POST', body: { email: 'carla@horizonte.com', senha: c.body.senhaProvisoria } });
  const ex = await outro.j('/api/conta/exportar');
  assert.equal(ex.status, 200); assert.equal(ex.body.titular.email, 'carla@horizonte.com'); assert.ok(ex.body.registroDeAcessos.some(x => x.acao === 'login'));
  assert.equal((await outro.j('/api/conta/excluir', { method: 'POST', body: { senha: 'errada' } })).status, 400);
  assert.equal((await outro.j('/api/conta/excluir', { method: 'POST', body: { senha: c.body.senhaProvisoria } })).status, 200);
  assert.equal((await outro.j('/api/auth/eu')).status, 401);
  assert.equal((await admin.j('/api/estudos')).body.estudos.length, 1, 'estudos da empresa continuam');
});
