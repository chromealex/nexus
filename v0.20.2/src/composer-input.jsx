import React,{useRef,useState} from 'react';
import {composerSuggestion} from './composer-suggestions.js';
export function ComposerInput({value,onChange,onSend,onPaste,disabled,maxLength=12000,hasFiles,hasHistory,suggestionsEnabled=true}){
 const input=useRef(null),ghost=useRef(null);
 const [atEnd,setAtEnd]=useState(true),[composing,setComposing]=useState(false),[dismissed,setDismissed]=useState(false);
 const full=value.length===0&&!disabled&&suggestionsEnabled&&atEnd&&!composing&&!dismissed?composerSuggestion(value,{hasFiles,hasHistory,maxLength}):'';
 const suffix=full?full.slice(value.length):'';
 function selection(e){setAtEnd(e.currentTarget.selectionStart===e.currentTarget.value.length&&e.currentTarget.selectionEnd===e.currentTarget.value.length)}
 return <div className="composer-input-wrap">
 {suffix&&<div ref={ghost} className="composer-ghost" aria-hidden="true"><span className="ghost-prefix">{value}</span><span>{suffix}</span></div>}
 <textarea ref={input} aria-label="Message to NEXUS" aria-describedby={suffix?'composer-suggestion-help':undefined} aria-autocomplete="inline" autoComplete="off" rows={2} value={value} disabled={disabled} maxLength={maxLength} placeholder={suffix?'':hasHistory?'Напишите сообщение…':'Что создадим сегодня?'} onPaste={onPaste}
 onChange={e=>{setDismissed(false);setAtEnd(e.target.selectionStart===e.target.value.length&&e.target.selectionEnd===e.target.value.length);onChange(e.target.value)}} onSelect={selection}
 onCompositionStart={()=>setComposing(true)} onCompositionEnd={()=>setComposing(false)}
 onScroll={e=>{if(ghost.current){ghost.current.scrollTop=e.target.scrollTop;ghost.current.scrollLeft=e.target.scrollLeft}}}
 onKeyDown={e=>{
  if(e.nativeEvent.isComposing||composing)return;
  if(e.key==='Tab'&&!e.shiftKey&&!e.ctrlKey&&!e.altKey&&!e.metaKey&&suffix){e.preventDefault();onChange(full);setDismissed(true);requestAnimationFrame(()=>{input.current?.setSelectionRange(full.length,full.length)});return;}
  if(e.key==='Escape'&&suffix){e.preventDefault();setDismissed(true);return;}
  if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();onSend();}
 }}/>
 {suffix&&<><kbd className="composer-tab-hint" aria-hidden="true">Tab</kbd><span id="composer-suggestion-help" className="visually-hidden">Tab — принять подсказку: {full}. Escape — скрыть.</span></>}
 </div>;
}
