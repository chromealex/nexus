import assert from 'node:assert/strict';
import http from 'node:http';

// A stand-in for the Nexus local API: checks the bearer token and records requests.
const seen = [];
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', c => (body += c));
  req.on('end', () => {
    seen.push({
      method: req.method,
      url: req.url,
      auth: req.headers.authorization,
      body: body && JSON.parse(body),
    });
    res.setHeader('Content-Type', 'application/json');
    if (req.headers.authorization !== 'Bearer test-token') {
      res.statusCode = 401;
      return res.end(JSON.stringify({error: 'bad token'}));
    }
    if (req.url === '/v1/projects')
      return res.end(JSON.stringify({projects: [{id: 'p1', name: 'App', workspace: '/w'}]}));
    if (req.url === '/v1/chats' && req.method === 'POST') {
      res.statusCode = 200;
      return res.end(JSON.stringify({chatId: 'c1', running: false, answer: {content: 'Done'}}));
    }
    res.statusCode = 404;
    res.end(JSON.stringify({error: 'Unknown'}));
  });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
process.env.NEXUS_URL = `http://127.0.0.1:${server.address().port}`;
process.env.NEXUS_TOKEN = 'test-token';
const {parseArgs, handleMcp, api, TOOLS} = await import('../scripts/nexus-cli.mjs');

assert.deepEqual(parseArgs(['ask', '--project', 'p1', 'fix', 'it', '--worktree', '--wait=30']), {
  _: ['ask', 'fix', 'it'],
  project: 'p1',
  worktree: true,
  wait: '30',
});

const init = await handleMcp({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {protocolVersion: '2025-06-18'},
});
assert.equal(init.result.serverInfo.name, 'nexus');
assert.equal(await handleMcp({jsonrpc: '2.0', method: 'notifications/initialized'}), null);
const list = await handleMcp({jsonrpc: '2.0', id: 2, method: 'tools/list'});
assert.equal(list.result.tools.length, TOOLS.length);
assert.ok(list.result.tools.every(t => t.inputSchema?.type === 'object' && !t.run));

const projects = await handleMcp({
  jsonrpc: '2.0',
  id: 3,
  method: 'tools/call',
  params: {name: 'nexus_list_projects', arguments: {}},
});
assert.match(projects.result.content[0].text, /"App"/);
const task = await handleMcp({
  jsonrpc: '2.0',
  id: 4,
  method: 'tools/call',
  params: {name: 'nexus_start_task', arguments: {project: 'p1', text: 'Fix the login', wait: 999}},
});
assert.match(task.result.content[0].text, /Done/);
assert.deepEqual(seen.at(-1).body, {project: 'p1', text: 'Fix the login', worktree: false, wait: 300});
const missing = await handleMcp({
  jsonrpc: '2.0',
  id: 5,
  method: 'tools/call',
  params: {name: 'nexus_read_chat', arguments: {chat: 'zz'}},
});
assert.equal(missing.result.isError, true);
assert.equal((await handleMcp({jsonrpc: '2.0', id: 6, method: 'nope'})).error.code, -32601);
assert.equal(
  (await handleMcp({jsonrpc: '2.0', id: 7, method: 'tools/call', params: {name: 'x'}})).error.code,
  -32602
);
await assert.rejects(api('GET', '/v1/unknown'), /Unknown/);
assert.ok(seen.every(r => r.auth === 'Bearer test-token'));
server.close();
console.log('nexus CLI: arguments, MCP handshake, tool list, tool calls and API errors passed.');
