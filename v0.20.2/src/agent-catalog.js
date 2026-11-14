import {MODEL_PROFILES} from './model-profiles.js';
import {benchmarkChoice} from './model-benchmarks.js';
// Agent capabilities, not invented model rankings. Model IDs come from live adapters.
export const CATALOG=[
 {id:'codex',name:'OpenAI Codex',kind:'oauth',tags:['code','reasoning','tools'],description:'Код, терминал, файлы и проверка результата. Вход с ChatGPT.'},
 {id:'claude',name:'Claude Code',kind:'oauth',tags:['code','reasoning','tools','writing'],description:'Работа с проектом, сложные изменения и тексты. Вход Anthropic.'},
 {id:'antigravity',name:'Google Antigravity',kind:'acp',executable:'agy_acp_server.par',args:[],authMethod:'oauth-personal',tags:['code','tools','multimodal'],description:'Официальный ACP Google для личного входа. Отдельный runtime вместо старого Gemini CLI.'},
 {id:'gemini',name:'Gemini CLI',kind:'gemini',tags:['code','tools','multimodal'],description:'Личные подписки переведены в Antigravity. Здесь доступны Gemini API и существующие корпоративные профили.'},
 {id:'grok',name:'Grok',kind:'api',provider:'grok',tags:['writing','reasoning'],description:'Текстовый чат через официальный xAI API. Подписка Grok и API оплачиваются отдельно.'},
 {id:'qwen-local',name:'Qwen · локально',kind:'api',provider:'local',tags:['simple','local','review'],description:'Локальный Qwen через Ollama. Простые вопросы и дополнительная проверка текста без облачных токенов.'},
 {id:'qwen',name:'Qwen Code',kind:'acp',executable:'qwen',args:['--acp'],tags:['code','tools','local'],description:'ACP-агент для кода на локальном qwen3:4b через Ollama. Настройки изолированы в Nexus.'},
 {id:'goose',name:'Goose',kind:'acp',executable:'goose',args:['acp'],tags:['code','tools','local'],description:'Установка официального бинарника и ACP. В Nexus использует локальный qwen3:4b через Ollama.'},
 {id:'opencode',name:'OpenCode',kind:'acp',executable:'opencode',args:['acp'],tags:['code','tools'],description:'Открытый агент с ACP. Для чата нужен настроенный провайдер.'},
 {id:'aider',name:'Aider',kind:'external',tags:['code'],description:'Доступен установщик через uv. ACP-адаптер в Nexus пока не реализован.',url:'https://aider.chat/docs/install.html'},
 {id:'copilot',name:'GitHub Copilot CLI',kind:'custom',executable:'copilot',args:['--acp'],npmPackage:'@github/copilot',tags:['code','tools'],description:'Подключается через ACP; доступ зависит от вашего плана GitHub.',url:'https://docs.github.com/en/copilot/concepts/agents/copilot-cli/acp'},
 {id:'kimi',name:'Kimi CLI',kind:'custom',executable:'kimi',args:['acp'],tags:['code','tools'],description:'Установленный Kimi CLI подключается через ACP.',url:'https://moonshotai.github.io/kimi-cli/en/customization/acp.html'},
 {id:'cline',name:'Cline',kind:'custom',executable:'',args:[],tags:['code','tools'],description:'Нужен установленный CLI с поддержкой ACP и настроенный провайдер.',url:'https://docs.cline.bot/'},
 {id:'amp',name:'Amp',kind:'custom',executable:'amp-acp',args:[],tags:['code','tools'],description:'Нужны официальный CLI, аккаунт и совместимый ACP-адаптер.',url:'https://ampcode.com/'},
 {id:'openai-compatible',name:'Свой API / LM Studio',kind:'api',provider:'openai-compatible',tags:['writing','local'],description:'OpenAI-совместимый сервер, свой endpoint и список моделей от сервера.'},
];
export const TAG_NAMES={code:'Код',reasoning:'Сложные задачи',tools:'Инструменты',writing:'Тексты',multimodal:'Изображения',simple:'Простые задачи',local:'Локально',review:'Проверка'};
export function classifyTask(text='',hasFiles=false,{hasImages=false,executionMode='discuss'}={}){
 const bullets=(text.match(/^\s*(?:[-*•]|\d+[.)])\s+/gm)||[]).length;
 const projectInspection=/(?:этот|текущий|мой)\s+проект|устроен.{0,40}проект|this project|codebase/i.test(text);
 const webdev=/(фронтенд|frontend|лендинг|landing|веб.?сайт|web.?site|react|html|css)/i.test(text);
 const translation=/(переведи|перевод|translate|translation)/i.test(text);
 const editing=/(отредакт|редактур|перепиши|корректур|proofread|rewrite)/i.test(text);
 const code=webdev||/(код|рефактор|программ|алгоритм|тест|code|debug|implement|test|shader|unity|rust|python|javascript)/i.test(text);
 const repair=code&&/(исправ|ошибк|debug|bug|рефактор|refactor)/i.test(text);
 const complex=text.length>1200||bullets>=4||/(архитект|рассужд|доказ|докаж|теорем|логическ|математ|полностью|несколько этап|reasoning|prove|architecture|end.to.end)/i.test(text);
 return {kind:hasImages?'visual':code?'code':complex?'reasoning':'simple',taskType:hasImages?'Анализ изображений':webdev?'Веб-разработка':translation?'Перевод':editing?'Редактура':repair?'Исправление кода':code?'Разработка кода':complex?'Рассуждения':'Тексты',complex,webdev,hasFiles,hasImages,needsTools:executionMode==='execute'||hasFiles||projectInspection,
 reason:projectInspection?'Нужен агент с доступом к файлам проекта.':hasImages?'Нужен адаптер с передачей изображений.':hasFiles?'Нужен доступ к приложенным файлам.':executionMode==='execute'?'Нужен агент с инструментами выполнения.':complex?'Запрос содержит несколько этапов.':'Текстовое обсуждение.'};
}
export function nonChatModel(model){return /(?:imagine|embedding|tts|transcri|whisper|dall-e|gpt-image|veo|imagen|multi-agent|codex-auto-review)/i.test(model.model);}
export function modelCapabilities(model,connections=[]){
 const native=['codex','claude'].includes(model.provider),acp=model.provider.startsWith('custom-');
 return {text:!nonChatModel(model),tools:native||acp,files:native||acp,images:model.images??(native?true:null),reasoning:native,local:connections.some(c=>c.id===model.provider&&c.provider==='local')};
}
export function incompatibleReason(model,task,reasoningMode='auto',connections=[]){
 if(connections.some(c=>c.id===model.provider&&c.ready===false))return 'Подключение не готово; обновите проверку';
 const c=modelCapabilities(model,connections);
 if(!c.text)return 'Для этой модели нужен отдельный адаптер; текстовый чат не поддерживается';
 if(task.needsTools&&!c.tools)return 'Нет инструментов выполнения';
 if(task.hasFiles&&!c.files)return 'Адаптер не передаёт файлы';
 if(task.hasImages&&c.images!==true)return c.images===false?'Адаптер не передаёт изображения':'Поддержка изображений не подтверждена; переподключите ACP';
 if(reasoningMode!=='auto'&&!c.reasoning)return 'Ручная глубина недоступна; выберите «Авто»';
 return '';
}
export function automaticModelAllowed(model){return !model.provider.startsWith('custom-')&&model.autoEligible!==false;}
export function preferredModel(models){
 return [...models].sort((a,b)=>Number(!!b.isDefault)-Number(!!a.isDefault)||Number(b.model==='default')-Number(a.model==='default')||a.id.localeCompare(b.id))[0];
}
export function routingAdvice(text,{models=[],connections=[],hasFiles=false,hasImages=false,executionMode='discuss',reasoningMode='auto',selection='auto',priority='balanced'}={}){
 const task=classifyTask(text,hasFiles,{hasImages,executionMode});
 const scoped=selection.startsWith('agent-auto:')?models.filter(m=>m.provider===selection.slice(11)):models;
 if(selection!=='auto'&&!selection.startsWith('agent-auto:')){
  const manual=models.find(m=>m.id===selection);
  const error=manual?incompatibleReason(manual,task,reasoningMode,connections):'Выбранная модель недоступна';
  return {...task,choice:error?null:manual.id,error,offer:false};
 }
 const eligible=scoped.filter(m=>automaticModelAllowed(m)&&!incompatibleReason(m,task,reasoningMode,connections));
 if(selection.startsWith('agent-auto:custom-'))return {...task,choice:null,offer:false,error:'Для пользовательского ACP подтверждён только протокол. Выберите модель агента вручную; автовыбор отключён.'};
 const preferred=task.kind==='simple'&&!task.needsTools?'qwen-local':task.kind==='reasoning'?'claude':'codex';
 const match=m=>preferred==='qwen-local'?modelCapabilities(m,connections).local:m.provider===preferred;
 const measured=benchmarkChoice(eligible,task,{reasoningMode,priority,prices:MODEL_PROFILES});
 if(measured)return {...task,preferred,choice:measured.model.id,offer:false,benchmark:measured.evidence,comparison:measured.comparison,coverage:measured.coverage,reason:task.reason+' '+measured.reason+' Покрытие: '+measured.coverage+' совместимых моделей.'};
 const chosen=preferredModel(eligible.filter(match))||preferredModel(eligible);
 if(chosen)return {...task,preferred,choice:chosen.id,offer:false,coverage:'Недостаточно сопоставимых данных',comparison:[chosen,...eligible.filter(m=>m.id!==chosen.id).slice(0,2)].map(m=>({id:m.id,label:m.label||m.model,quality:'Нет достаточного сравнения для этого режима',cost:null,minutes:null,note:m.id===chosen.id?'Резервный выбор по совместимости':'Совместимая альтернатива без рейтинга'})),reason:task.reason+' Недостаточно сопоставимых свежих данных для этого режима; резервный выбор по совместимости. '+(chosen.isDefault?'Выбрана модель по умолчанию.':'Выбран совместимый вариант; рейтинг качества не измерен.')};
 return {...task,preferred,offer:selection==='auto',error:selection==='auto'?'':'У выбранного агента нет совместимой модели. '+task.reason,warning:'Нет совместимого подключения для этих требований. Подключите агента или измените параметры.',fallback:null};
}
export function connectionState(check,job){if(['starting','waiting'].includes(job?.phase))return 'waiting';if(!check||check.status==='checking')return 'checking';return check.status==='ready'?'ready':check.status==='error'?'error':'login_required';}
export function pendingRequestMatches(offer,current){return !!offer&&offer.projectId===current.projectId&&offer.chatId===current.chatId&&offer.text===current.text&&current.modelChoice==='auto'&&(offer.priority||'balanced')===(current.priority||'balanced')&&(offer.replyId||null)===(current.replyId||null)&&JSON.stringify(offer.attachmentIds||[])===JSON.stringify(current.attachmentIds||[]);}
