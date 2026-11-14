import React,{useState} from 'react';
import {X,Plus} from 'lucide-react';
import {Quota} from './quota-view.jsx';
const names={claude:'Claude Code',codex:'OpenAI Codex',gemini:'Gemini CLI'};
export function WelcomeScreen({accounts=[],checks={},quotas={},statuslines={},onConnections}){
 const [show,setShow]=useState(true);
 const rows=accounts.slice(0,2);
 return <div className="nexus-welcome cinematic-welcome">{show?<section className="welcome-connections" aria-label="Подключения"><div className="welcome-connections-heading"><h2>Подключения</h2><button aria-label="Скрыть карточку подключений" onClick={()=>setShow(false)}><X size={17}/></button></div><div className="welcome-connections-tabs"><button onClick={onConnections}>Каталог</button><span>Аккаунты</span></div><div className="welcome-account-list">{rows.map(a=><div className="welcome-account" key={a.id}><div className="welcome-account-title"><img src={'/agents/'+a.provider+'.svg'} alt="" onError={e=>{e.currentTarget.style.visibility='hidden'}}/><div><strong>{names[a.provider]||a.provider}</strong><small>{a.name} · {checks[a.id]?.status==='ready'?'Вход подтверждён':checks[a.id]?.status==='checking'?'Проверяем вход':'Требуется проверка'}</small></div></div><Quota quota={quotas[a.id]} statusline={statuslines[a.id]}/></div>)}{!rows.length&&<p>Подключите первого агента, чтобы начать работу.</p>}</div><button className="welcome-connect-action" onClick={onConnections}><Plus size={15}/>Подключить агента</button></section>:<button className="welcome-show-connections" onClick={()=>setShow(true)}>Подключения</button>}</div>
}
