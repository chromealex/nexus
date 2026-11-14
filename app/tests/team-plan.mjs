import assert from 'node:assert/strict';
import {teamPlan, shouldDecompose, stageKinds} from '../src/team-plan.js';
const claude = (model, resolved) => ({
  id: 'claude/' + model,
  provider: 'claude',
  model,
  resolved,
  label: model,
});
const models = [
  {id: 'codex/gpt-6.1-sol', provider: 'codex', model: 'gpt-6.1-sol', label: 'Codex · Sol'},
  {id: 'codex/gpt-6-astra', provider: 'codex', model: 'gpt-6-astra', label: 'Codex · Astra'},
  claude('opus', 'claude-opus-5-5'),
  claude('sonnet', 'claude-sonnet-5-5'),
  {id: 'claude/claude-fable-5-2', provider: 'claude', model: 'claude-fable-5-2', label: 'Fable 5.2'},
  {id: 'api-local/qwen3:4b', provider: 'api-local', model: 'qwen3:4b', label: 'Local'},
  {id: 'custom-one/default', provider: 'custom-one', model: 'default', label: 'ACP'},
];
const options = {models, connections: [{id: 'api-local', provider: 'local', ready: true}], selection: 'auto'};
const big = 'Полностью переработай архитектуру модуля оплаты и реализуй код с тестами';

// Modes: single never splits; boolean values keep the old toggle meaning.
assert.equal(teamPlan(big, options, 'single'), null);
assert.equal(teamPlan(big, options, false), null);
assert.equal(teamPlan(big, options, true).mode, 'team');

// Auto splits only composite requests, only with an automatic model and two candidates.
assert.equal(teamPlan('Привет', options, 'auto'), null);
assert.equal(teamPlan('Исправь опечатку в README', options, 'auto'), null);
assert.equal(teamPlan(big, {...options, selection: 'claude/sonnet'}, 'auto'), null);
assert.equal(teamPlan(big, {...options, models: models.slice(0, 1)}, 'auto'), null);
assert.ok(shouldDecompose('1. Напиши код API\n2. Переведи описание'));
assert.ok(shouldDecompose('Сделай интерфейс React и сервер API'));
assert.ok(shouldDecompose(big));
assert.ok(!shouldDecompose('Напиши письмо клиенту'));

// Explicit parts: each part gets the model rated best for its own kind of work.
let plan = teamPlan(
  'Сделай проект:\n1. Исправь ошибку в коде API\n2. Переведи описание на английский',
  options,
  'auto'
);
assert.equal(plan.mode, 'auto');
assert.equal(plan.steps.length, 2);
assert.deepEqual(plan.steps[1].dependsOn, [1]);
assert.equal(plan.steps[0].modelChoice, 'claude/opus'); // AA Coding Agent Index in Claude Code
assert.match(plan.steps[0].reason, /Coding Agent Index/);
assert.match(plan.steps[1].reason, /Arena Text/);
assert.equal(plan.steps[0].effort, 'medium'); // runs at the depth it was compared for
assert.ok(!plan.steps.some(s => s.modelChoice.includes('fable'))); // extra credits: not in balanced Auto
assert.ok(plan.steps[0].prompt.includes('Сделай проект'));
assert.ok(!plan.steps[0].prompt.includes('Переведи'));

// Context planning: one executor per kind of work, chosen before the extra planning call.
plan = teamPlan(big, options, 'auto');
assert.equal(plan.autoPlan, true);
assert.deepEqual(stageKinds(big), ['reasoning', 'code', 'review', 'writing']);
assert.deepEqual(
  plan.steps.map(s => s.kind),
  ['reasoning', 'code', 'review', 'writing']
);
const byKind = Object.fromEntries(plan.steps.map(s => [s.kind, s]));
assert.equal(byKind.code.modelChoice, 'claude/opus');
assert.equal(byKind.code.effort, 'high');
assert.equal(byKind.writing.effort, 'medium');
assert.notEqual(byKind.review.modelChoice.split('/')[0], 'claude'); // independent check by another provider
assert.ok(plan.steps.every(s => s.dependsOn.length === 0 && s.modelChoice));
assert.match(plan.reason, /дополнительный модельный вызов/);
plan = teamPlan(big, {...options, priority: 'quality'}, 'auto');
assert.ok(plan.steps.some(s => s.modelChoice === 'claude/claude-fable-5-2')); // quality first may use Fable
plan = teamPlan(big, {...options, reasoningMode: 'deep'}, 'auto');
assert.ok(plan.steps.every(s => s.effort === null)); // manual depth is never overridden per stage
plan = teamPlan(big, {...options, executionMode: 'execute'}, 'auto');
assert.ok(plan.steps.every(s => /^(codex|claude)\//.test(s.modelChoice)));
plan = teamPlan(
  'Извлеки суммы из таблиц в PDF и реализуй код импорта, полностью',
  {...options, hasFiles: true},
  'auto'
);
assert.ok(plan.steps.some(s => s.kind === 'extraction'));
assert.ok(plan.steps.every(s => !s.modelChoice.startsWith('api-'))); // API cannot read attachments

// Team mode keeps its old guarantees.
plan = teamPlan('Сделай интерфейс React и сервер API', options, 'team');
assert.equal(plan.steps.length, 2);
assert.ok(plan.steps.every(s => s.dependsOn.length === 0));
for (const selection of ['claude/sonnet', 'agent-auto:claude']) {
  plan = teamPlan('- Напиши код\n- Переведи текст', {...options, selection}, 'team');
  assert.ok(plan.steps.every(s => s.modelChoice.startsWith('claude/')));
  if (selection === 'claude/sonnet') assert.ok(plan.steps.every(s => s.modelChoice === 'claude/sonnet'));
}
plan = teamPlan('- Код\n- Текст', {...options, selection: 'custom-one/default'}, 'team');
assert.ok(plan.error);
plan = teamPlan('- Код\n- Текст', {...options, models: [], selection: 'auto'}, 'team');
assert.ok(plan.error);
plan = teamPlan('- Код\n- Текст', {...options, hasFiles: true, hasImages: true}, 'team');
assert.ok(plan.steps.every(s => !s.modelChoice.startsWith('api-')));
assert.equal(teamPlan('- 1\n- 2\n- 3\n- 4\n- 5', options, 'team').steps.length, 4); // context plan, 4 kinds
plan = teamPlan('Давай делать', {...options, executionMode: 'execute'}, 'team');
assert.ok(plan.steps.every(s => /^(codex|claude)\//.test(s.modelChoice)));
console.log(
  'Team planner: auto split of composite requests, best model per kind of work, per-stage depth, independent review, manual scope and capabilities passed.'
);
