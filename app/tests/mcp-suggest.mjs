import assert from 'node:assert/strict';
import {suggestMcp} from '../src/mcp-suggest.js';

assert.deepEqual(suggestMcp('Посмотри задачи в Jira и пофикси'), ['atlassian']);
assert.deepEqual(suggestMcp('Почини BW-4571'), ['atlassian']);
assert.deepEqual(suggestMcp('Сделай задачу в Linear'), ['linear']);
assert.deepEqual(suggestMcp('Jira', [{id: 'atlassian', signedIn: true, enabled: true}]), []);
assert.deepEqual(suggestMcp('Расскажи про проект'), []);
console.log('mcp-suggest ok');
assert.deepEqual(suggestMcp('Используй GPT-4 и UTF-8'), []);

// The MCP tab must be both reachable and rendered.
import {readFileSync} from 'node:fs';
const dialog = readFileSync(new URL('../src/connections-dialog.jsx', import.meta.url), 'utf8');
assert.match(dialog, /setTab\('mcp'\)[\s\S]*?>\s*MCP\s*</);
assert.match(dialog, /<McpPanel\b/);
assert.match(dialog, /const working = busy \|\| channelBusy \|\| mcpBusy/);
assert.match(dialog, /: mcpBusy\s*\?/);
