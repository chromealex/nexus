import assert from 'node:assert/strict';
import {suggestMcp} from '../src/mcp-suggest.js';

assert.deepEqual(suggestMcp('Посмотри задачи в Jira и пофикси'), ['atlassian']);
assert.deepEqual(suggestMcp('Почини BW-4571'), ['atlassian']);
assert.deepEqual(suggestMcp('Сделай задачу в Linear'), ['linear']);
assert.deepEqual(suggestMcp('Jira', [{id: 'atlassian', signedIn: true, enabled: true}]), []);
assert.deepEqual(suggestMcp('Расскажи про проект'), []);
console.log('mcp-suggest ok');
assert.deepEqual(suggestMcp('Используй GPT-4 и UTF-8'), []);
