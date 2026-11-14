import {sliceBetween} from './helpers/source-slice.mjs';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {MODEL_PROFILES, modelProfile} from '../src/model-profiles.js';
import {preferredModel, routingAdvice} from '../src/agent-catalog.js';
const defaults = [
  {id: 'claude/haiku', provider: 'claude', model: 'haiku'},
  {id: 'claude/sonnet', provider: 'claude', model: 'sonnet', isDefault: true},
];
assert.equal(preferredModel(defaults).id, 'claude/sonnet');
for (const model of Object.keys(MODEL_PROFILES)) {
  const p = modelProfile({model, provider: 'api-test'});
  assert.ok(p.role);
  assert.ok(p.cost);
  assert.ok(p.contextNote);
  if (p.input != null) {
    assert.ok(Number.isFinite(p.input) && p.input >= 0);
    assert.ok(Number.isFinite(p.output) && p.output >= 0);
    assert.ok(p.source?.startsWith('https://'));
  }
}
assert.equal(modelProfile({model: 'haiku', provider: 'claude'}).referencePrice, null);
assert.equal(modelProfile({model: 'unknown-version', provider: 'api-test'}).referencePrice, null);
assert.match(
  modelProfile({model: 'qwen3:4b', provider: 'api-local'}, [{id: 'api-local', provider: 'local'}]).cost,
  /ресурсы компьютера/
);
assert.equal(modelProfile({model: 'gpt-6.1-sol', provider: 'api-test'}).exampleCost, '0.0400');
assert.ok(
  routingAdvice('Привет', {
    models: [defaults[0]],
    connections: [{id: 'claude', ready: false}],
    selection: defaults[0].id,
  }).error
);
const source = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
const save = sliceBetween(source, 'async function saveModelChoice(value){', 'useEffect(()=>{refresh();');
let rows = [
    {id: 'a', modelChoice: 'auto'},
    {id: 'b', modelChoice: 'claude/opus'},
  ],
  resolve;
const ctx = {
  activeChat: 'a',
  modelSaving: false,
  setModelSaving: () => {},
  setProjectError: () => {},
  setChats: update => {
    rows = update(rows);
  },
  invoke: async (name, args) => {
    assert.equal(name, 'save_chat_model');
    return new Promise(r => {
      resolve = () => r({id: args.chatId, modelChoice: args.modelChoice});
    });
  },
};
vm.createContext(ctx);
vm.runInContext(save, ctx);
const saving = ctx.saveModelChoice('agent-auto:codex');
ctx.activeChat = 'b';
resolve();
await saving;
assert.equal(rows[0].modelChoice, 'agent-auto:codex');
assert.equal(rows[1].modelChoice, 'claude/opus');
let error = '';
ctx.setProjectError = v => (error = v);
ctx.invoke = async () => {
  throw Error('Disk unavailable');
};
await ctx.saveModelChoice('auto');
assert.equal(rows[1].modelChoice, 'claude/opus');
assert.match(error, /Disk unavailable/);
console.log(
  'Model selection: chat ownership during save, persistence failure, exact-version pricing and unknown characteristics passed.'
);

ctx.chatSending = false;
ctx.routeApproval = {current: null};
ctx.activeChat = 'a';
ctx.invoke = async (name, args) => {
  assert.equal(name, 'save_chat_routing_priority');
  return new Promise(r => {
    resolve = () => r({...rows.find(c => c.id === args.chatId), routingPriority: args.priority});
  });
};
const prioritySaving = ctx.saveRoutingPriority('speed');
ctx.activeChat = 'b';
resolve();
await prioritySaving;
assert.equal(rows[0].routingPriority, 'speed');
assert.equal(rows[1].routingPriority, undefined);
ctx.invoke = async () => {
  throw Error('Write failed');
};
await ctx.saveRoutingPriority('economy');
assert.equal(rows[1].routingPriority, undefined);
