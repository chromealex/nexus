// In-memory fixtures only. This page never invokes the Tauri backend or real accounts.
const callbacks=new Map(),listeners=new Map();let sequence=0;
const projects=[{id:'preview',name:'Nexus · проверка интерфейса',workspace:'/tmp/nexus-ui-fixture',contexts:[]},{id:'nexus-system',name:'Nexus',system:true,workspace:'/tmp/nexus-ui-fixture'}];
const chats=[{id:'preview-empty',projectId:'preview',title:'Новый чат',folderId:'f'},{id:'long',projectId:'preview',title:'Очень длинное название чата для проверки плавного затухания и появления кнопок действий',folderId:'f'},{id:'child',projectId:'preview',title:'Подчат с сохранённым контекстом',folderId:'f',parentChatId:'long'},{id:'history',projectId:'preview',title:'Проверка оформления ответов и технических деталей',folderId:null}];
const accounts=[{id:'codex-fixture',provider:'codex',name:'Тестовый профиль'},{id:'gemini-fixture',provider:'gemini',name:'Тестовый Google'}],api=[];
const messages=[{id:'u1',chatId:'history',role:'user',content:'Проверь оформление чата и технического сообщения.'},{id:'a1',chatId:'history',role:'assistant',content:'Обычный ответ агента без обрамляющей карточки.\n\n- Сохранён текст\n- Детали свёрнуты',details:'Route: codex / fixture\nModel: fixture-model\nEffort: low'},{id:'s1',chatId:'history',role:'system',content:'Тестовый технический журнал. Это данные изолированной проверки, а не реального провайдера.'}];
const goals=[{id:'g',projectId:'preview',title:'Проверить подключения и навигацию',done:false}];
const emit=(event,payload)=>{for(const item of listeners.values())if(item.event===event)callbacks.get(item.callback)?.({event,payload,id:1})};
window.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener:()=>{}};
localStorage.setItem('nexus-active-project','preview');localStorage.setItem('nexus-active-chat:preview',new URLSearchParams(location.search).has('history')?'history':'preview-empty');
window.__TAURI_INTERNALS__={transformCallback(fn){const id=++sequence;callbacks.set(id,fn);return id},async invoke(cmd,args={}){
 if(cmd==='plugin:event|listen'){const id=++sequence;listeners.set(id,{event:args.event,callback:args.handler});return id}
 if(cmd==='plugin:event|unlisten'){listeners.delete(args.eventId);return}
 if(cmd==='list_projects')return projects;
 if(cmd==='list_project_chats')return chats.filter(c=>c.projectId===args.projectId&&!c.archived&&!c.deletedAt);
 if(cmd==='list_project_folders')return args.projectId==='preview'?[{id:'f',projectId:'preview',name:'Проверка контекста',contexts:[{kind:'note',value:'fixture'}]}]:[];
 if(cmd==='list_chat_messages')return messages.filter(m=>m.chatId===args.chatId);
 if(cmd==='chat_message_page')return {messages:messages.filter(m=>m.chatId===args.chatId),hasMore:false,beforeId:null};
 if(cmd==='agents')return ['codex','claude','gemini','qwen','goose','antigravity','opencode','aider','grok'].map(id=>({id,name:id,installed:['codex','gemini'].includes(id),installable:id!=='grok'}));
 if(cmd==='integrations'||cmd==='install_status'||cmd==='list_custom_agents')return [];
 if(cmd==='list_provider_connections')return api;
 if(cmd==='list_accounts')return [...accounts];
 if(cmd==='account_isolation')return [];
 if(cmd==='auth_status')throw Error('No login started');
 if(cmd==='check_account')return {status:args.id.startsWith('codex')?'ready':'login_required',detail:'Изолированная проверка UI'};
 if(cmd==='account_quota')return args.id.startsWith('codex')?{status:'available',primaryUsedPercent:27,secondaryUsedPercent:43,source:'Fixture · synthetic data',checkedAt:Math.floor(Date.now()/1000)}:{status:'unavailable',source:'UI fixture'};
 if(cmd==='list_chat_models')return [{id:'codex/fixture-model',label:'Codex · fixture-model',model:'fixture-model',provider:'codex'},...api.flatMap(a=>a.models.map(model=>({id:`${a.id}/${model}`,label:`${a.name} · ${model}`,provider:a.id,model})))];
 if(cmd==='project_board')return {goals:goals.filter(g=>g.projectId===args.projectId),tasks:[{id:'task',projectId:'preview',chatId:'history',title:'Проверить результат работы агента',status:'review',steps:['Изучить проект','Выполнить изменения','Проверить'],verification:'Тестовые данные: независимая проверка ожидается'}]};
 if(cmd==='change_chat_state'){const ids=new Set([args.chatId]);for(let i=0;i<17;i++)for(const c of chats)if(ids.has(c.parentChatId))ids.add(c.id);for(const c of chats)if(ids.has(c.id)){c.archived=args.action==='archive';c.deletedAt=args.action==='trash'?'fixture':null}return}
 if(cmd==='list_saved_chats')return chats.filter(c=>args.kind==='archive'?c.archived&&!c.deletedAt:c.deletedAt);
 if(cmd==='remove_account'){const i=accounts.findIndex(a=>a.id===args.id);if(i>=0)accounts.splice(i,1);return}
 if(cmd==='add_account'){const a={id:'account-'+(++sequence),provider:args.provider,name:args.name};accounts.push(a);return a}
 if(cmd==='account_login'){emit('auth-event',{id:args.id,phase:'waiting',message:'UI fixture: browser confirmation'});return}
 if(cmd==='cancel_auth'){emit('auth-event',{id:args.id,phase:'cancelled',message:'UI fixture: cancelled'});return}
 if(cmd==='connect_provider'){const a={id:'api-fixture-'+(++sequence),provider:args.provider,name:args.name,models:[args.provider==='local'?'qwen3:4b':'fixture-api-model'],ready:true,checkedAt:Math.floor(Date.now()/1000)};api.push(a);return a}
 if(cmd==='check_provider_connection')return api.find(a=>a.id===args.id);
 if(cmd==='agent_registry')return [{id:'registry-fixture',name:'Пример агента из реестра',description:'Тестовые данные интерфейса, без установки',distribution:'npm',npmPackage:null,args:[]}];
 if(cmd==='mark_chat_read'||cmd==='drag_main_window')return;
 throw Error(`UI fixture does not implement ${cmd}`);
}};
await import('/src/main.jsx');
