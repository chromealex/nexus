import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {CustomSelect} from '../src/custom-select.jsx';
import {classifyTask} from '../src/agent-catalog.js';
import {MODEL_PROFILES} from '../src/model-profiles.js';
import '../src/style.css';import '../src/dialog-theme.css';
function Fixture(){const [value,setValue]=useState('auto');const models=Object.keys(MODEL_PROFILES).map(model=>({id:(model.startsWith('gpt-')?'codex/':'api-demo/')+model,provider:model.startsWith('gpt-')?'codex':'api-demo',model,label:model,isDefault:model==='gpt-6.1-sol',images:model.startsWith('gpt-')}));return <div style={{padding:40}}><CustomSelect modelTree value={value} models={models} connections={[{id:'api-demo',provider:'grok',name:'API · проверка'}]} task={classifyTask('Объясни код')} reasoningMode="auto" onRefresh={()=>{}} onChange={e=>setValue(e.target.value)}/><p data-testid="selection">{value}</p></div>}
createRoot(document.getElementById('root')).render(<Fixture/>);
