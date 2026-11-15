import assert from 'node:assert/strict';
import {routingAdvice, classifyTask, connectionState, pendingRequestMatches} from '../src/agent-catalog.js';
const codex = {id: 'codex/provider-model', provider: 'codex', model: 'provider-model', label: 'Codex'};
const claude = {id: 'claude/sonnet', provider: 'claude', model: 'sonnet', label: 'Claude'};
assert.equal(routingAdvice('Исправь код', {models: [codex]}).choice, codex.id);
const offer = routingAdvice('Исправь код', {models: [claude]});
assert.equal(offer.offer, false);
assert.equal(offer.choice, claude.id);
assert.equal(routingAdvice('Привет', {models: []}).offer, true);
const local = {id: 'api-local/qwen3:4b', provider: 'api-local', model: 'qwen3:4b', label: 'Qwen'};
assert.equal(
  routingAdvice('Привет', {models: [local], connections: [{id: 'api-local', provider: 'local', ready: true}]})
    .choice,
  local.id
);
assert.equal(classifyTask('- a\n- b\n- c\n- d').complex, true);
assert.equal(classifyTask('Проверь скриншот', true).needsTools, true);
assert.equal(connectionState(undefined, undefined), 'checking');
assert.equal(connectionState({status: 'login_required'}, {phase: 'waiting'}), 'waiting');
assert.equal(connectionState({status: 'ready'}, {phase: 'error'}), 'ready');
console.log(
  'Agent routing: capability advice, unavailable agents, local routing, plans and independent auth states passed.'
);

const pending = {projectId: 'p', chatId: 'c', text: 'Task', attachmentIds: ['f'], replyId: 'm'};
const current = {...pending, modelChoice: 'auto'};
assert.equal(pendingRequestMatches(pending, current), true);
for (const changed of [
  {chatId: 'other'},
  {projectId: 'other'},
  {text: 'Changed'},
  {attachmentIds: []},
  {replyId: 'other'},
  {modelChoice: 'codex/manual'},
])
  assert.equal(pendingRequestMatches(pending, {...current, ...changed}), false);
console.log('Pending routing: original chat, draft, attachments, quote and explicit model choice protected.');

// Provider default wins regardless of list order; scoped Auto cannot escape its agent.
const haiku = {id: 'claude/haiku', provider: 'claude', model: 'haiku'},
  sonnet = {...claude, isDefault: true};
for (const models of [
  [haiku, sonnet],
  [sonnet, haiku],
])
  assert.equal(routingAdvice('Архитектура', {models}).choice, sonnet.id);
assert.equal(
  routingAdvice('Привет', {models: [haiku, sonnet, codex], selection: 'agent-auto:claude'}).choice,
  sonnet.id
);
assert.ok(routingAdvice('Привет', {models: [codex], selection: 'agent-auto:claude'}).error);
assert.equal(
  routingAdvice('Привет', {
    models: [codex, local],
    connections: [{id: 'api-local', provider: 'local'}],
    executionMode: 'execute',
  }).choice,
  local.id // execution mode, but a greeting asks for no action: text-only models are allowed
);
assert.ok(routingAdvice('Файл', {models: [local], selection: local.id, hasFiles: true}).error);
assert.ok(routingAdvice('Фото', {models: [local], selection: local.id, hasImages: true}).error);
assert.ok(routingAdvice('Текст', {models: [local], selection: local.id, reasoningMode: 'deep'}).error);
const unknownACP = {id: 'custom-a/default', provider: 'custom-a', model: 'default'};
assert.ok(routingAdvice('Фото', {models: [unknownACP], selection: unknownACP.id, hasImages: true}).error);
assert.equal(
  routingAdvice('Фото', {models: [{...unknownACP, images: true}], selection: unknownACP.id, hasImages: true})
    .choice,
  unknownACP.id
);
assert.equal(routingAdvice('Объясни код', {models: [local], selection: local.id}).choice, local.id);
const nonText = {id: 'api-grok/grok-imagine-image', provider: 'api-grok', model: 'grok-imagine-image'};
assert.ok(routingAdvice('Привет', {models: [nonText], selection: nonText.id}).error);
assert.equal(routingAdvice('Привет', {models: [nonText]}).offer, true);
console.log(
  'Model routing: default, agent scope, file/image/tool/effort compatibility and manual selection passed.'
);

assert.equal(
  pendingRequestMatches({...pending, priority: 'balanced'}, {...current, priority: 'speed'}),
  false
);

// Protocol-only ACP must never become an automatic fallback, even if sole/default.
const fixture = {id: 'custom-fixture/default', provider: 'custom-fixture', model: 'default', isDefault: true};
assert.equal(routingAdvice('Объясни проект', {models: [fixture]}).choice, undefined);
assert.equal(routingAdvice('Объясни проект', {models: [fixture, codex]}).choice, codex.id);
assert.ok(routingAdvice('Привет', {models: [fixture], selection: 'agent-auto:custom-fixture'}).error);
assert.equal(routingAdvice('Привет', {models: [fixture], selection: fixture.id}).choice, fixture.id);
console.log('Protocol-only ACP: automatic fallback excluded; explicit manual choice retained.');

assert.equal(classifyTask('Объясни, как устроен этот проект').needsTools, true);
assert.equal(routingAdvice('Объясни, как устроен этот проект', {models: [local, fixture]}).offer, true);
