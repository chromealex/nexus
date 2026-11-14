// Audited public evidence, not Nexus trials. Never infer a version from a CLI alias.
export const BENCHMARK_DATE='2026-11-11';
export const COHORTS={
 intelligence:{name:'AA Intelligence Index v5.0.1',date:BENCHMARK_DATE,source:'https://artificialanalysis.ai/methodology/intelligence-benchmarking',limit:'Смешанный набор сложных задач, включая код; не отдельная оценка архитектуры или исправления ошибок.'},
 webdev:{name:'Arena WebDev',date:'2026-11-10',source:'https://arena.ai/leaderboard/code/webdev',limit:'Предпочтения в веб-разработке; не доля пройденных тестов и не оценка любого кода.'},
 text:{name:'Arena Text Overall',date:'2026-11-09',source:'https://arena.ai/leaderboard/chat/text',limit:'Общие предпочтения пользователей; не отдельный тест перевода, русского языка или фактологии.'},
 vision:{name:'Arena Vision Overall',date:'2026-11-08',source:'https://arena.ai/leaderboard/chat/vision',limit:'Понимание изображений, не генерация изображений.'},
};
// AA columns: model, tested effort, index, first answer seconds, output tokens/s,
// estimated inference minutes/task, weighted API USD/task. Null is unknown, never zero.
const aa=[
 ['gpt-6.1-sol','max',55,156.46,55,20.4,1.27],
 ['gpt-6-astra','max',57,249.02,38,23,6.24],
 ['gpt-6.1-terra','max',51,157.72,74,13.5,.96],
 ['gpt-6-luna','max',28,81.37,109,11.5,.15],
 ['gpt-6-sol','max',44,45.04,121,7.4,2.47],
 ['gpt-5.6-sol','max',null,54.26,96,null,null],
 ['gpt-5.6-terra','max',32,72.23,101,10.9,3.73],
 ['gpt-5.6-luna','max',24,51.32,114,8.6,.33],
 ['grok-4.5','high',null,8.68,72,null,null],
 ['grok-4.6','high',null,26.82,68,null,null],
 ['grok-4.7','xhigh',35,57.56,63,27.4,7.77],
 ['claude-opus-5-5','max',59,353.75,115,25,10.04,true],
 ['claude-sonnet-5-5','max',55,254.92,145,32.7,10.02,true],
];
export const BENCHMARKS=aa.map(([model,effort,score,firstToken,outputSpeed,minutes,cost,fallback=false])=>({model,effort,score,firstToken,outputSpeed,minutes,cost,fallback,cohort:'intelligence',date:BENCHMARK_DATE,source:'https://artificialanalysis.ai/models/'+model.replaceAll('.','-')}));
function arena(cohort,rows){for(const [model,effort,score,interval] of rows)BENCHMARKS.push({model,effort,score,interval,cohort,date:COHORTS[cohort].date,source:COHORTS[cohort].source});}
arena('webdev',[
 ['claude-fable-5-2','xhigh',1836,22],['claude-opus-5-5','max',1814,12],['claude-sonnet-5-5','xhigh',1773,10],
 ['gpt-6-astra','max',1764,9],['gpt-6.1-sol','max',1743,10],['gpt-6.1-terra','max',1679,11],['gpt-6-sol','max',1673,8],
 ['grok-4.7','xhigh',1641,8],['grok-4.6','high',1618,7],['claude-haiku-5-5','high',1594,9],['gpt-6-luna','max',1577,6],['grok-4.5','unspecified',1552,7],
]);
arena('text',[
 ['claude-opus-5-5','high',1506,6],['gpt-5.6-sol','xhigh',1485,4],['gpt-6.1-sol','max',1482,6],['gpt-6-astra','max',1474,6],['gpt-6-sol','max',1457,6],['gpt-6-luna','max',1441,4],
]);
arena('vision',[
 ['claude-opus-5-5','high',1295,10],['gpt-6.1-sol','max',1293,11],['gpt-5.6-sol','xhigh',1288,7],['gpt-6-astra','max',1283,9],['grok-4.5','unspecified',1280,7],['gpt-5.6-terra','xhigh',1266,7],['grok-4.6','high',1263,8],['claude-sonnet-5-5','xhigh',1263,10],
]);
export const EVIDENCE_GAPS={
 haiku:'Плавающий алиас: точная версия не подтверждена.',sonnet:'Плавающий алиас: точная версия не подтверждена.',opus:'Плавающий алиас: точная версия не подтверждена.',
 'gpt-reserve':'В проверенных публичных источниках нет сопоставимых результатов этой модели.',
 'codex-auto-review':'Служебная модель; не участник сравнения чата.',
 'grok-4.20-0309-reasoning':'AA публикует 0309 v2; соответствие этой версии каталогу не подтверждено.',
 'grok-4.20-0309-non-reasoning':'AA публикует 0309 v2; соответствие этой версии каталогу не подтверждено.',
 'grok-4.20-multi-agent-0309':'Многоагентный режим требует отдельного адаптера и отдельного сравнения.',
 'grok-4.3':'Найденные старые результаты AA v4.3 не смешиваются с v5.0.1.',
 'grok-build-0.1':'Есть спецификация производителя; сопоставимый тест точной версии не подтверждён.',
 'gemini-3.1-flash-lite':'Страница AA относится к preview; соответствие стабильной версии не подтверждено.',
 'qwen3:4b':'Есть model card Qwen3-4B; квантование Ollama и скорость на этом Mac отдельно не измерены.',
};
export function evidenceFor(model){return BENCHMARKS.filter(r=>r.model===model);}
export function evidenceGap(model){return EVIDENCE_GAPS[model]||(/imagine/.test(model)?'Медиа-модель: нет адаптера Nexus; оценки генерации не смешиваются с пониманием изображений.':'Сопоставимых данных для этой задачи пока нет.');}
export function evidenceText(r){
 const score=r.score==null?'оценка неизвестна':`${r.score}${r.interval!=null?' ± '+r.interval:''}`;
 return `${COHORTS[r.cohort].name}: ${score} · ${r.effort}${r.fallback?' · Default Fallback (не участвует в автовыборе)':''} · ${r.date}`;
}
// Public results are a prior, not a promise about the current runtime/effort.
// Compare only one benchmark snapshot. Unknown models stay unranked.
export const ROUTING_PRIORITIES={balanced:'Баланс',quality:'Качество',economy:'Экономия',speed:'Скорость'};
export function benchmarkChoice(models,task,{reasoningMode='auto',priority='balanced',now=Date.now(),records=BENCHMARKS,prices={}}={}){
 if(!ROUTING_PRIORITIES[priority])priority='balanced';
 const cohort=task.kind==='visual'?'vision':task.webdev?'webdev':['code','reasoning'].includes(task.kind)?'intelligence':'text';
 const effort={fast:'low',normal:'medium',deep:'high'}[reasoningMode];
 const candidates=models.flatMap(model=>records.filter(r=>r.model===model.model&&r.cohort===cohort&&!r.fallback&&Number.isFinite(r.score)&&r.date===COHORTS[cohort].date&&now-Date.parse(r.date)>=0&&now-Date.parse(r.date)<90*86400000&&(!effort||r.effort===effort)).slice(0,1).map(evidence=>({model,evidence})));
 if(new Set(candidates.map(c=>c.model.model)).size<2)return null;
 candidates.sort((a,b)=>b.evidence.score-a.evidence.score||a.model.id.localeCompare(b.model.id));
 const best=candidates[0].evidence;
 const close=candidates.filter(c=>cohort==='intelligence'?c.evidence.score>=best.score-(priority==='quality'?0:3):c.evidence.score+(c.evidence.interval||0)>=best.score-(best.interval||0));
 const cost=c=>!c.model.provider.startsWith('api-')?null:cohort==='intelligence'?(c.evidence.cost??null):Number.isFinite(prices[c.model.model]?.input)&&Number.isFinite(prices[c.model.model]?.output)?prices[c.model.model].input*.01+prices[c.model.model].output*.002:null;
 const time=c=>cohort==='intelligence'?(c.evidence.minutes??null):null;
 let pool=close,metric=null,explanation='Близкие оценки не доказывают превосходство; при отсутствии сопоставимой цены и скорости используется стабильный ID.';
 const complete=(rows,fn)=>rows.every(c=>Number.isFinite(fn(c)));
 if(priority==='economy'&&complete(candidates,cost)){pool=candidates;metric=cost;explanation='Минимальный известный API-расход среди оценённых моделей; качество может быть ниже.';}
 else if(priority==='speed'&&complete(candidates,time)){pool=candidates;metric=time;explanation='Минимальное расчётное время в том же тесте; качество может быть ниже.';}
 else if(complete(close,cost)){metric=cost;explanation='Среди близких по качеству вариантов выбран меньший API-расход.';}
 else if(complete(close,time)){metric=time;explanation='Среди близких по качеству вариантов выбрано меньшее расчётное время.';}
 if((priority==='economy'&&!complete(candidates,cost))||(priority==='speed'&&!complete(candidates,time)))explanation='Приоритет не удалось полностью применить: сопоставимые данные неполны. '+explanation;
 pool=[...pool].sort((a,b)=>(metric?metric(a)-metric(b):0)||a.model.id.localeCompare(b.model.id));
 const chosen=pool[0];
 const describe=c=>({id:c.model.id,label:c.model.label||c.model.model,quality:evidenceText(c.evidence),cost:cost(c),costLabel:cohort==='intelligence'?'API $/задачу AA':'API $ за 10 тыс. входных + 2 тыс. выходных токенов',minutes:time(c),note:c===chosen?'Выбрана':close.includes(c)?'Близкая оценка; превосходство не установлено':'Вне группы близких оценок'});
 const alternatives=candidates.filter(c=>c.model.id!==chosen.model.id).slice(0,2).map(describe);
 for(const model of models){if(alternatives.length>=2)break;if(model.id!==chosen.model.id&&!candidates.some(c=>c.model.id===model.id))alternatives.push({id:model.id,label:model.label||model.model,quality:'Нет сопоставимой оценки',cost:null,minutes:null,note:evidenceGap(model.model)});}
 return {...chosen,comparison:[describe(chosen),...alternatives],coverage:`${new Set(candidates.map(c=>c.model.model)).size} из ${new Set(models.map(m=>m.model)).size}`,reason:`${ROUTING_PRIORITIES[priority]}. ${explanation} Ориентир: ${evidenceText(chosen.evidence)}. ${COHORTS[cohort].limit} ${cohort==='intelligence'&&priority!=='quality'?'Допуск баланса — 3 балла: правило продукта, не статистическая погрешность. ':''}Режим Nexus может отличаться; глубина не изменяется. Стоимость подписки неизвестна; API-цена не равна цене успешного запроса.`};
}
