import assert from 'node:assert/strict';
import {BENCHMARKS,COHORTS,benchmarkChoice,evidenceFor,evidenceGap} from '../src/model-benchmarks.js';
import {MODEL_PROFILES} from '../src/model-profiles.js';
import {classifyTask,routingAdvice} from '../src/agent-catalog.js';
const now=Date.parse('2026-11-11T12:00:00Z');
const m=(model,provider='codex',isDefault=false)=>({id:provider+'/'+model,model,provider,isDefault});
const sol=m('gpt-6.1-sol'),astra=m('gpt-6-astra', 'codex',true),old=m('gpt-6-sol','codex',true),luna=m('gpt-6-luna');
const task=classifyTask('Докажи математическое утверждение');
assert.equal(task.kind,'reasoning');
assert.equal(benchmarkChoice([astra,sol,old],task,{now}).model.id,sol.id); // quality gate then faster, not default
assert.equal(benchmarkChoice([old,luna],task,{now}).model.id,old.id); // cheap must not bypass quality gate
assert.equal(benchmarkChoice([astra,sol],task,{now,reasoningMode:'fast'}),null); // max != low
assert.equal(benchmarkChoice([astra,sol],task,{now:Date.parse('2027-03-01')}),null);
assert.equal(benchmarkChoice([astra,sol],task,{now:Date.parse('2026-01-01')}),null);
assert.equal(benchmarkChoice([sol,m('sonnet')],task,{now}),null); // alias not inferred
assert.equal(benchmarkChoice([sol,{...sol,id:'other/'+sol.model}],task,{now}),null); // two accounts != two models
assert.equal(benchmarkChoice([sol,m('claude-opus-5-5')],task,{now}),null); // fallback contaminated score
const records=BENCHMARKS.map(r=>({...r,date:'2025-01-01'}));
assert.equal(benchmarkChoice([sol,astra],task,{now,records}),null);
const api=[m('gpt-6-astra','api-a'),m('gpt-6.1-sol','api-a')];
assert.equal(benchmarkChoice(api,task,{now}).model.model,'gpt-6.1-sol');
const web=classifyTask('Сделай frontend React');
assert.equal(web.webdev,true);
assert.equal(benchmarkChoice([astra,sol],web,{now}).model.id,astra.id); // different category different winner
assert.equal(benchmarkChoice([astra,sol],classifyTask('Напиши письмо'),{now}).model.id,astra.id);
assert.equal(benchmarkChoice([astra,sol],classifyTask('Фото',true,{hasImages:true}),{now}).model.id,astra.id);
assert.equal(routingAdvice('Код',{models:[astra,sol],selection:astra.id}).choice,astra.id);
assert.equal(routingAdvice('Код',{models:[astra,sol],selection:'agent-auto:claude'}).choice,undefined);
for(const r of BENCHMARKS){assert.ok(COHORTS[r.cohort]);assert.ok(MODEL_PROFILES[r.model]);assert.match(r.source,/^https:\/\/(artificialanalysis.ai|arena.ai)\//);assert.ok(r.score===null||Number.isFinite(r.score));}
for(const id of Object.keys(MODEL_PROFILES))assert.ok(evidenceFor(id).length||evidenceGap(id));
console.log('Public evidence: quality gate, task categories, API costs, effort/version/date boundaries, fallback exclusion and manual choice passed.');

assert.equal(benchmarkChoice([m('gpt-5.6-sol','api-a'),m('gpt-6.1-sol','api-a')],classifyTask('Письмо'),{now,prices:MODEL_PROFILES}).model.model,'gpt-6.1-sol');

// Explicit priorities: budget/speed may trade quality; balanced cannot.
const all=[astra,sol,old,luna];
assert.equal(benchmarkChoice(all,task,{now,priority:'quality'}).model.id,astra.id);
assert.equal(benchmarkChoice(all,task,{now,priority:'speed'}).model.id,old.id);
assert.match(benchmarkChoice(all,task,{now,priority:'economy'}).reason,/не удалось/);
const apiAll=all.map(c=>({...c,provider:'api-test',id:'api-test/'+c.model}));
assert.equal(benchmarkChoice(apiAll,task,{now,priority:'economy'}).model.model,luna.model);
assert.equal(benchmarkChoice(apiAll,task,{now,priority:'balanced'}).model.model,sol.model);
const comparison=benchmarkChoice(all,task,{now});
assert.equal(comparison.comparison.length,3);assert.equal(comparison.comparison[0].id,comparison.model.id);
assert.ok(comparison.comparison.every(c=>c.cost===null)); // subscription is not free API
const noTime=benchmarkChoice([astra,sol],classifyTask('Письмо'),{now,priority:'speed'});
assert.match(noTime.reason,/не удалось/);assert.ok(noTime.comparison.every(c=>c.minutes===null));
for(const [text,type] of [['Исправь код Rust','Исправление кода'],['Сделай React сайт','Веб-разработка'],['Докажи теорему','Рассуждения'],['Отредактируй письмо','Редактура'],['Переведи письмо','Перевод'],['Напиши письмо','Тексты']])assert.equal(classifyTask(text).taskType,type);
assert.equal(classifyTask('Исправь письмо').kind,'simple');
console.log('Routing priorities: quality, budget, speed, uncertainty, unknown costs, alternatives and task types passed.');
