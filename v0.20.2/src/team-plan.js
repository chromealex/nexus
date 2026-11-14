import {routingAdvice} from './agent-catalog.js';
// A deliberately bounded local planner: explicit items preserve order; independent
// design proposals may run together. No extra model call just to plan a simple request.
export function teamPlan(text, options, enabled=false) {
 if(!enabled||!text.trim())return null;
 const scope=options.selection||'auto',execute=options.executionMode==='execute';
 const items=text.split('\n').map(line=>line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.+)$/)?.[1]).filter(Boolean);
 let tasks=[],autoPlan=false;
 if(items.length>=2&&items.length<=4){
  const preamble=text.split('\n').filter(line=>!/^\s*(?:[-*•]|\d+[.)])\s+/.test(line)).join('\n');
  tasks=items.map((item,i)=>({id:i+1,title:item.slice(0,100),assignment:item,routingText:item,prompt:`Контекст запроса: ${preamble}\nПодзадача: ${item}`,dependsOn:i?[i]:[]}));
 }else if(/(интерфейс|frontend|фронтенд|react|страниц)/i.test(text)&&/(backend|бэкенд|сервер|api|баз[аыу] данных)/i.test(text)){
  tasks=[{id:1,title:'Интерфейс и взаимодействие',routingText:'Разработка frontend React интерфейса',prompt:`Разработай предложение по интерфейсу, компонентам и взаимодействию. Укажи требования к API. Запрос: ${text}`,dependsOn:[]},{id:2,title:'Сервер и контракт данных',routingText:'Разработка кода серверной логики API',prompt:`Разработай предложение по серверной логике, данным и контракту API. Запрос: ${text}`,dependsOn:[]}];
  }else {
  autoPlan=true;
  // Short follow-ups such as “Давай делать” still require a team. The backend
  // supplies conversation history to both specialists; do not invent missing scope.
  tasks=[{id:1,title:'Решение и план реализации',routingText:'Разработка кода и план решения',prompt:`Определи согласованную задачу по последнему запросу и истории. Предложи конкретное решение и порядок изменений, не изменяя файлы. Если контекста недостаточно, явно назови недостающие данные. Последний запрос: ${text}`,dependsOn:[]},{id:2,title:'Независимая проверка и риски',routingText:'Анализ архитектуры, риски и тесты',prompt:`Независимо проверь согласованную задачу по истории: ограничения, риски, пограничные случаи, критерии приёмки и необходимые тесты. Не утверждай, что проверки выполнены, и не меняй файлы. Последний запрос: ${text}`,dependsOn:[]}];
 }
 // ACP has no uniform enforceable read-only mode. It can integrate, but cannot
 // participate as an independent specialist until its adapter has that guarantee.
 if(execute){tasks=tasks.map((t,i)=>({...t,dependsOn:i?[tasks[i-1].id]:[],prompt:`Выполни назначенный этап в проекте, используя согласованный контекст истории. Этап: ${t.assignment||t.title}. Работай только над этим этапом. Последний запрос: ${text}. ${i?'Учитывай фактические результаты предыдущих этапов; не повторяй их работу.':'Реализуй только свою часть согласованной задачи; не расширяй её на невыбранные альтернативы из истории.'} ${t.title.includes('проверка')?'Проверь результат предыдущего исполнителя и исправь обнаруженные ошибки с обычными разрешениями.':''}`}));}
 const models=options.models.filter(m=>!m.provider.startsWith('custom-')&&(!execute||['codex','claude'].includes(m.provider)));
 const usedProviders=new Set();
 const steps=tasks.map(task=>{
  let route=routingAdvice(task.routingText,{...options,models,selection:scope,executionMode:execute?'execute':'discuss'});
  if(scope==='auto'&&usedProviders.has(models.find(m=>m.id===route.choice)?.provider)){
   const alternative=routingAdvice(task.routingText,{...options,models:models.filter(m=>!usedProviders.has(m.provider)),selection:scope,executionMode:execute?'execute':'discuss'});
   if(alternative.choice)route={...alternative,reason:'Другой совместимый агент для независимого этапа. '+(alternative.reason||'')};
  }
  const provider=models.find(m=>m.id===route.choice)?.provider;if(provider)usedProviders.add(provider);
  return {...task,modelChoice:route.choice||'',reason:route.reason||route.error||route.warning,label:models.find(m=>m.id===route.choice)?.label||'',error:!route.choice};
 });
 const error=steps.some(s=>s.error)?'Для подзадач нет совместимого исполнителя. Нужен Codex, Claude или текстовый API; для файлов — нативный агент. Ручной выбор сохраняется.':null;
 return {steps,error,autoPlan,reason:(autoPlan?'Перед этапами агент разобьёт согласованную задачу по истории на 2–4 части. Это дополнительный модельный вызов. ' : '')+(usedProviders.size===1?'Доступен или выбран один провайдер: отдельные роли выполняются его независимыми вызовами. ':'')+(execute?'Исполнители последовательно меняют проект по этапам, затем итоговый агент объединяет результаты и запускает проверки. Одновременно пишет только один агент. Каждый этап расходует квоту.':'Специалисты готовят предложения без изменений файлов. Итоговый агент объединяет их. До двух независимых подзадач одновременно. Каждый этап — отдельный модельный вызов.')};
}
