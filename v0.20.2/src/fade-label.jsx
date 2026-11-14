import React,{useLayoutEffect,useRef,useState} from 'react';
// Observe the actual text slot: buttons entering the flex row change its width.
export function FadeLabel({children,className=''}){
 const node=useRef(null),[overflow,setOverflow]=useState(false);
 useLayoutEffect(()=>{const el=node.current;if(!el)return;let live=true;const measure=()=>{if(live)setOverflow(el.scrollWidth>el.clientWidth+1)};measure();const observer=new ResizeObserver(measure);observer.observe(el);document.fonts?.ready.then(measure);return()=>{live=false;observer.disconnect()}},[children]);
 return <span ref={node} className={'nav-fade-text '+className+(overflow?' is-overflowing':'')} title={overflow?String(children):undefined}>{children}</span>
}
