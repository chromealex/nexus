import {useLayoutEffect,useRef,useState} from 'react';

export function useChatScroll(chatId,revision) {
 const viewport=useRef(null),content=useRef(null),following=useRef(true),lastTop=useRef(0);
 const [showLatest,setShowLatest]=useState(false);
 const update=()=>{
  const el=viewport.current;if(!el)return;
  if(following.current){el.scrollTop=el.scrollHeight;lastTop.current=el.scrollTop;}
  setShowLatest(!following.current&&el.scrollHeight-el.clientHeight-el.scrollTop>3);
 };
 const jumpToLatest=()=>{following.current=true;update();};
 const onScroll=()=>{
  const el=viewport.current;if(!el)return;
  if(el.scrollTop<lastTop.current-1)following.current=false;
  else if(el.scrollHeight-el.clientHeight-el.scrollTop<=3)following.current=true;
  lastTop.current=el.scrollTop;
  setShowLatest(!following.current&&el.scrollHeight-el.clientHeight-el.scrollTop>3);
 };
 const onWheel=e=>{if(e.deltaY<0)following.current=false;};
 useLayoutEffect(()=>{following.current=true;update();},[chatId]);
 // revision may be a deps array; spread it so a fresh array literal does not re-run the effect on every render.
 useLayoutEffect(update,Array.isArray(revision)?revision:[revision]);
 useLayoutEffect(()=>{
  if(!viewport.current||!content.current)return;
  const observer=new ResizeObserver(update);
  observer.observe(viewport.current);observer.observe(content.current);
  return()=>observer.disconnect();
 },[chatId]);
 const keepReading=()=>{following.current=false;lastTop.current=viewport.current?.scrollTop||0};
 return {viewport,content,onScroll,onWheel,showLatest,jumpToLatest,keepReading};
}
