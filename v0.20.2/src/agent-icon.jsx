import React from 'react';
import {Bot} from 'lucide-react';
const names={claude:'Claude',codex:'OpenAI Codex',gemini:'Gemini',qwen:'Qwen',opencode:'OpenCode',aider:'Aider',goose:'Goose',grok:'Grok'};
export function AgentIcon({provider}){return <span className={'agent-logo agent-logo-'+provider}>{names[provider]?<img src={'/agents/'+provider+'.svg'} alt={names[provider]} onError={e=>{e.currentTarget.style.display='none';e.currentTarget.nextSibling.style.display='block'}}/>:null}<Bot aria-hidden="true" size={22} style={{display:names[provider]?'none':'block'}}/></span>}
