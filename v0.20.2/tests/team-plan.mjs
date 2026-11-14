import assert from 'node:assert/strict';
import {teamPlan} from '../src/team-plan.js';
const models=[{id:'codex/test',provider:'codex',model:'test',label:'Codex'},{id:'claude/sonnet',provider:'claude',model:'sonnet',label:'Claude'},{id:'api-local/qwen',provider:'api-local',model:'qwen',label:'Local'},{id:'custom-one/default',provider:'custom-one',model:'default',label:'ACP'}];
const options={models,connections:[{id:'api-local',provider:'local',ready:true}],selection:'auto'};
assert.equal(teamPlan('Привет',options,false),null);
assert.equal(teamPlan('Привет',options,true).steps.length,2);
let plan=teamPlan('Сделай проект:\n1. Напиши код API\n2. Переведи описание',options,true);
assert.equal(plan.steps.length,2);
assert.deepEqual(plan.steps[1].dependsOn,[1]);
assert.equal(plan.steps[0].modelChoice,'codex/test');
assert.equal(plan.steps[1].modelChoice,'api-local/qwen');
assert.ok(!plan.steps[0].prompt.includes('Переведи'));
assert.ok(plan.steps[0].prompt.includes('Сделай проект'));
plan=teamPlan('Сделай интерфейс React и сервер API',options,true);
assert.equal(plan.steps.length,2);assert.ok(plan.steps.every(s=>s.dependsOn.length===0));
for(const selection of ['claude/sonnet','agent-auto:claude']){
 plan=teamPlan('- Напиши код\n- Переведи текст',{...options,selection},true);
 assert.ok(plan.steps.every(s=>s.modelChoice==='claude/sonnet'));
}
plan=teamPlan('- Код\n- Текст',{...options,selection:'custom-one/default'},true);
assert.ok(plan.error);assert.ok(plan.steps.every(s=>!s.modelChoice));
plan=teamPlan('- Код\n- Текст',{...options,models:[],selection:'auto'},true);assert.ok(plan.error);
plan=teamPlan('- Код\n- Текст',{...options,hasFiles:true,hasImages:true},true);
assert.ok(plan.steps.every(s=>!s.modelChoice.startsWith('api-')));
plan=teamPlan('- Код\n- Текст',{...options,reasoningMode:'deep'},true);
assert.ok(plan.steps.every(s=>!s.modelChoice.startsWith('api-')));
assert.equal(teamPlan('- 1\n- 2\n- 3\n- 4\n- 5',options,true).steps.length,2);
console.log('Team planner: bounded decomposition, dependencies, per-task routing, manual scope, capabilities and fallback passed.');

plan=teamPlan('Давай делать',options,true);
assert.equal(plan.steps.length,2);
assert.equal(new Set(plan.steps.map(s=>s.modelChoice.split('/')[0])).size,2);
assert.ok(plan.steps.every(s=>s.prompt.includes('Давай делать')));
plan=teamPlan('Давай делать',{...options,models:models.slice(0,1)},true);
assert.equal(plan.steps.length,2);assert.match(plan.reason,/один провайдер/);

plan=teamPlan('Давай делать',{...options,executionMode:'execute'},true);
assert.deepEqual(plan.steps[1].dependsOn,[1]);
assert.ok(plan.steps.every(s=>/^(codex|claude)\//.test(s.modelChoice)));
assert.ok(plan.steps.every(s=>!s.prompt.includes('не изменяя файлы')));
assert.equal(new Set(plan.steps.map(s=>s.modelChoice.split('/')[0])).size,2);
