import assert from 'node:assert/strict';
import {
  BENCHMARKS,
  COHORTS,
  benchmarkChoice,
  cohortsFor,
  evidenceFor,
  evidenceGap,
} from '../src/model-benchmarks.js';
import {MODEL_PROFILES, CRITERIA, criterionAssessment} from '../src/model-profiles.js';
import {classifyTask, routingAdvice} from '../src/agent-catalog.js';
const now = Date.parse('2026-11-14T12:00:00Z');
const m = (model, provider = 'codex', isDefault = false) => ({
  id: provider + '/' + model,
  model,
  provider,
  isDefault,
});
// Claude Code aliases as the backend reports them after reading the official alias table.
const alias = (model, resolved) => ({...m(model, 'claude', model === 'sonnet'), resolved});
const sol = m('gpt-6.1-sol'),
  astra = m('gpt-6-astra', 'codex', true),
  old = m('gpt-6-sol', 'codex', true),
  luna = m('gpt-6-luna'),
  terra = m('gpt-6.1-terra'),
  opus = alias('opus', 'claude-opus-5-5'),
  sonnet = alias('sonnet', 'claude-sonnet-5-5'),
  haiku = alias('haiku', 'claude-haiku-5-5');
const task = classifyTask('Докажи математическое утверждение');
assert.equal(task.kind, 'reasoning');
assert.equal(benchmarkChoice([astra, sol, old], task, {now}).model.id, sol.id); // quality gate then faster, not default
assert.equal(benchmarkChoice([old, luna], task, {now}).model.id, old.id); // cheap must not bypass quality gate
const low = benchmarkChoice([astra, sol], task, {now, reasoningMode: 'fast'});
assert.equal(low.evidence.effort, 'low'); // manual depth compares only the same published mode
assert.equal(low.model.id, astra.id);
assert.equal(benchmarkChoice([astra, sol], task, {now: Date.parse('2027-03-01')}), null);
assert.equal(benchmarkChoice([astra, sol], task, {now: Date.parse('2026-01-01')}), null);
assert.equal(benchmarkChoice([sol, m('sonnet', 'claude')], task, {now}), null); // unresolved alias not inferred
assert.equal(
  benchmarkChoice([sol, {...m('opus', 'claude'), resolvedNote: 'Алиас переопределён'}], task, {now}),
  null
); // override in settings: no version, no evidence
assert.equal(
  evidenceGap({...m('opus', 'claude'), resolvedNote: 'Алиас переопределён'}),
  'Алиас переопределён'
);
assert.equal(benchmarkChoice([sol, {...sol, id: 'other/' + sol.model}], task, {now}), null); // two accounts != two models
// Default fallback is how Anthropic serves these models everywhere, so it is labelled, not excluded.
const withOpus = benchmarkChoice([sol, opus], task, {now, priority: 'quality'});
assert.equal(withOpus.model.id, opus.id);
assert.match(withOpus.reason, /резервной моделью Anthropic/);
assert.match(withOpus.reason, /«opus» сопоставлен с claude-opus-5-5/);
const records = BENCHMARKS.map(r => ({...r, date: '2025-01-01'}));
assert.equal(benchmarkChoice([sol, astra], task, {now, records}), null);
const api = [m('gpt-6-astra', 'api-a'), m('gpt-6.1-sol', 'api-a')];
assert.equal(benchmarkChoice(api, task, {now}).model.model, 'gpt-6.1-sol');

// Code goes to the coding-agent index of the same harness; other harnesses fall back.
const code = classifyTask('Исправь ошибку в коде Rust');
assert.deepEqual(cohortsFor(code), ['codingAgent', 'intelligence']);
assert.equal(benchmarkChoice([haiku, sonnet, opus], code, {now}).model.id, opus.id); // Claude Code: Opus 58 vs Sonnet 56, faster
assert.equal(benchmarkChoice([astra, sol, terra], code, {now}).model.id, sol.id); // Codex: Sol close to Astra, faster
const mixed = benchmarkChoice([haiku, sonnet, opus, astra, sol, terra], code, {now});
assert.equal(mixed.cohort, 'codingAgent');
assert.equal(mixed.model.id, astra.id); // Balance: 5-point tolerance, without tariffs the faster close one
assert.equal(mixed.coverage, '6 из 6');
assert.equal(
  benchmarkChoice([m('gpt-6-astra', 'api-x'), m('gpt-6.1-sol', 'api-x')], code, {now}).cohort,
  'intelligence'
);
const web = classifyTask('Сделай frontend React');
assert.equal(web.webdev, true);
assert.equal(benchmarkChoice([astra, sol], web, {now}).cohort, 'codingAgent');
const apiWeb = benchmarkChoice([m('gpt-6-astra', 'api-x'), m('gpt-6.1-sol', 'api-x')], web, {now});
assert.equal(apiWeb.cohort, 'webdev');
assert.equal(apiWeb.model.model, 'gpt-6-astra'); // different category different winner
assert.equal(benchmarkChoice([astra, sol], classifyTask('Напиши письмо'), {now}).model.id, sol.id); // close scores: the cheaper tariff wins
assert.equal(
  benchmarkChoice([astra, sol], classifyTask('Фото', true, {hasImages: true}), {now}).model.id,
  sol.id // overlapping Arena intervals: the cheaper tariff wins
);
// Document extraction and tool workflows read their own tests.
const pdf = classifyTask('Извлеки суммы из таблицы в PDF', true);
assert.equal(pdf.extraction, true);
assert.equal(pdf.taskType, 'Извлечение данных');
const pdfChoice = benchmarkChoice([sol, opus], pdf, {now});
assert.equal(pdfChoice.cohort, 'gdppdf');
assert.equal(pdfChoice.model.id, sol.id);
const ops = benchmarkChoice(
  [sol, sonnet],
  classifyTask('Обнови записи в CRM', false, {executionMode: 'execute'}),
  {now}
);
assert.equal(ops.cohort, 'automation');
assert.equal(ops.model.id, sonnet.id);

assert.equal(routingAdvice('Код', {models: [astra, sol], selection: astra.id}).choice, astra.id);
assert.equal(routingAdvice('Код', {models: [astra, sol], selection: 'agent-auto:claude'}).choice, undefined);
assert.equal(
  routingAdvice('Исправь ошибку в коде', {models: [haiku, sonnet, opus], selection: 'agent-auto:claude'})
    .choice,
  sonnet.id // Opus 58 vs Sonnet 56 are within tolerance: the cheaper tariff wins
);
for (const r of BENCHMARKS) {
  assert.ok(COHORTS[r.cohort]);
  assert.ok(MODEL_PROFILES[r.model], r.model);
  assert.match(r.source, r.mirror ? /^https:\/\// : /^https:\/\/(artificialanalysis.ai|arena.ai)\//);
  assert.ok(r.score === null || Number.isFinite(r.score));
  assert.ok(!Number.isNaN(Date.parse(r.date)));
}
for (const id of Object.keys(MODEL_PROFILES)) assert.ok(evidenceFor(id).length || evidenceGap(id));

// The model card table: a resolved alias gets real rows, an unresolved one says why not.
const caps = {text: true, tools: true, files: true, images: true};
const card = Object.fromEntries(CRITERIA.map(c => [c, criterionAssessment(sonnet, c, caps)]));
assert.match(card['Код и тесты'], /Coding Agent Index v2\.1: 56 · в Claude Code/);
assert.match(card['Архитектура и рассуждения'], /Intelligence Index v5\.0\.1: 55/);
assert.match(card['Извлечение данных'], /GDP\.pdf/);
assert.match(card['Изображения'], /Arena Vision/);
assert.match(card['Скорость'], /мин на задачу/);
assert.match(card['Надёжность инструментов'], /AutomationBench-AA: 71\.8%/);
assert.match(criterionAssessment(m('sonnet', 'claude'), 'Код и тесты', caps), /алиас/i);
assert.match(criterionAssessment(m('gpt-6.1-sol', 'api-x'), 'Код и тесты', caps), /Arena WebDev/); // other harness → webdev
console.log(
  'Public evidence: alias resolution, harness-matched coding index, fallback labelling, effort/version/date boundaries, extraction/tools tests and model card passed.'
);

assert.equal(
  benchmarkChoice([m('gpt-5.6-sol', 'api-a'), m('gpt-6.1-sol', 'api-a')], classifyTask('Письмо'), {
    now,
    prices: MODEL_PROFILES,
  }).model.model,
  'gpt-6.1-sol'
);

// Explicit priorities: budget/speed may trade quality; balanced cannot.
const all = [astra, sol, old, luna];
assert.equal(benchmarkChoice(all, task, {now, priority: 'quality'}).model.id, astra.id);
assert.equal(benchmarkChoice(all, task, {now, priority: 'speed'}).model.id, old.id);
assert.match(benchmarkChoice(all, task, {now, priority: 'economy'}).reason, /не удалось/);
const apiAll = all.map(c => ({...c, provider: 'api-test', id: 'api-test/' + c.model}));
assert.equal(benchmarkChoice(apiAll, task, {now, priority: 'economy'}).model.model, luna.model);
assert.equal(benchmarkChoice(apiAll, task, {now, priority: 'balanced'}).model.model, sol.model);
const comparison = benchmarkChoice(all, task, {now});
assert.equal(comparison.comparison.length, 3);
assert.equal(comparison.comparison[0].id, comparison.model.id);
assert.ok(comparison.comparison.every(c => c.cost === null)); // subscription is not free API
const noTime = benchmarkChoice([astra, sol], classifyTask('Письмо'), {now, priority: 'speed'});
assert.match(noTime.reason, /не удалось/);
assert.ok(noTime.comparison.every(c => c.minutes === null));
for (const [text, type] of [
  ['Исправь код Rust', 'Исправление кода'],
  ['Сделай React сайт', 'Веб-разработка'],
  ['Докажи теорему', 'Рассуждения'],
  ['Отредактируй письмо', 'Редактура'],
  ['Переведи письмо', 'Перевод'],
  ['Напиши письмо', 'Тексты'],
])
  assert.equal(classifyTask(text).taskType, type);
assert.equal(classifyTask('Исправь письмо').kind, 'simple');
assert.equal(classifyTask('Извлеки данные из PDF').extraction, false); // nothing attached
const hello = routingAdvice('Привет', {models: [haiku, sonnet, opus, astra, sol]});
assert.equal(hello.benchmark, undefined); // a greeting is not routed to the top-rated model
assert.notEqual(hello.choice, opus.id);
assert.match(hello.reason, /рейтинги не применяются/);
assert.equal(
  classifyTask(
    'Напиши подробное письмо клиенту о переносе сроков проекта и новых условиях поставки, с извинениями и предложением скидки на следующий заказ, учитывая прошлую переписку'
  ).trivial,
  false // a detailed writing request is compared by text ratings
);
assert.equal(classifyTask('Переведи письмо').trivial, false);
console.log(
  'Routing priorities: quality, budget, speed, uncertainty, unknown costs, alternatives and task types passed.'
);

// Fable 5.2 in Claude Code: exact ID, blocked on old CLIs, Auto only when quality comes first.
const fable = m('claude-fable-5-2', 'claude');
const oldCli = {...fable, unavailable: 'Нужен Claude Code 2.1.321 или новее'};
assert.equal(
  routingAdvice('Исправь ошибку в коде', {models: [oldCli, opus], selection: oldCli.id}).error,
  oldCli.unavailable
);
assert.equal(routingAdvice('Исправь ошибку в коде', {models: [fable, opus, sonnet]}).choice, sonnet.id); // balanced: no extra credits, cheaper of the close scores
const quality = routingAdvice('Исправь ошибку в коде', {models: [fable, opus, sonnet], priority: 'quality'});
assert.equal(quality.choice, fable.id); // same 58 as Opus, faster published mode (high, 31 min)
assert.match(quality.reason, /high/);
assert.equal(routingAdvice('Код', {models: [fable, opus], selection: fable.id}).choice, fable.id); // manual always allowed
console.log('Fable 5.2: exact ID, CLI version gate, extra-credit guard in Auto and manual choice passed.');

// Equal score and tariff: the agent with more limit left wins, not the alphabet.
{
  const sonnetR = {id: 'claude/sonnet', provider: 'claude', model: 'sonnet', resolved: 'claude-sonnet-5-5'};
  const solR = {id: 'codex/gpt-6.1-sol', provider: 'codex', model: 'gpt-6.1-sol'};
  const task = classifyTask('Спроектируй архитектуру полностью');
  const pick = left =>
    benchmarkChoice([sonnetR, solR], task, {now, prices: MODEL_PROFILES, quotaLeft: left, preferEffort: null})
      .model.provider;
  assert.equal(pick({claude: 10, codex: 80}), 'codex');
  assert.equal(pick({claude: 80, codex: 10}), 'claude');
  console.log('Ties: remaining limit decides.');
}

// Balance: close candidates are weighed by tariff and remaining limit; an exhausted agent is skipped.
{
  const sonnetR = {id: 'claude/sonnet', provider: 'claude', model: 'sonnet', resolved: 'claude-sonnet-5-5'};
  const solR = {id: 'codex/gpt-6.1-sol', provider: 'codex', model: 'gpt-6.1-sol'};
  const task = classifyTask('Спроектируй архитектуру полностью');
  const pick = (quotaLeft, priority = 'balanced') =>
    benchmarkChoice([sonnetR, solR], task, {now, prices: MODEL_PROFILES, quotaLeft, priority}).model.provider;
  assert.equal(pick({claude: 22, codex: 51}), 'codex');
  assert.equal(pick({claude: 80, codex: 20}), 'claude');
  assert.equal(pick({claude: 1, codex: 90}), 'codex'); // exhausted Claude is skipped
  console.log('Balance: tariff × remaining limit, exhausted agents skipped.');
}
