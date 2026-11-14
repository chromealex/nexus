import {teamPlan} from './team-plan.js';
import {TeamPlanPreview} from './team-plan-preview.jsx';
import {ChatNotice} from './chat-notice.jsx';
import {chatErrorMessage} from './chat-errors.js';
import {ROUTING_PRIORITIES} from './model-benchmarks.js';
import {RoutingPreview} from './routing-preview.jsx';
import {CustomSelect} from './custom-select.jsx';
import {mergeLatestMessages,prependMessages} from './chat-history.js';
import {ProjectTools} from './project-tools.jsx';
import {ConnectionsDialog} from './connections-dialog.jsx';
import {ProjectBoard} from './project-board.jsx';
import {WelcomeScreen} from './welcome-screen.jsx';
import {ParticlePersona} from './particle-persona.jsx';
import {ThinkingLightning} from './thinking-lightning.jsx';
import {routingAdvice,classifyTask,CATALOG,pendingRequestMatches} from './agent-catalog.js';
import {AgentConnectionCard} from './agent-connection-card.jsx';
import {PermissionCard} from './permission-card.jsx';
import {ProjectNavigation} from './project-navigation.jsx';
import {AgentIcon} from './agent-icon.jsx';
import {useChatScroll} from './use-chat-scroll.js';
import {countLabel} from './locale-format.js';
import {ComposerParams,ParamRow,composerParamsSummary} from './composer-params.jsx';
const REASONING_LABELS={auto:'Авто',fast:'Быстро',normal:'Обычно',deep:'Глубоко'};
import {shortcutFor,shortcutText,withShortcut} from './shortcuts.js';
import {ChatSkeleton} from './nav-extras.jsx';
import {ComposerInput} from './composer-input.jsx';
import {legacyQuestionSelection} from './chat-files.js';
import {FileTile,FilePreview,QuestionCard,normalizeQuestions} from './chat-extras.jsx';
import {Reply, Copy, Check, ThumbsUp, ThumbsDown, Clock, Paperclip, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, PanelLeft, Square} from 'lucide-react';
import {messageDate,responseDetails,mergeContinuation,effortLabel,dayKey,dayLabel} from './chat-message.js';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import React,{useEffect,useLayoutEffect,useState,useRef,useContext,createContext} from 'react';import{createRoot}from'react-dom/client';import{invoke}from'@tauri-apps/api/core';import{listen}from'@tauri-apps/api/event';import './style.css';import './workspace-ui.css';import './dialog-theme.css';import './cinematic.css';import './ui-polish.css';
// Codex device codes currently contain 4 + 5 characters. Strip ANSI and
// tolerate chunk boundaries, CR and whitespace in the CLI output.
function codexDeviceCode(log=''){
 const clean=log.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g,'').replace(/\r/g,'\n');
 const section=clean.match(/one.time code[\s\S]{0,400}/i)?.[0]||'';
 return section.match(/\b[A-Z0-9]{4}-[A-Z0-9]{5}\b/)?.[0]||null;
}

// Parse user-copied *visible page text*, never cookies, access tokens or HTTP headers.
function parseClaudeUsage(text){
 const t=text.replace(/\u00a0/g,' ').replace(/\r/g,'');
 const weekly=t.match(/(?:This week|Weekly)[\s\S]{0,250}?(\d{1,3}(?:[.,]\d+)?)\s*%\s*used/i);
 const reset=t.match(/(?:Limit hit\.[^\n]*?resets\s+|This week[\s\S]{0,100}?Resets\s+)([^\n.]{4,100})/i);
 const credit=t.match(/Usage credits[\s\S]{0,150}?[€$£]\s*([\d.,]+)/i);
 if(!weekly && !reset && !credit)throw Error('No Claude usage fields found. Copy the visible Usage page text, not a screenshot.');
 const pct=weekly?Number(weekly[1].replace(',','.')):null;
 if(pct!==null&&(pct<0||pct>100))throw Error('Invalid usage percentage');
 return {used:pct,reset:reset?.[1]?.trim()||null,credits:credit?.[0]?.match(/[€$£]\s*[\d.,]+/)?.[0]||null,recordedAt:new Date().toISOString()};
}
function statuslineSummary(report){
 if(!report||report.status!=='available')return 'Waiting for Claude Code statusLine';
 const d=report.data||{};
 const week=d.sevenDay?.usedPercent;
 const five=d.fiveHour?.usedPercent;
 const when=Date.parse(d.receivedAt||'');
 const stale=!Number.isFinite(when)||Date.now()-when>10*60*1000;
 const parts=[];
 if(week!=null)parts.push(`${week}% weekly used${week>=100?' · Limit reached':''}`);
 if(five!=null)parts.push(`${five}% 5-hour used`);
 if(!parts.length)return 'No subscription limit fields';
 return `${parts.join(' · ')}${stale?' · Last known (stale)':' · Recently updated'}`;
}
function resetLabel(value){
 if(value==null)return 'Not provided';
 const dt=typeof value==='number'?new Date(value*(value>1e12?1:1000)):new Date(value);
 return Number.isNaN(dt.getTime())?String(value):dt.toLocaleString();
}

function NexusWidget({data}){
 if(!data||typeof data!=='object'||Array.isArray(data))return null;
 if(data.type==='metric'&&typeof data.label==='string')return <div className="nexus-widget metric"><span>{data.label.slice(0,80)}</span><strong>{String(data.value??'—').slice(0,80)}</strong></div>;
 if(data.type==='progress'){
  const value=Math.max(0,Math.min(100,Number(data.value)||0));
  return <div className="nexus-widget"><div className="widget-row"><span>{String(data.label||'Progress').slice(0,80)}</span><b>{value}%</b></div><div className="widget-track"><div style={{width:`${value}%`}}/></div></div>;
 }
 if(data.type==='flow'&&Array.isArray(data.steps)){
  const steps=data.steps.slice(0,9).filter(x=>typeof x==='string'&&x.trim());
  return <div className="nexus-widget flow-widget">{steps.map((step,i)=><React.Fragment key={i}><div className="flow-node">{step.slice(0,140)}</div>{i<steps.length-1&&<div className="flow-arrow">↓</div>}</React.Fragment>)}</div>;
 }
 if(data.type==='bar'&&Array.isArray(data.items)){
  const items=data.items.slice(0,12).filter(x=>typeof x?.label==='string'&&Number.isFinite(Number(x.value))).map(x=>({name:x.label.slice(0,24),value:Number(x.value)}));
  if(!items.length)return null;
  return <div className="nexus-widget"><strong>{String(data.title||'Comparison').slice(0,80)}</strong><div style={{height:Math.max(160,items.length*34)}}><ResponsiveContainer width="100%" height="100%"><BarChart data={items} layout="vertical" margin={{left:10,right:16}}><XAxis type="number" stroke="#93afbd"/><YAxis dataKey="name" type="category" width={105} stroke="#93afbd"/><Tooltip/><Bar dataKey="value" fill="#5cb8d7" radius={[0,5,5,0]}/></BarChart></ResponsiveContainer></div></div>;
 }
 return null;
}
const ChatQuestionContext=createContext({allowQuestion:false});
function MarkdownCode({className,children,...props}){
 const {allowQuestion,onQuestion,selections,legacyReply,agentContext}=useContext(ChatQuestionContext),lang=(className||'').replace('language-','');
 if(lang==='nexus-agent'){try{return <AgentConnectionCard manifest={JSON.parse(String(children))} context={agentContext}/>}catch{return <p>Параметры агента повреждены.</p>}}
 if(lang==='nexus-question'){
  try{const block=String(children).trim(),question=JSON.parse(block),savedAnswers=selections?.[block]||legacyQuestionSelection(question.questions||question,legacyReply);return <QuestionCard questions={question.questions||question} savedAnswers={savedAnswers} disabled={!allowQuestion||!!savedAnswers} onSubmit={values=>onQuestion(Object.entries(values).map(([id,v])=>{const q=normalizeQuestions(question.questions||question).find(q=>q.id===id);return (q?.question||'Выбор')+': '+v.answers.join(', ')}).join('\n'),{block,answers:values})}/>}
  catch{return null}
 }
 if(lang==='nexus-widget'){try{return <NexusWidget data={JSON.parse(String(children))}/>}catch{return <pre className="widget-error">Widget data invalid</pre>}}
 return <code className={className} {...props}>{children}</code>;
}
const markdownComponents={
 pre:({children})=>{const child=React.Children.toArray(children)[0];return /language-nexus-(question|widget|agent)/.test(child?.props?.className||'')?<>{children}</>:<pre>{children}</pre>},
 a:({href,children})=><a href={/^https:\/\//.test(href||'')?href:undefined} target="_blank" rel="noreferrer">{children}</a>,
 code:MarkdownCode
};
function ChatMarkdown({content,onQuestion,allowQuestion=false,selections,legacyReply,agentContext}){
 return <ChatQuestionContext.Provider value={{onQuestion,allowQuestion,selections,legacyReply,agentContext}}><ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{content||''}</ReactMarkdown></ChatQuestionContext.Provider>;
}

function ResponseDetails({raw}){
 const {rows}=responseDetails(raw);
 return <details className="response-details activity-details"><summary>Ход ответа и детали · {countLabel(rows.length,'этап','этапа','этапов')}</summary><div className="activity-list">{rows.map((row,i)=><div className="activity-row" key={i}>{row.body?<details><summary>{row.title}</summary><pre>{row.body}</pre></details>:<span>{row.title}</span>}</div>)}</div></details>;
}
function MessageActions({message,onReply,onUpdate}){
 const [copied,setCopied]=useState(false),[busy,setBusy]=useState(false),[actionError,setActionError]=useState('');
 const timer=useRef();useEffect(()=>()=>clearTimeout(timer.current),[]);
 const date=messageDate(message.createdAt),{model,effort}=responseDetails(message.details||'');
 async function copy(){try{await navigator.clipboard.writeText(message.content);setCopied(true);clearTimeout(timer.current);timer.current=setTimeout(()=>setCopied(false),1600)}catch{setActionError('Не удалось скопировать ответ')}}
 async function rate(value){if(busy)return;setBusy(true);setActionError('');try{const updated=await invoke('rate_chat_message',{chatId:message.chatId,messageId:message.id,rating:message.rating===value?null:value});onUpdate(updated)}catch{setActionError('Не удалось сохранить оценку')}finally{setBusy(false)}}
 return <div className="message-footer"><div className="message-actions" role="group" aria-label="Действия с ответом">
 <button type="button" title="Ответить с цитатой" aria-label="Ответить с цитатой" onClick={()=>onReply(message)}><Reply size={15}/></button>
 <button type="button" title={copied?'Скопировано':'Копировать ответ'} aria-label={copied?'Скопировано':'Копировать ответ'} onClick={copy}>{copied?<Check size={15}/>:<Copy size={15}/>}</button>
 <button type="button" disabled={busy} title="Полезный ответ" aria-label="Полезный ответ" aria-pressed={message.rating===1} onClick={()=>rate(1)}><ThumbsUp size={15}/></button>
 <button type="button" disabled={busy} title="Неполезный ответ" aria-label="Неполезный ответ" aria-pressed={message.rating===-1} onClick={()=>rate(-1)}><ThumbsDown size={15}/></button>
 {date&&<time dateTime={date.toISOString()} title={date.toLocaleString()}><Clock size={12}/>{date.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</time>}
 {model&&<span className="message-model" title={'Модель ответа: '+model}>{model}</span>}{effort&&<span className="message-mode" title="Режим рассуждений">{effortLabel(effort)}</span>}
 </div>{actionError&&<small role="alert">{actionError}</small>}</div>;
}

function App(){const [historyMeta,setHistoryMeta]=useState({hasMore:false,beforeId:null}),[historyBusy,setHistoryBusy]=useState(false),[historyChat,setHistoryChat]=useState(''),[accountsReady,setAccountsReady]=useState(false);const historyRef=useRef({busy:false}),prependAnchor=useRef(null);const [boardOpen,setBoardOpen]=useState(false),[providerRows,setProviderRows]=useState([]),[connectionTarget,setConnectionTarget]=useState(null),[routeOffer,setRouteOffer]=useState(null),[executionMode,setExecutionMode]=useState('discuss');const routeApproval=useRef(null);const [toolsOpen,setToolsOpen]=useState(false),[navCollapsed,setNavCollapsed]=useState(false),[agentPermission,setAgentPermission]=useState(null);const pendingChatRef=useRef(null),sendingRef=useRef(false),viewRef=useRef({}),fileInputRef=useRef(null),activeRunRef=useRef(null),stopRequestedRef=useRef(false);const [chatsReady,setChatsReady]=useState(false),[chatSending,setChatSending]=useState(false),[stopping,setStopping]=useState(false),[continuingId,setContinuingId]=useState(null),[modelSaving,setModelSaving]=useState(false),[modelChoices,setModelChoices]=useState([]),[modelsBusy,setModelsBusy]=useState(false),[modelLoadError,setModelLoadError]=useState(''),[reasoningMode,setReasoningMode]=useState(()=>{try{return localStorage.getItem('nexus-reasoning-mode')||'auto'}catch{return 'auto'}}),[streamText,setStreamText]=useState(''),[replyTo,setReplyTo]=useState(null),[draftFiles,setDraftFiles]=useState([]),[filesBusy,setFilesBusy]=useState(false),[previewFile,setPreviewFile]=useState(null),[agentQuestion,setAgentQuestion]=useState(null),[chatTrace,setChatTrace]=useState(''),[chatDraft,setChatDraft]=useState(''),[registryRows,setRegistryRows]=useState([]),[registryBusy,setRegistryBusy]=useState(false),[projects,setProjects]=useState([]),[projectName,setProjectName]=useState(''),[projectPath,setProjectPath]=useState(''),[activeProject,setActiveProject]=useState(()=>{try{return localStorage.getItem('nexus-active-project')||''}catch{return ''}}),[chats,setChats]=useState([]),[chatTitle,setChatTitle]=useState(''),[activeChat,setActiveChat]=useState(''),[chatMessages,setChatMessages]=useState([]),[projectError,setProjectError]=useState(''),[deleteProjectConfirm,setDeleteProjectConfirm]=useState(false),[adaptiveStrategy,setAdaptiveStrategy]=useState('balanced'),[adaptivePlan,setAdaptivePlan]=useState(null),[adaptiveResults,setAdaptiveResults]=useState({}),[adaptiveBusy,setAdaptiveBusy]=useState(false),[statuslineReports,setStatuslineReports]=useState({}),[nativeDiagnostics,setNativeDiagnostics]=useState(null),[diagBusy,setDiagBusy]=useState(false),[axUsage,setAxUsage]=useState(null),[axBusy,setAxBusy]=useState(false),[claudeUsageText,setClaudeUsageText]=useState(''),[claudeSnapshots,setClaudeSnapshots]=useState({}),[taskAccount,setTaskAccount]=useState('auto'),[quotaReports,setQuotaReports]=useState({}),[isolation,setIsolation]=useState({}),[removePending,setRemovePending]=useState(null),[agents,setAgents]=useState([]),[open,setOpen]=useState(false),[jobs,setJobs]=useState({}),[logs,setLogs]=useState({}),[expanded,setExpanded]=useState({}),[elapsed,setElapsed]=useState(0),[prompt,setPrompt]=useState(''),[workspace,setWorkspace]=useState(''),[selected,setSelected]=useState('auto'),[running,setRunning]=useState(false),[result,setResult]=useState(''),[error,setError]=useState(''),[confirmInstall,setConfirmInstall]=useState(null),[tab,setTab]=useState('agents'),[accounts,setAccounts]=useState([]),[newProvider,setNewProvider]=useState('claude'),[newName,setNewName]=useState('Personal'),[accountMessage,setAccountMessage]=useState(''),[accountChecks,setAccountChecks]=useState({}),[integrations,setIntegrations]=useState({}),[authJobs,setAuthJobs]=useState({}),[activeAccount,setActiveAccount]=useState(null),[showAuthLogs,setShowAuthLogs]=useState(false);const refresh=()=>invoke('agents').then(setAgents).catch(e=>setError(String(e)));
const modelChoice=chats.find(c=>c.id===activeChat)?.modelChoice||'auto';
useEffect(()=>{setProjectError('')},[activeChat]);
const routingPriority=chats.find(c=>c.id===activeChat)?.routingPriority||'balanced';
const routeOptions={priority:routingPriority,models:modelChoices,connections:providerRows,hasFiles:draftFiles.length>0,hasImages:draftFiles.some(f=>f.mime?.startsWith('image/')&&f.mime!=='image/svg+xml'),executionMode,reasoningMode,selection:modelChoice};
const routePreview=routingAdvice(chatDraft,routeOptions);
const teamEnabled=!!chats.find(c=>c.id===activeChat)?.teamEnabled;
const teamPreview=teamPlan(chatDraft,routeOptions,teamEnabled);
async function saveTeamEnabled(value){
 if(!activeChat||modelSaving||chatSending)return;const chatId=activeChat;setModelSaving(true);
 try{const saved=await invoke('save_chat_team',{chatId,enabled:value});setChats(rows=>rows.map(c=>c.id===chatId?saved:c));}
 catch(e){setProjectError(String(e))}finally{setModelSaving(false)}
}
async function saveModelChoice(value){
 if(!activeChat||modelSaving)return;const chatId=activeChat;setModelSaving(true);
 try{const saved=await invoke('save_chat_model',{chatId,modelChoice:value});setChats(rows=>rows.map(c=>c.id===chatId?saved:c));}
 catch(e){setProjectError('Не удалось сохранить модель: '+String(e))}finally{setModelSaving(false)}
}
async function saveRoutingPriority(value){
 if(!activeChat||modelSaving||chatSending)return;const chatId=activeChat;setModelSaving(true);
 try{const saved=await invoke('save_chat_routing_priority',{chatId,priority:value});routeApproval.current=null;setChats(rows=>rows.map(c=>c.id===chatId?saved:c));}
 catch(e){setProjectError('Не удалось сохранить приоритет: '+String(e))}finally{setModelSaving(false)}
}
useEffect(()=>{refresh();let un;let live=true;
listen('install-event',e=>{let v=e.payload;setJobs(s=>({...s,[v.id]:{phase:v.phase,started:s[v.id]?.started||Date.now(),success:v.success,completedAt:v.success!==null?Date.now():null}}));setLogs(s=>({...s,[v.id]:((s[v.id]||'')+'\n'+v.message).slice(-60000)}));if(v.success!==null){refresh();refreshAccounts();setExpanded(old=>({...old,[v.id]:false}))}}).then(f=>{if(live)un=f;else f()});
const sync=()=>invoke('install_status').then(items=>{
 setJobs(old=>{const next={...old};for(const v of items){
  const wasComplete=old[v.id]?.success===true;
  next[v.id]={...old[v.id],phase:v.phase,started:old[v.id]?.started||Date.now(),success:v.success,
   completedAt:v.success!==null?(old[v.id]?.completedAt||Date.now()):null};
  if(v.success===true&&!wasComplete){refresh();refreshAccounts();setExpanded(prev=>({...prev,[v.id]:false}))}
 }return next})
}).catch(()=>{});
sync();
const poll=setInterval(sync,2500);
const timer=setInterval(()=>setElapsed(Date.now()),1000);
return()=>{live=false;un?.();clearInterval(timer);clearInterval(poll)}},[]);
useEffect(()=>{
 let live=true,unlisten;
 listen('chat-progress',e=>{if(sendingRef.current&&e.payload.chatId===activeRunRef.current?.chatId)setChatTrace(e.payload.stage)}).then(f=>{if(live)unlisten=f;else f()});
 return()=>{live=false;unlisten?.()};
},[]);
useEffect(()=>{
 let live=true,unlisten;
 listen('chat-text',e=>{if(sendingRef.current&&e.payload.chatId===activeRunRef.current?.chatId)setStreamText(e.payload.text)}).then(f=>{if(live)unlisten=f;else f()}).catch(()=>{});
 return()=>{live=false;unlisten?.()};
},[]);
useEffect(()=>{
 let live=true,off,closed;
 listen('chat-question',e=>{if(sendingRef.current&&e.payload.chatId===activeRunRef.current?.chatId)setAgentQuestion(e.payload)}).then(f=>{if(live)off=f;else f()}).catch(()=>{});
 listen('chat-question-closed',e=>setAgentQuestion(v=>v?.id===e.payload.id?null:v)).then(f=>{if(live)closed=f;else f()}).catch(()=>{});
 return()=>{live=false;off?.();closed?.()};
},[]);
async function attachFiles(list){
 if(filesBusy||chatSending||!activeProject)return;
 const files=Array.from(list||[]),project=activeProject;
 if(files.length+draftFiles.length>8){setProjectError('Можно прикрепить до 8 файлов');return}
 if(files.some(f=>f.size>20000000)||files.reduce((n,f)=>n+f.size,0)+draftFiles.reduce((n,f)=>n+f.size,0)>40000000){setProjectError('Максимум 20 МБ на файл и 40 МБ на сообщение');return}
 setFilesBusy(true);setProjectError('');
 try{for(const file of files){
  const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]||'');reader.onerror=()=>reject(Error('Не удалось прочитать '+file.name));reader.readAsDataURL(file)});
  const stored=await invoke('upload_attachment',{projectId:project,name:file.name,mime:file.type,data});
  if(viewRef.current.project===project)setDraftFiles(v=>[...v,stored]);
 }}catch(e){setProjectError(String(e))}finally{setFilesBusy(false);if(fileInputRef.current)fileInputRef.current.value=''}
}
useEffect(()=>{let live=true;const off=[];for(const [event,handler] of [['chat-permission',e=>{if(e.payload.chatId===activeRunRef.current?.chatId)setAgentPermission(e.payload)}],['chat-permission-closed',e=>setAgentPermission(v=>v?.id===e.payload.id?null:v)]])listen(event,handler).then(f=>{if(live)off.push(f);else f()}).catch(()=>{});return()=>{live=false;off.forEach(f=>f())}},[]);
async function answerPermission(allow,remember=false){const p=agentPermission;if(!p)return;await invoke('answer_agent_permission',{chatId:p.chatId,id:p.id,allow,remember});setAgentPermission(null)}
async function answerQuestion(values){
 const question=agentQuestion;if(!question)return;
 await invoke('answer_agent_question',{chatId:question.chatId,id:question.id,answers:values});setAgentQuestion(null);
}
useEffect(()=>{try{localStorage.setItem('nexus-reasoning-mode',reasoningMode)}catch{}},[reasoningMode]);
const modelLoadRef=useRef(false),modelReloadPendingRef=useRef(false);
async function loadChatModels(){
 if(modelLoadRef.current){modelReloadPendingRef.current=true;return}modelLoadRef.current=true;setModelsBusy(true);setModelLoadError('');
 try{setModelChoices(await invoke('list_chat_models'))}catch(e){setModelLoadError('Не удалось загрузить модели: '+String(e))}finally{modelLoadRef.current=false;setModelsBusy(false);if(modelReloadPendingRef.current){modelReloadPendingRef.current=false;queueMicrotask(loadChatModels)}}
}
useEffect(()=>{loadChatModels()},[accounts.map(a=>a.id).join(','),Object.entries(accountChecks).map(([id,c])=>id+':'+c.status).sort().join(',')]);

const reloadProjects=async()=>{try{setProjects(await invoke('list_projects'))}catch(e){setProjectError(String(e))}};
useEffect(()=>{reloadProjects()},[]);
viewRef.current={project:activeProject,chat:activeChat};
useEffect(()=>{try{if(activeProject)localStorage.setItem('nexus-active-project',activeProject);if(activeChat&&chats.some(c=>c.id===activeChat&&c.projectId===activeProject))localStorage.setItem('nexus-active-chat:'+activeProject,activeChat)}catch{}},[activeProject,activeChat,chats]);
useEffect(()=>{
 if(projects.length&&!projects.some(p=>p.id===activeProject))setActiveProject(projects[0].id);
},[projects]);
useEffect(()=>{
 let live=true;setChatsReady(false);
 setDraftFiles([]);if(!sendingRef.current){setAgentQuestion(null);setAgentPermission(null);}setReplyTo(null);setActiveChat('');setChatMessages([]);setChatTrace('');setChats([]);
 if(activeProject){
  const p=projects.find(p=>p.id===activeProject);if(p)setWorkspace(p.workspace);
  invoke('list_project_chats',{projectId:activeProject}).then(rows=>{
   if(live){setChats(rows);let saved='';try{saved=localStorage.getItem('nexus-active-chat:'+activeProject)||''}catch{}setActiveChat(pendingChatRef.current?.project===activeProject?pendingChatRef.current.chat:rows.find(c=>c.id===saved)?.id||rows[rows.length-1]?.id||'');pendingChatRef.current=null;setChatsReady(true)}
  }).catch(e=>live&&setProjectError(String(e)));
 }
 return()=>{live=false};
},[activeProject]);
useEffect(()=>{
 let live=true;setReplyTo(null);setChatMessages([]);setHistoryMeta({hasMore:false,beforeId:null});historyRef.current={busy:false};prependAnchor.current=null;setHistoryBusy(false);if(!sendingRef.current)setChatTrace('')
 if(activeChat)invoke('chat_message_page',{chatId:activeChat,beforeId:null,limit:40}).then(page=>{
  if(live){setChatMessages(page.messages);setHistoryMeta({hasMore:page.hasMore,beforeId:page.beforeId});setHistoryChat(activeChat);}
 }).catch(e=>{if(live){setProjectError(String(e));setHistoryChat(activeChat)}});
 return()=>{live=false};
},[activeChat]);
useEffect(()=>{const refresh=async()=>{const project=activeProject;if(!project)return;try{const rows=await invoke('list_project_chats',{projectId:project});if(viewRef.current.project!==project)return;setChats(rows);if(!rows.some(c=>c.id===viewRef.current.chat))setActiveChat(rows.at(-1)?.id||'')}catch(e){setProjectError(String(e))}};window.addEventListener('nexus-chat-lifecycle',refresh);return()=>window.removeEventListener('nexus-chat-lifecycle',refresh)},[activeProject]);
const chatScroll=useChatScroll(activeChat,[chatMessages,chatSending,streamText]);
async function loadOlderMessages(){
 if(historyRef.current.busy||!historyMeta.hasMore||!historyMeta.beforeId||!activeChat)return;
 const chat=activeChat,request={busy:true};historyRef.current=request;setHistoryBusy(true);setProjectError('');
 try{const page=await invoke('chat_message_page',{chatId:chat,beforeId:historyMeta.beforeId,limit:40});if(viewRef.current.chat!==chat||historyRef.current!==request)return;
  const el=chatScroll.viewport.current;if(el){chatScroll.keepReading();prependAnchor.current={chat,top:el.scrollTop,height:el.scrollHeight};}
  setChatMessages(rows=>prependMessages(rows,page.messages));setHistoryMeta({hasMore:page.hasMore,beforeId:page.beforeId});
 }catch(e){if(viewRef.current.chat===chat)setProjectError('Не удалось загрузить историю: '+String(e))}finally{if(historyRef.current===request){request.busy=false;setHistoryBusy(false)}}
}
useLayoutEffect(()=>{const saved=prependAnchor.current,el=chatScroll.viewport.current;if(saved&&el&&saved.chat===activeChat){el.scrollTop=saved.top+el.scrollHeight-saved.height;prependAnchor.current=null;chatScroll.onScroll()}},[chatMessages]);
const currentChatSending=chatSending&&activeRunRef.current?.chatId===activeChat;
const historyLoading=!!activeChat&&historyChat!==activeChat&&chatMessages.length===0&&!currentChatSending;
const shortcutRef=useRef(null);
shortcutRef.current=name=>{
 const index=chats.findIndex(c=>c.id===activeChat);
 if(name==='newChat'){window.dispatchEvent(new Event('nexus-new-chat'));return true}
 if(name==='search'){setNavCollapsed(false);setTimeout(()=>window.dispatchEvent(new Event('nexus-focus-search')),0);return true}
 if(name==='connections'){setConnectionTarget(null);setTab('accounts');setOpen(true);return true}
 if(name==='model'){const trigger=document.querySelector('.composer-tools .model-choice');if(trigger&&!trigger.disabled){trigger.click();return true}return false}
 if(name==='sidebar'){setNavCollapsed(v=>!v);return true}
 if(chatSending)return false;
 if(name==='previous'&&index>0){setActiveChat(chats[index-1].id);return true}
 if(name==='next'&&index>=0&&index<chats.length-1){setActiveChat(chats[index+1].id);return true}
 return false;
};
// Global shortcuts. Open dialogs own the keyboard, so nothing fires while one is shown.
useEffect(()=>{const key=e=>{const name=shortcutFor(e);if(!name)return;if(document.querySelector('[aria-modal="true"]'))return;if(shortcutRef.current?.(name))e.preventDefault()};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)},[]);
function navigateChat(chat,project=activeProject){if(project!==activeProject){pendingChatRef.current={project,chat};setActiveProject(project)}else setActiveChat(chat)}
useEffect(()=>{const read=()=>{const last=chatMessages.filter(m=>m.role==='assistant').at(-1);if(activeChat&&last&&document.hasFocus()&&!chatScroll.showLatest&&!currentChatSending)invoke('mark_chat_read',{chatId:activeChat,messageId:last.id}).then(()=>window.dispatchEvent(new Event('nexus-chat-read'))).catch(()=>{})};read();window.addEventListener('focus',read);return()=>window.removeEventListener('focus',read)},[activeChat,chatMessages,currentChatSending,chatScroll.showLatest]);

useEffect(()=>{
 if(chatSending||!pendingRequestMatches(routeOffer,{projectId:activeProject,chatId:activeChat,text:chatDraft,modelChoice,priority:routingPriority,attachmentIds:draftFiles.map(f=>f.id),replyId:replyTo?.id}))return;
 const advice=routingAdvice(routeOffer.text,routeOptions);
 if(!advice.offer&&advice.choice){routeApproval.current={text:routeOffer.text,choice:advice.choice};setOpen(false);sendChat(routeOffer.text);}
},[modelChoices,providerRows,executionMode,reasoningMode,routingPriority]);
useEffect(()=>{if(routeOffer&&!pendingRequestMatches(routeOffer,{projectId:activeProject,chatId:activeChat,text:chatDraft,modelChoice,priority:routingPriority,attachmentIds:draftFiles.map(f=>f.id),replyId:replyTo?.id}))setRouteOffer(null)},[routeOffer,activeProject,activeChat,chatDraft,modelChoice,draftFiles,replyTo,routingPriority]);
async function submitChat(override,continueMessageId){
 const input=typeof override==='string'?override:chatDraft;
 if(sendingRef.current||filesBusy||modelSaving||!input.trim()&&!draftFiles.length)return;
 const mentioned=modelChoice==='auto'?modelChoices.find(m=>m.provider.startsWith('custom-')&&input.toLowerCase().includes('@'+m.label.split(' · ')[0].toLowerCase())):null;
 if(mentioned)routeApproval.current={text:input,choice:mentioned.id};
 if((modelChoice==='auto'||modelChoice.startsWith('agent-auto:'))&&!continueMessageId&&routeApproval.current?.text!==input){
  const advice=routingAdvice(input,routeOptions);
  if(advice.error){setProjectError(advice.error);return;}
  if(advice.offer){setRouteOffer({...advice,priority:routeOptions.priority,text:input,projectId:activeProject,chatId:activeChat,attachmentIds:draftFiles.map(f=>f.id),replyId:replyTo?.id||null});return;}
  if(advice.choice)routeApproval.current={text:input,choice:advice.choice};
 }
 return sendChat(override,continueMessageId);
}
async function sendChat(override,continueMessageId){
 const input=typeof override==='string'?override:chatDraft;
 if(modelSaving)return;
 const resolved=routingAdvice(input,{...routeOptions,selection:routeApproval.current?.text===input?routeApproval.current.choice:modelChoice});
 if(resolved.error||!resolved.choice){setProjectError(resolved.error||'Нет совместимой модели. Проверьте подключения и параметры.');return;}

 const team=continueMessageId?null:teamPlan((replyTo?'Контекст цитаты: '+replyTo.content.slice(0,3000).replace(/\n/g,' ')+'\n':'')+input,routeOptions,teamEnabled);
 if(team?.error){setProjectError(team.error);return;}
 if(!activeProject||!chatsReady||(!input.trim()&&!draftFiles.length)||sendingRef.current||filesBusy)return;
 setContinuingId(continueMessageId||null);
 sendingRef.current=true;stopRequestedRef.current=false;setStopping(false);
 activeRunRef.current={requestId:globalThis.crypto?.randomUUID?.()||'r'+Date.now()+'-'+Math.random().toString(36).slice(2),chatId:activeChat};
 setStreamText('');setChatSending(true);
 const content=(replyTo?'Ответ на сообщение NEXUS:\n'+replyTo.content.slice(0,3000).split('\n').map(l=>'> '+l).join('\n')+'\n\n':'')+(input.trim()||(draftFiles.length?'Посмотри приложенные файлы.':'')),project=activeProject;
 const attachments=continueMessageId?[]:draftFiles;
 let chatId=activeChat;
 setProjectError('');setChatTrace('Selecting an available agent…');
 try{
  if(!chatId){
   const c=await invoke('create_project_chat',{projectIdValue:project,title:Array.from(content).slice(0,30).join('')});
   chatId=c.id;setChats(v=>[...v,c]);setActiveChat(chatId);window.dispatchEvent(new Event('nexus-chat-lifecycle'));
   viewRef.current={project,chat:chatId};
  }
  if(!continueMessageId){setReplyTo(null);setChatDraft('');setChatMessages(v=>[...v,{id:'pending-'+Date.now(),role:'user',content,attachments}]);}
  activeRunRef.current.chatId=chatId;
  if(stopRequestedRef.current)await invoke('cancel_chat_generation',activeRunRef.current);
  const reply=await invoke('unified_chat_send' ,{chatId,text:content,strategy:'balanced',attachmentIds:attachments.map(f=>f.id),requestId:activeRunRef.current.requestId,continueMessageId:continueMessageId||null,reasoningMode,modelChoice:resolved.choice,executionMode,teamAutoPlan:!!team?.autoPlan,teamSteps:team?.steps?.length?team.steps.map(({id,title,prompt,dependsOn,modelChoice,reason})=>({id,title,prompt,dependsOn,modelChoice,reason})):null});
  if(viewRef.current.project===project&&viewRef.current.chat===chatId){
   if(!continueMessageId)setDraftFiles([]);setStreamText('');setChatTrace(`${reply.route} · ${reply.tier}`);
   setChatMessages(v=>v.some(m=>m.id===reply.message.id)?v.map(m=>m.id===reply.message.id?reply.message:m):[...v,reply.message]);
  }
 }catch(e){
  if(viewRef.current.project===project&&viewRef.current.chat===chatId){setProjectError(chatErrorMessage(e));setChatDraft(draft=>draft||input);setChatTrace('Запрос не выполнен');}
 }finally{
  if(chatId){try{
   const page=await invoke('chat_message_page',{chatId,beforeId:null,limit:40});
   if(viewRef.current.project===project&&viewRef.current.chat===chatId)setChatMessages(rows=>mergeLatestMessages(rows,page.messages));
  }catch(e){if(viewRef.current.project===project)setProjectError(String(e))}}
  routeApproval.current=null;setRouteOffer(null);setContinuingId(null);activeRunRef.current=null;stopRequestedRef.current=false;setStopping(false);sendingRef.current=false;setChatSending(false);setStreamText('');setAgentQuestion(null);
 }
}
async function stopChat(){
 if(!sendingRef.current||stopRequestedRef.current)return;
 stopRequestedRef.current=true;setStopping(true);
 const run=activeRunRef.current;if(!run?.chatId)return;
 try{await invoke('cancel_chat_generation',run)}catch(e){stopRequestedRef.current=false;setStopping(false);setProjectError('Не удалось остановить генерацию: '+String(e))}
}
async function addProject(){
 try{const p=await invoke('create_project',{name:projectName,workspace:projectPath});await reloadProjects();setActiveProject(p.id);setProjectName('');setProjectPath('');setProjectError('')}
 catch(e){setProjectError(String(e))}
}
async function addChat(){
 try{const c=await invoke('create_project_chat',{projectIdValue:activeProject,title:chatTitle||'New chat'});setChats(v=>[...v,c]);setActiveChat(c.id);setChatTitle('');setProjectError('')}
 catch(e){setProjectError(String(e))}
}
async function saveChatMessage(role,content){
 if(!activeChat)return;
 try{const m=await invoke('append_chat_message',{chatId:activeChat,role,content});setChatMessages(v=>[...v,m])}
 catch(e){setProjectError('Chat save failed: '+String(e))}
}
async function deleteProject(){
 if(!activeProject||!deleteProjectConfirm)return;
 try{await invoke('remove_project',{projectId:activeProject});setActiveProject('');setDeleteProjectConfirm(false);await reloadProjects();setProjectError('')}
 catch(e){setProjectError(String(e))}
}
async function inspectNative(){
 setDiagBusy(true);
 try{
  const data=await invoke('nexus_diagnostics');
  setNativeDiagnostics(data);
  setAccountMessage(data.accessibilityTrusted?'NEXUS Accessibility granted. See diagnostics below.':'NEXUS Accessibility is denied for this running process. See diagnostics below.');
 }catch(e){setNativeDiagnostics({error:String(e)});setAccountMessage('Native diagnostics: '+String(e))}
 finally{setDiagBusy(false)}
}
async function refreshClaudeAccessibility(){
 setAxBusy(true);
 try{
  const result=await invoke('claude_accessibility_usage');
  setAxUsage(result);
  if(result.status==='permission_required'||result.status==='unavailable')setAccountMessage(result.detail);
 }catch(e){setAxUsage({status:'error',detail:String(e)});setAccountMessage('Claude Accessibility: '+String(e))}
 finally{setAxBusy(false)}
}

const refreshAccounts=()=>invoke('list_accounts').then(rows=>{setAccounts(rows);setAccountsReady(true)}).catch(e=>{setAccountsReady(true);setAccountMessage(String(e))});
useEffect(()=>{refreshAccounts();invoke('integrations').then(items=>setIntegrations(Object.fromEntries(items.map(x=>[x.id,x])))).catch(e=>setError(String(e)))},[]);
async function addProfile(){try{await invoke('add_account',{provider:newProvider,name:newName});setAccountMessage('Profile added. Click Login to authorize.');refreshAccounts()}catch(e){setAccountMessage(String(e))}}
const checkingAccounts=useRef(new Set());
async function checkProfile(id){if(checkingAccounts.current.has(id)||['starting','waiting'].includes(authJobs[id]?.phase))return;checkingAccounts.current.add(id);setAccountChecks(v=>v[id]?v:{...v,[id]:{status:'checking',detail:'Проверяем подключение…'}});try{const result=await invoke('check_account',{id});setAccountChecks(v=>({...v,[id]:result}))}catch(e){setAccountChecks(v=>({...v,[id]:{status:'error',detail:String(e)}}))}finally{checkingAccounts.current.delete(id)}}
useEffect(()=>{const refresh=()=>accounts.forEach(a=>checkProfile(a.id));refresh();const timer=setInterval(refresh,30000);window.addEventListener('focus',refresh);return()=>{clearInterval(timer);window.removeEventListener('focus',refresh)}},[accounts.map(a=>a.id).join(','),open]);
async function statuslineRead(id){
 try{const data=await invoke('claude_statusline_read',{id});setStatuslineReports(v=>({...v,[id]:data}));}
 catch(e){setAccountMessage('Status Line read: '+String(e))}
}
async function statuslineAction(id,action){
 try{setAccountMessage(await invoke(action,{id}));await statuslineRead(id)}
 catch(e){setAccountMessage('Status Line: '+String(e))}
}
async function refreshQuota(id){
 const acct=accounts.find(a=>a.id===id);
 if(acct?.provider==='claude'){await statuslineRead(id);return}
 setQuotaReports(s=>({...s,[id]:{...s[id],status:'checking',detail:'Checking provider...'}}));
 try{const r=await invoke('account_quota',{id});setQuotaReports(s=>({...s,[id]:r}))}
 catch(e){setQuotaReports(s=>({...s,[id]:{...s[id],status:'error',detail:String(e),source:s[id]?.source||'NEXUS'}}))}
}
async function refreshIsolation(){
 try{const r=await invoke('account_isolation');setIsolation(Object.fromEntries(r.map(x=>[x.profileId,x])))}
 catch(e){setAccountMessage(String(e))}
}
useEffect(()=>{let off,live=true;listen('claude-limits',e=>{const id=e.payload?.accountId;if(id)statuslineRead(id)}).then(f=>{if(live)off=f;else f()}).catch(()=>{});return()=>{live=false;off?.()}},[]);
useEffect(()=>{accounts.forEach(a=>refreshQuota(a.id));if(!open)return;const timer=setInterval(()=>accounts.forEach(a=>refreshQuota(a.id)),60000);return()=>clearInterval(timer)},[open,accounts.map(a=>a.id).join(',')]);
function quotaText(q){
 if(!q||q.status==='checking')return 'Checking quota...';
 if(q.status!=='available')return 'Quota not exposed by provider';
 const left=q.primaryUsedPercent==null?'':`${Math.max(0,100-q.primaryUsedPercent).toFixed(0)}% left (primary)`;
 const weekly=q.secondaryUsedPercent==null?'':`${Math.max(0,100-q.secondaryUsedPercent).toFixed(0)}% left (secondary)`;
 return [left,weekly].filter(Boolean).join(' · ')||'Quota unavailable';
}
async function loginProfile(id){
 setAuthJobs(s=>({...s,[id]:{phase:'starting',log:'Starting login...'}}));
 try{await invoke('account_login',{id});}catch(e){setAuthJobs(s=>({...s,[id]:{phase:'error',log:String(e)}}));}
}
useEffect(()=>{
 let active=true;
 const unsubs=[];
 listen('auth-event',e=>{const v=e.payload;setAuthJobs(s=>({...s,[v.id]:{phase:v.phase,log:((s[v.id]?.log||'')+'\n'+v.message).slice(-20000)}}));if(v.phase==='ready'){setAccountChecks(s=>({...s,[v.id]:{status:'ready',detail:'Вход подтверждён'} }));loadChatModels()}}).then(u=>{if(active)unsubs.push(u);else u()});
 const poll=setInterval(()=>{for(const a of accounts){{invoke('auth_status',{id:a.id}).then(v=>setAuthJobs(s=>({...s,[a.id]:v}))).catch(()=>{});}}},2000);
 return()=>{active=false;unsubs.forEach(u=>u());clearInterval(poll)};
},[accounts]);
async function openGuide(id){const url=integrations[id]?.url;if(!url)return;try{await invoke('open_external',{url})}catch(e){window.open(url,'_blank')}}
async function cancelLogin(id){try{await invoke('cancel_auth',{id});}catch(e){setAccountMessage(String(e))}}
async function removeProfile(id){
 try{
  await invoke('remove_account',{id});
  setActiveAccount(null);setRemovePending(null);
  setAccountChecks(s=>{const n={...s};delete n[id];return n});
  setAuthJobs(s=>{const n={...s};delete n[id];return n});
  await refreshAccounts();setAccountMessage('Profile removed from NEXUS. Credentials were not deleted.');
 }catch(e){setAccountMessage('Remove failed: '+String(e));throw e}
}
async function openCodexLogin(){try{await invoke('open_codex_device_page')}catch(e){setAccountMessage('Browser: '+String(e))}}
const busy=phase=>['queued','checking','installing','verifying'].includes(phase);
const step=phase=>({queued:0,checking:1,installing:2,verifying:3,installed:3,failed:0})[phase]??0;

async function install(id){setConfirmInstall(null);setJobs(s=>({...s,[id]:{phase:'queued',started:Date.now(),success:null}}));setLogs(s=>({...s,[id]:'Queued'}));setExpanded(s=>({...s,[id]:true}));try{await invoke('install_agent',{id})}catch(e){setJobs(s=>({...s,[id]:{phase:'failed',started:s[id]?.started||Date.now(),success:false}}));setLogs(s=>({...s,[id]:(s[id]||'')+'\nERROR: '+String(e)}));setError('Installation '+id+': '+String(e))}}
async function cancel(id){try{await invoke('cancel_install',{id});setLogs(s=>({...s,[id]:(s[id]||'')+'\\nCancellation requested'}))}catch(e){setError(String(e))}}
async function refreshRegistry(){setRegistryBusy(true);try{setRegistryRows(await invoke('model_registry'))}catch(e){setError('Model registry: '+String(e))}finally{setRegistryBusy(false)}}
async function createAiPlan(){
 setError('');setAdaptivePlan(null);setAdaptiveResults({});setAdaptiveBusy(true);
 try{setAdaptivePlan(await invoke('ai_adaptive_plan',{task:prompt,strategy:adaptiveStrategy,workspace}))}
 catch(e){setError('AI planner: '+String(e))}finally{setAdaptiveBusy(false)}
}
async function createAdaptivePlan(){setError('');setAdaptivePlan(null);setAdaptiveResults({});setAdaptiveBusy(true);
 try{setAdaptivePlan(await invoke('adaptive_plan',{task:prompt,strategy:adaptiveStrategy}))}
 catch(e){setError(String(e))}finally{setAdaptiveBusy(false)}
}
async function executeAdaptiveStep(step){setError('');setAdaptiveBusy(true);
 try{
 const deps=step.dependsOn.map(id=>{
  const previous=adaptiveResults[id];
  if(!previous||previous.status!=='completed')throw Error(`Dependency ${id} is not completed`);
  return `Step ${id}:\n${previous.output.slice(0,3500)}`;
 }).join('\n\n');
 const output=await invoke('adaptive_execute_with_context',{step,workspace,context:deps.slice(0,14000)});if(activeChat){await saveChatMessage('user',`Step ${step.id}: ${step.title}\\n${step.prompt}`);await saveChatMessage('assistant',output)}setAdaptiveResults(old=>({...old,[step.id]:{status:'completed',output}}))}
 catch(e){setAdaptiveResults(old=>({...old,[step.id]:{status:'failed',output:String(e)}}))}
 finally{setAdaptiveBusy(false)}
}
async function run(){setError('');setResult('');setRunning(true);if(activeChat)await saveChatMessage('user',prompt);try{if(taskAccount!=='auto'){{const output=await invoke('run_task_account',{accountId:taskAccount,prompt,workspace});setResult(output);if(activeChat)await saveChatMessage('assistant',output)}}else{const id=selected==='auto'?await invoke('auto_pick'):selected;{const output=await invoke('run_task',{id,prompt,workspace});setResult(output);if(activeChat)await saveChatMessage('assistant',output)}}}catch(e){setError(String(e));if(activeChat)await saveChatMessage('assistant','Error: '+String(e))}finally{setRunning(false)}}
return <div className={'app'+(chatMessages.length===0&&!currentChatSending&&!historyLoading?' cinematic-home':'')+(navCollapsed?' nav-collapsed':'')}><div className="workspace-persona"><ParticlePersona interactive={chatMessages.length===0&&!currentChatSending&&!historyLoading}/></div><ThinkingLightning active={currentChatSending} chatId={activeChat}/>{previewFile&&<FilePreview file={previewFile} onClose={()=>setPreviewFile(null)}/>}<ProjectNavigation projects={projects} activeProject={activeProject} activeChat={activeChat} disabled={filesBusy} busy={chatSending} onProject={setActiveProject} onChat={navigateChat} onCreated={c=>{if(c.projectId!==activeProject){pendingChatRef.current={project:c.projectId,chat:c.id};setActiveProject(c.projectId)}else{setChats(v=>v.some(x=>x.id===c.id)?v.map(x=>x.id===c.id?c:x):[...v,c]);setActiveChat(c.id)}}} onProjects={reloadProjects} onConnections={()=>{setConnectionTarget(null);setOpen(true);setTab('accounts')}} onTools={()=>setToolsOpen(true)}/><header onMouseDown={e=>{if(e.button===0&&!e.target.closest('button')){e.preventDefault();invoke('drag_main_window').catch(err=>setError(String(err)))}}}><div className="mac-navigation"><button title={withShortcut('Предыдущий чат','previous')} aria-label="Предыдущий чат" disabled={chatSending||chats.findIndex(c=>c.id===activeChat)<=0} onClick={()=>setActiveChat(chats[chats.findIndex(c=>c.id===activeChat)-1].id)}><ArrowLeft size={16}/></button><button title={withShortcut('Следующий чат','next')} aria-label="Следующий чат" disabled={chatSending||chats.findIndex(c=>c.id===activeChat)>=chats.length-1} onClick={()=>setActiveChat(chats[chats.findIndex(c=>c.id===activeChat)+1].id)}><ArrowRight size={16}/></button><button title={withShortcut('Показать или скрыть проекты','sidebar')} aria-label="Показать или скрыть проекты" onClick={()=>setNavCollapsed(v=>!v)}><PanelLeft size={16}/></button></div><div className="brand"><span className="mark">◇</span> NEXUS <span className="minor">/ DESKTOP</span></div><div className="topright"><span className="status">● LOCAL SYSTEM</span><button title={withShortcut('Агенты и подключения','connections')} onClick={()=>setOpen(!open)}>Агенты <span className="count">{agents.filter(a=>a.installed).length}</span></button></div></header><main><div className="ambient"></div><div className="hologram"><div className="halo"></div><div className="head"></div><div className="neck"></div><div className="body"></div><div className="ring"></div></div><div className="hero"><span className="eyebrow">NEXUS INTELLIGENCE</span><h1>How can I help?</h1><p>One command. Your AI team.</p></div></main><section className="bottom">{<section className="unified-chat"><div className="chat-heading"><div><span className="chat-heading-project">{projects.find(p=>p.id===activeProject)?.name||'Проект'}</span><strong className="chat-heading-title" title={chats.find(c=>c.id===activeChat)?.title||'Новый чат'}>{chats.find(c=>c.id===activeChat)?.title||'Новый чат'}</strong></div></div>
<ProjectBoard projectId={activeProject} chatId={activeChat} onChat={navigateChat} open={boardOpen} onToggle={()=>setBoardOpen(v=>!v)}/>{<><div className="chat-scroll-area"><div className="chat-thread" ref={chatScroll.viewport} onScroll={()=>{chatScroll.onScroll();if(chatScroll.viewport.current?.scrollTop<160)loadOlderMessages()}} onWheel={chatScroll.onWheel} role="log" aria-label="Conversation" aria-live="polite" aria-busy={currentChatSending}><div className="chat-thread-content" ref={chatScroll.content}>{historyMeta.hasMore&&<button type="button" className="history-load-more" disabled={historyBusy} onClick={loadOlderMessages}>{historyBusy?'Загружаю историю…':'Загрузить более ранние сообщения'}</button>}{historyLoading&&<ChatSkeleton/>}{chatMessages.length===0&&!currentChatSending&&!historyLoading&&<WelcomeScreen loading={!accountsReady} accounts={accounts} checks={accountChecks} quotas={quotaReports} statuslines={statuslineReports} onConnections={()=>{setConnectionTarget(null);setOpen(true)}} system={activeProject==='nexus-system'} onPrompt={value=>{setChatDraft(value);document.querySelector('[aria-label="Message to NEXUS"]')?.focus()}}/>}{chatMessages.map((m,index)=><React.Fragment key={m.id}>{dayKey(m.createdAt)&&dayKey(m.createdAt)!==dayKey(chatMessages[index-1]?.createdAt)&&<div className="chat-day-separator" role="separator" aria-label={dayLabel(m.createdAt)}><span>{dayLabel(m.createdAt)}</span></div>}<article className={'chat-bubble '+m.role} data-message-id={m.id} data-thinking-target={currentChatSending&&m.id===continuingId?"true":undefined}><div className="chat-role">{m.role==='user'?'You':m.role==='assistant'?'NEXUS':'System'}</div>{m.role==='system'?<details className="response-details"><summary>Технические детали</summary><pre>{m.content}</pre></details>:<div className="chat-markdown"><ChatMarkdown agentContext={{enabled:activeProject==='nexus-system'&&!chatSending,chatId:m.chatId,messageId:m.id,onConnected:async()=>{await loadChatModels();refresh();const page=await invoke('chat_message_page',{chatId:activeChat,beforeId:null,limit:40});setChatMessages(rows=>mergeLatestMessages(rows,page.messages))}}} content={m.id===continuingId&&currentChatSending?mergeContinuation(m.content==='Генерация остановлена.'?'':m.content,streamText):m.content} allowQuestion={!chatSending&&chatMessages.at(-1)?.id===m.id} selections={m.questionSelections} legacyReply={chatMessages[index+1]?.role==='user'?chatMessages[index+1].content:null} onQuestion={async(text,selection)=>{const updated=await invoke('save_question_selection',{chatId:m.chatId,messageId:m.id,block:selection.block,answers:selection.answers});setChatMessages(rows=>rows.map(row=>row.id===updated.id?updated:row));await sendChat(text)}}/>{m.attachments?.length>0&&<div className="message-files">{m.attachments.map(file=><FileTile key={file.id} file={file} onOpen={setPreviewFile}/>)}</div>}</div>}{m.stopped&&<div className="generation-stopped">{continuingId===m.id&&currentChatSending?'Продолжаю ответ…':<>Ответ остановлен <button type="button" className="continue-generation" disabled={chatSending||filesBusy} onClick={()=>sendChat('Продолжить',m.id)}>Продолжить</button></>}</div>}{m.details&&<ResponseDetails raw={m.details}/>} {m.role==='assistant'&&<MessageActions message={m} onReply={m=>{setReplyTo(m);document.querySelector('[aria-label="Message to NEXUS"]')?.focus()}} onUpdate={updated=>setChatMessages(rows=>rows.map(row=>row.id===updated.id?updated:row))}/>}</article></React.Fragment>)}{currentChatSending&&!continuingId&&streamText&&<article className="chat-bubble assistant streaming-answer" data-thinking-target="true"><div className="chat-role">NEXUS</div><div className="chat-markdown"><ChatMarkdown content={streamText}/></div></article>}{currentChatSending&&<details className="response-details pending-details" data-thinking-target={!continuingId&&!streamText?"true":undefined}><summary><span className="spinner"/> Готовлю ответ…</summary><p role="status">{chatTrace}</p></details>}</div></div>{chatScroll.showLatest&&<button type="button" className="jump-latest" title="К последнему сообщению" aria-label="К последнему сообщению" onClick={chatScroll.jumpToLatest}><ArrowDown size={18}/></button>}</div>{agentPermission?.chatId===activeChat&&<PermissionCard key={agentPermission.id} request={agentPermission} onAnswer={answerPermission}/>}
{agentQuestion?.chatId===activeChat&&<QuestionCard key={agentQuestion.id} questions={agentQuestion.questions} onSubmit={answerQuestion} onCancel={()=>answerQuestion({})}/>}{routeOffer?.projectId===activeProject&&routeOffer?.chatId===activeChat&&<section className="routing-offer" aria-label="Выбор агента для задачи"><strong>Нужно совместимое подключение</strong><p>{routeOffer.reason} {routeOffer.warning}</p><div><button onClick={()=>{setConnectionTarget(routeOffer.preferred);setOpen(true)}}>Установить / подключить</button><button disabled={!routeOffer.fallback} onClick={()=>{routeApproval.current={text:routeOffer.text,choice:routeOffer.fallback};sendChat(routeOffer.text)}}>Использовать подключённого</button><button onClick={()=>setRouteOffer(null)}>Отмена</button></div><small>После подключения Nexus продолжит этот запрос, если чат и черновик не изменились.</small></section>}<ChatNotice message={projectError} onConnections={()=>setOpen(true)} onClose={()=>setProjectError('')}/><form className="chat-composer" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();attachFiles(e.dataTransfer.files)}} onSubmit={e=>{e.preventDefault();submitChat()}}>{replyTo&&<div className="reply-preview"><div><strong>Ответ на сообщение NEXUS</strong><p>{replyTo.content.slice(0,180)}</p></div><button type="button" aria-label="Отменить цитирование" title="Отменить цитирование" onClick={()=>setReplyTo(null)}>×</button></div>}{draftFiles.length>0&&<div className="draft-files">{draftFiles.map(file=><FileTile key={file.id} file={file} onOpen={setPreviewFile} onRemove={()=>{if(!chatSending)setDraftFiles(v=>v.filter(f=>f.id!==file.id))}}/>)}</div>}<input ref={fileInputRef} type="file" multiple hidden onChange={e=>attachFiles(e.target.files)}/><ComposerInput value={chatDraft} onChange={setChatDraft} onSend={submitChat} maxLength={replyTo?8000:12000} hasFiles={draftFiles.length>0} hasHistory={chatMessages.length>0} suggestionsEnabled={!chatSending&&!replyTo} disabled={!activeProject||agentQuestion?.chatId===activeChat} onPaste={e=>{const files=e.clipboardData?.files;if(files?.length){e.preventDefault();attachFiles(files)}}}/><div className="composer-bottom"><div className="composer-tools"><button type="button" className="attach-button" title={chatSending?'Дождитесь окончания ответа, чтобы прикрепить файлы':filesBusy?'Файлы ещё добавляются':'Прикрепить файлы'} aria-label="Прикрепить файлы" disabled={!activeProject||chatSending||filesBusy} onClick={()=>fileInputRef.current?.click()}><Paperclip size={20}/></button><CustomSelect modelTree value={modelChoice} models={modelChoices} connections={providerRows} task={classifyTask(chatDraft,draftFiles.length>0,routeOptions)} reasoningMode={reasoningMode} disabled={chatSending||modelSaving||!activeChat} busy={modelsBusy} onRefresh={loadChatModels} onChange={e=>saveModelChoice(e.target.value)}/><ComposerParams disabled={chatSending||!activeChat} summary={composerParamsSummary({priority:routingPriority,priorityLabel:ROUTING_PRIORITIES[routingPriority],reasoning:reasoningMode,reasoningLabel:REASONING_LABELS[reasoningMode],team:teamEnabled})} fullSummary={`Приоритет: ${ROUTING_PRIORITIES[routingPriority]} · Глубина: ${REASONING_LABELS[reasoningMode]} · ${teamEnabled?'Команда':'Один агент'}`}><ParamRow label="Приоритет автовыбора" hint={modelChoice!=='auto'&&!modelChoice.startsWith('agent-auto:')?'Действует только при модели «Авто». Сейчас выбрана конкретная модель.':'Чем руководствоваться, когда модель выбирается автоматически.'}><CustomSelect className="reasoning-mode" aria-label="Приоритет автовыбора" title={modelChoice!=='auto'&&!modelChoice.startsWith('agent-auto:')?'Приоритет действует только при модели «Авто»':'Приоритет автовыбора для этого чата'} value={routingPriority} disabled={chatSending||modelSaving||!activeChat||(modelChoice!=='auto'&&!modelChoice.startsWith('agent-auto:'))} onChange={e=>saveRoutingPriority(e.target.value)}>{Object.entries(ROUTING_PRIORITIES).map(([id,label])=><option key={id} value={id}>{label}</option>)}</CustomSelect></ParamRow><ParamRow label="Глубина рассуждений" hint="Независима от модели. Для ACP и API доступна только «Авто»."><CustomSelect className="reasoning-mode" aria-label="Режим рассуждений" title="Глубина рассуждений агента" disabled={chatSending} value={reasoningMode} onChange={e=>setReasoningMode(e.target.value)}><option value="auto">Авто</option><option value="fast">Быстро</option><option value="normal">Обычно</option><option value="deep">Глубоко</option></CustomSelect></ParamRow><ParamRow label="Исполнители" hint="«Команда» делит запрос на 2–4 этапа: это дополнительные вызовы и расход квоты."><CustomSelect className="reasoning-mode" aria-label="Исполнители запроса" value={teamEnabled?'team':'single'} disabled={chatSending||modelSaving||!activeChat} onChange={e=>saveTeamEnabled(e.target.value==='team')}><option value="single">Один агент</option><option value="team">Команда</option></CustomSelect></ParamRow></ComposerParams><CustomSelect className="reasoning-mode" aria-label="Режим работы" value={executionMode} disabled={chatSending} onChange={e=>setExecutionMode(e.target.value)}><option value="discuss">Обсуждение</option><option value="execute">Выполнение · с разрешениями</option></CustomSelect><span>{filesBusy?'Добавляю файлы…':'Enter — отправить'}</span></div>{currentChatSending?<button type="button" className="stop-generation" title="Остановить генерацию" aria-label="Остановить генерацию" disabled={stopping} onClick={stopChat}><Square size={13} fill="currentColor"/><span>{stopping?'Останавливаю…':'Стоп'}</span></button>:<button type="submit" aria-label="Отправить сообщение" title={!activeProject?'Сначала выберите проект':filesBusy?'Файлы ещё добавляются':chatDraft.length>(replyTo?8000:12000)?'Сообщение слишком длинное':!chatDraft.trim()&&!draftFiles.length?'Введите сообщение или прикрепите файл':'Отправить сообщение (Enter)'} disabled={chatSending||!activeProject||!chatsReady||filesBusy||(!chatDraft.trim()&&!draftFiles.length)||chatDraft.length>(replyTo?8000:12000)}><ArrowUp size={20}/></button>}</div><TeamPlanPreview plan={teamPreview} integrator={modelChoices.find(m=>m.id===routePreview.choice)?.label||'Авто'}/><RoutingPreview route={routePreview} models={modelChoices}/>{modelLoadError&&<small className="model-load-error" role="status">{modelLoadError}</small>}</form></>}</section>}
{toolsOpen&&<ProjectTools projectId={activeProject} onClose={()=>setToolsOpen(false)} initialTask={chatDraft||chatMessages.filter(m=>m.role==='user').at(-1)?.content||''} workspace={workspace} onPlanToChat={setChatDraft} onConnections={()=>{setToolsOpen(false);setConnectionTarget(null);setOpen(true)}}/>}</section><ConnectionsDialog open={open} onClose={()=>setOpen(false)} initialProvider={connectionTarget} agents={agents} accounts={accounts} jobs={jobs} logs={logs} checks={accountChecks} authJobs={authJobs} quotas={quotaReports} statuslines={statuslineReports} onInstall={install} onCancelInstall={cancel} onLogin={loginProfile} onCancelLogin={cancelLogin} onCheck={checkProfile} onQuota={refreshQuota} onRemove={removeProfile} onRefreshAccounts={refreshAccounts} onRefreshAgents={refresh} onModels={loadChatModels} onProviderRows={setProviderRows}/>
</div>}
createRoot(document.getElementById('root')).render(<App/>);
