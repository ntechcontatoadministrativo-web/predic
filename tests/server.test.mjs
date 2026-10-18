// Testa o servidor do PREDIC contra uma API Anthropic simulada: streaming, ferramentas, JSON estruturado e segurança.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';

const recebidos = [];
let mock, srv;
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
  mock = http.createServer((req, res) => {
    let b = ''; req.on('data', c => b += c); req.on('end', () => {
      const body = JSON.parse(b || '{}'); recebidos.push({ headers: req.headers, body });
      if (body.stream) {
        if (body.tools) return sseAnthropic(res, [{ type: 'text', text: 'Simulando o cenário pedido.' }, { type: 'tool_use', id: 'toolu_1', name: 'simular_cenario', input: { alteracoes: [{ variavel: 'vso', valor: 4 }] } }], 'tool_use');
        return sseAnthropic(res, [{ type: 'text', text: '## Síntese e recomendação\nAprovar com ressalvas.' }], 'end_turn');
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: 'msg_2', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'end_turn', usage: { input_tokens: 5, output_tokens: 5 },
        content: [{ type: 'text', text: JSON.stringify({ resumo: 'ok', nota: 70, achados: [{ titulo: 'VSO alta', severidade: 'atencao', secao: 'mercado', explicacao: 'x', sugestao: 'y', ajuste: { variavel: 'vso', valor: 2.8 } }] }) }] }));
    });
  }).listen(PORTA_MOCK);
  srv = spawn(process.execPath, ['server/server.mjs'], { env: { ...process.env, PORT: String(PORTA), ANTHROPIC_API_KEY: 'sk-teste', ANTHROPIC_BASE_URL: 'http://127.0.0.1:' + PORTA_MOCK, PREDIC_ACCESS_KEY: '' }, stdio: 'pipe' });
  await new Promise((ok, err) => { srv.stdout.on('data', d => /rodando/.test(d) && ok()); srv.on('exit', c => err(new Error('servidor saiu: ' + c))); });
});
after(() => { srv?.kill(); mock?.close(); });

const lerSSE = async r => (await r.text()).split('\n\n').filter(x => x.startsWith('data: ')).map(x => JSON.parse(x.slice(6)));

test('status informa IA ativa', async () => {
  const j = await (await fetch(BASE + '/api/status')).json();
  assert.equal(j.ai, true); assert.equal(j.model, 'claude-opus-5-5');
});

test('chat: repassa streaming e tool_use; envia ferramentas, cache e fallback', async () => {
  const r = await fetch(BASE + '/api/ai/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: 'oi' }], web: true }) });
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
  const r = await fetch(BASE + '/api/ai/parecer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contexto: { a: 1 } }) });
  const evs = await lerSSE(r);
  assert.match(evs.filter(e => e.t === 'text').map(e => e.d).join(''), /Aprovar com ressalvas/);
  assert.equal(recebidos.at(-1).body.output_config.effort, 'high');
  assert.equal(recebidos.at(-1).body.tools, undefined);
});

test('json: saída estruturada validada (auditoria)', async () => {
  const r = await fetch(BASE + '/api/ai/json', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tarefa: 'auditoria', contexto: {} }) });
  const j = await r.json();
  assert.equal(r.status, 200, JSON.stringify(j));
  assert.equal(j.dados.nota, 70);
  assert.equal(recebidos.at(-1).body.output_config.format.type, 'json_schema');
});

test('rejeita tarefa desconhecida, conversa inválida e caminho fora do app', async () => {
  assert.equal((await fetch(BASE + '/api/ai/json', { method: 'POST', body: JSON.stringify({ tarefa: 'xpto' }) })).status, 400);
  assert.equal((await fetch(BASE + '/api/ai/chat', { method: 'POST', body: JSON.stringify({ messages: [{ role: 'system', content: 'x' }] }) })).status, 400);
  const t = await new Promise(ok => http.get({ host: '127.0.0.1', port: PORTA, path: '/../package.json' }, res => { res.resume(); ok(res.statusCode); }).on("error", () => ok(0)));
  assert.notEqual(t, 200);
});
