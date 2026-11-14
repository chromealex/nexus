import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
let slots=[],cursor=0,effects=[],effectSlots=[],effectCursor=0,observer;
const equal=(a,b)=>a&&a.length===b.length&&a.every((v,i)=>v===b[i]);
const sandbox={
 useRef:value=>{const i=cursor++;return slots[i]??=( {current:value})},
 useState:value=>{const i=cursor++;slots[i]??=value;return [slots[i],v=>{slots[i]=v}]},
 useLayoutEffect:(fn,deps)=>{const i=effectCursor++;if(!equal(effectSlots[i],deps)){effectSlots[i]=deps;effects.push(fn)}},
 ResizeObserver:class{constructor(fn){observer=fn}observe(){}disconnect(){}}
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(new URL('../src/use-chat-scroll.js',import.meta.url),'utf8').replace(/^import .*\n/,'').replace('export function','function')+'\nglobalThis.hook=useChatScroll;',sandbox);
let current;function render(chat,revision){cursor=0;effectCursor=0;effects=[];current=sandbox.hook(chat,revision);return current}function flush(){for(const f of effects)f()}
const el={scrollTop:0,scrollHeight:1000,clientHeight:300};
render('a',1);current.viewport.current=el;current.content.current={};flush();assert.equal(el.scrollTop,1000);
// Mimic the browser clamping programmatic scroll to the bottom.
el.scrollTop=700;current.onScroll();el.scrollTop=450;current.onScroll();render('a',2);el.scrollHeight=1200;flush();assert.equal(el.scrollTop,450);render('a',2);assert.equal(current.showLatest,true);
current.jumpToLatest();assert.equal(el.scrollTop,1200);el.scrollTop=900;current.onScroll();
current.onWheel({deltaY:-1});el.scrollTop=899;el.scrollHeight=1300;render('a',3);flush();assert.equal(el.scrollTop,899);
current.jumpToLatest();el.scrollHeight=1400;observer();assert.equal(el.scrollTop,1400);
el.scrollTop=100;current.onScroll();render('b',4);flush();assert.equal(el.scrollTop,1400);
console.log('Chat scroll: reading position survives streaming, explicit jump and conversation switch resume following.');
