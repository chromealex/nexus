import React,{useEffect,useRef,useState} from 'react';
import {hitPersona,internalDischarge,CHARGE_DURATION_MS} from './persona-lightning.js';

// User-supplied Hi3D surface; smooth normals and two-pass particle occlusion.
// This asset has no facial rig or morph targets.
const vertex=`
attribute vec3 position,color,normal;
attribute float seed,size,layer,edge,accent;
uniform float time,aspect,scale,still,pixelRatio,height,chargeAge;
uniform vec3 chargePath[12];
uniform lowp float depthPass,linePass;
varying mediump vec3 tint;
varying mediump float opacity;
void main(){
 vec3 p=position;
 float motion=1.0-still;
 float face=exp(-pow(p.x/.46,4.0)-pow((p.y-.3)/.55,4.0));

 vec3 n=normal;
 float excitation=0.;
 if(chargeAge>=0.&&chargeAge<8.&&abs(layer-1.)>.1){
  float envelope=(1.-exp(-chargeAge*12.))*pow(max(0.,1.-chargeAge/8.),1.5);
  for(int i=0;i<11;i++){
   vec2 a=chargePath[i].xy,b=chargePath[i+1].xy,ab=b-a;
   float t=clamp(dot(position.xy-a,ab)/max(dot(ab,ab),.000001),0.,1.);
   float distance=length(position.xy-(a+ab*t));
   float arrival=mix(chargePath[i].z,chargePath[i+1].z,t);
   float reached=smoothstep(arrival,arrival+.1,chargeAge);
   excitation=max(excitation,exp(-distance*distance/.0025)*reached*envelope);
  }
  excitation*=smoothstep(0.,.25,normal.z);
  p+=excitation*motion*.003*vec3(sin(time*9.+seed*31.),cos(time*7.+seed*19.),0.);
 }
 float drift=mix(.0015,.00015,face)*motion;
 p+=drift*vec3(sin(time*.32+seed*70.),cos(time*.4+seed*43.),sin(time*.28+seed*91.));
 if(abs(layer-1.)<.1){p.x+=sin(time*.22+seed*60.)*.045*motion;p.y+=sin(time*.6+seed*80.)*.008*motion;p.z+=cos(time*.26+seed*50.)*.025*motion;}
 
 gl_Position=vec4(p.x*scale/aspect,p.y*scale,-p.z*.2+depthPass*.003-linePass*.0003,1.0);
 float pointSize=height*scale*pixelRatio*.0041*size*(1.+excitation*.65);
 gl_PointSize=clamp(pointSize,1.,10.);
 if(depthPass>.5)gl_PointSize=max(gl_PointSize,height*scale*pixelRatio*.009);

 float lighting=.16+.70*max(0.,dot(normalize(n),normalize(vec3(-.6,.65,1.))));
 float rim=pow(1.-abs(normalize(n).z),3.)*.28;
 float pulse=1.+motion*.12*sin(time*.65+seed*40.);
 tint=color*(abs(layer-1.)<.1?.8:(lighting*.70+edge*.6+rim*.8+accent*.9)*pulse);
 opacity=abs(layer-1.)<.1 ? (.12+.35*pow(.5+.5*sin(time*.8+seed*90.),3.)) * pow(max(0.,1.-length(vec2(position.x,position.z/.46))/.52),1.7) : mix(.44,.9,max(edge,accent))*smoothstep(-.02,.12,n.z);
 if(linePass>.5){tint=color*(1.15+motion*.10*sin(time*.55+seed*25.));opacity=edge*smoothstep(-.03,.2,n.z);}
 tint=mix(tint,vec3(.75,.94,1.3),excitation*.8);
 opacity=min(1.,opacity+excitation*.45);
}`;
const fragment=`precision mediump float;
uniform lowp float depthPass,linePass;
varying mediump vec3 tint;
varying mediump float opacity;
void main(){if(linePass>.5){gl_FragColor=vec4(tint,opacity);return;}float r=length(gl_PointCoord-.5)*2.;if(r>1.||opacity<.01)discard;
 if(depthPass>.5){gl_FragColor=vec4(0.);return;}
 float core=1.-smoothstep(.1,.55,r);
 float halo=(1.-smoothstep(.2,1.,r))*.25;
 gl_FragColor=vec4(tint*(.8+core*.7),opacity*(core+halo));}`;
export function ParticlePersona({interactive=true}){
 const interactiveRef=useRef(interactive);interactiveRef.current=interactive;
 const [bolts,setBolts]=useState([]);
 const scene=useRef(null),canvas=useRef(null);const [failed,setFailed]=useState(null);
 useEffect(()=>{
  const el=canvas.current,gl=el.getContext('webgl',{alpha:true,antialias:false,powerPreference:'low-power'});
  if(!gl){setFailed({message:'Не удалось создать контекст WebGL.',details:''});return}
  let frame=0,disposed=false,visible=true,start=performance.now(),last=0;
  const shaders=[],buffers=[];let program,cleanup;const abort=new AbortController();
  const media=matchMedia('(prefers-reduced-motion: reduce)');
  const timers=new Set();let lastBolt=-Infinity,boltId=0,chargeStarted=-Infinity;let chargePath=new Float32Array(36);
  async function init(){try{
   const response=await fetch('/persona/hi3d-head.points',{signal:abort.signal});if(!response.ok)throw Error('Не удалось загрузить модель: HTTP '+response.status);
   const data=new Float32Array(await response.arrayBuffer());if(disposed)return;
   const ribbonResponse=await fetch('/persona/hi3d-filaments.bin',{signal:abort.signal});if(!ribbonResponse.ok)throw Error('Не удалось загрузить световые нити: HTTP '+ribbonResponse.status);
   const ribbons=new Float32Array(await ribbonResponse.arrayBuffer());if(disposed)return;
   if(!ribbons.length||ribbons.length%(18*3)||!ribbons.every(Number.isFinite))throw Error('Неподдерживаемый формат световых нитей.');
   const combined=new Float32Array(data.length+ribbons.length);combined.set(data);combined.set(ribbons,data.length);
   if(data.length!==65200*18||!data.every(Number.isFinite))throw Error('Файл модели имеет неподдерживаемый формат.');
   let radius=0,extentY=0;for(let i=0;i<data.length;i+=18){radius=Math.max(radius,Math.hypot(data[i],data[i+2]));extentY=Math.max(extentY,Math.abs(data[i+1]))}const fitX=radius*1.12,fitY=(extentY+radius*Math.sin(.3))*1.12;
   let anchorX=0,anchorY=0,bestAnchor=Infinity;
   for(let i=0;i<64000*18;i+=18){if(data[i+17]<.3)continue;const d=(data[i]+.18)**2+(data[i+1]-.32)**2;if(d<bestAnchor){bestAnchor=d;anchorX=data[i];anchorY=data[i+1];}}
   const compile=(type,source)=>{const s=gl.createShader(type);shaders.push(s);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error('Ошибка компиляции '+(type===gl.VERTEX_SHADER?'вершинного':'фрагментного')+' шейдера: '+gl.getShaderInfoLog(s));return s};
   program=gl.createProgram();gl.attachShader(program,compile(gl.VERTEX_SHADER,vertex));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('Ошибка связывания шейдеров: '+gl.getProgramInfoLog(program));gl.useProgram(program);
   const buffer=gl.createBuffer();buffers.push(buffer);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,combined,gl.STATIC_DRAW);
   for(const [name,size,offset] of [['position',3,0],['color',3,12],['seed',1,24],['size',1,28],['layer',1,32],['normal',3,60],['edge',1,36],['accent',1,40]]){const a=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,size,gl.FLOAT,false,72,offset)}
   const uniforms=Object.fromEntries(['time','aspect','scale','still','pixelRatio','height','depthPass','linePass','chargeAge','chargePath[0]'].map(n=>[n,gl.getUniformLocation(program,n)]));
   gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.enable(gl.BLEND);gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.clearColor(0,0,0,0);
   const draw=now=>{frame=0;if(disposed||document.hidden||!visible)return;
    if(now-last>=32||media.matches){last=now;const w=el.clientWidth,h=el.clientHeight,dpr=Math.min(devicePixelRatio||1,1.6);if(w&&h){if(el.width!==Math.round(w*dpr)||el.height!==Math.round(h*dpr)){el.width=Math.round(w*dpr);el.height=Math.round(h*dpr)}const sceneScale=Math.min(.9/fitY,.9*(w/h)/fitX),lightningX=String(w/2+anchorX*sceneScale*h/2),lightningY=String(h/2-anchorY*sceneScale*h/2);
 if(el.dataset.lightningX!==lightningX)el.dataset.lightningX=lightningX;if(el.dataset.lightningY!==lightningY)el.dataset.lightningY=lightningY;
 gl.viewport(0,0,el.width,el.height);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.uniform1f(uniforms.chargeAge,Number.isFinite(chargeStarted)?(now-chargeStarted)/1000:-1);gl.uniform3fv(uniforms['chargePath[0]'],chargePath);gl.uniform1f(uniforms.pixelRatio,dpr);gl.uniform1f(uniforms.height,h);gl.uniform1f(uniforms.time,(now-start)/1000);gl.uniform1f(uniforms.aspect,w/h);gl.uniform1f(uniforms.scale,Math.min(.9/fitY,.9*(w/h)/fitX));gl.uniform1f(uniforms.still,media.matches?1:0);// First resolve nearest surface depth, then shade it. Background points
 // cannot shine through the face; floor remains independently translucent.
 gl.uniform1f(uniforms.linePass,0);gl.uniform1f(uniforms.depthPass,1);gl.disable(gl.BLEND);gl.colorMask(false,false,false,false);gl.depthMask(true);gl.drawArrays(gl.POINTS,0,64000);
 gl.uniform1f(uniforms.depthPass,0);gl.enable(gl.BLEND);gl.colorMask(true,true,true,true);gl.depthMask(false);gl.drawArrays(gl.POINTS,0,64000);gl.drawArrays(gl.POINTS,64000,1200);gl.uniform1f(uniforms.linePass,1);gl.drawArrays(gl.TRIANGLES,65200,ribbons.length/18);gl.depthMask(true)}}
    if(!media.matches||now-chargeStarted<CHARGE_DURATION_MS)frame=requestAnimationFrame(draw);
   };
   const wake=()=>{scene.current?.classList.toggle('persona-paused',document.hidden||!visible);if(!frame&&!disposed)frame=requestAnimationFrame(draw)};
   const resize=new ResizeObserver(wake);resize.observe(el);
   const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;wake()});observer.observe(el);
   const strike=(x,y)=>{
    const now=performance.now();if(!interactiveRef.current||now-lastBolt<450||document.hidden||!visible)return;
    const w=el.clientWidth,h=el.clientHeight,scale=Math.min(.9/fitY,.9*(w/h)/fitX);
    const origin=hitPersona(data,x,y,w,h,scale);
    if(!origin)return;
    lastBolt=now;chargeStarted=now;const id=++boltId;const discharge=internalDischarge(data,origin,w,h,scale);chargePath=discharge.chargePath;wake();
    setBolts([{id,origin,width:w,height:h,paths:discharge.paths}]);
    const timer=setTimeout(()=>{timers.delete(timer);if(!disposed)setBolts(previous=>previous.filter(b=>b.id!==id));},CHARGE_DURATION_MS);timers.add(timer);
   };
   const click=e=>{const r=el.getBoundingClientRect();strike(e.clientX-r.left,e.clientY-r.top);};
   const keydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();strike(el.clientWidth/2,el.clientHeight*.42);}};
   const lost=e=>{e.preventDefault();cancelAnimationFrame(frame);setFailed({message:'Графический контекст был потерян.',details:'Перезапустите окно приложения.'})};
   el.addEventListener('click',click);el.addEventListener('keydown',keydown);el.addEventListener('webglcontextlost',lost);document.addEventListener('visibilitychange',wake);media.addEventListener('change',wake);wake();
   cleanup=()=>{disposed=true;cancelAnimationFrame(frame);resize.disconnect();observer.disconnect();el.removeEventListener('click',click);el.removeEventListener('keydown',keydown);el.removeEventListener('webglcontextlost',lost);document.removeEventListener('visibilitychange',wake);media.removeEventListener('change',wake);buffers.forEach(b=>gl.deleteBuffer(b));shaders.forEach(s=>gl.deleteShader(s));gl.deleteProgram(program)};

  }catch(error){if(disposed)return;buffers.forEach(b=>gl.deleteBuffer(b));shaders.forEach(s=>gl.deleteShader(s));if(program)gl.deleteProgram(program);setFailed({message:'Не удалось отрисовать персонажа. Чат доступен.',details:error instanceof Error?error.message:String(error)})}}
  init();return()=>{disposed=true;abort.abort();for(const timer of timers)clearTimeout(timer);cleanup?.()};
 },[]);
 return <div ref={scene} className="particle-persona"><div className="persona-environment" aria-hidden="true"/><div className="persona-light-drift" aria-hidden="true"/><div className="persona-smoke" aria-hidden="true"><i/><i/><i/></div><canvas ref={canvas} tabIndex={interactive?0:-1} aria-label={interactive?"Выпустить молнию из головы андроида":"Голограмма андроида на фоне"} role={interactive?"button":"img"}/>{bolts.map(bolt=><svg key={bolt.id} className="persona-lightning" viewBox={`0 0 ${bolt.width} ${bolt.height}`} preserveAspectRatio="none" aria-hidden="true"><circle className="lightning-origin" cx={bolt.origin.x} cy={bolt.origin.y} r="5"/>{bolt.paths.map((arc,i)=><g key={i} className={arc.internal?'lightning-channel lightning-internal':arc.branch?'lightning-channel lightning-branch':'lightning-channel'} style={{'--arc-delay':`${arc.delay}ms`,'--arc-life':`${CHARGE_DURATION_MS-arc.delay}ms`}}><path d={arc.d} pathLength="1" className="lightning-halo" style={{strokeWidth:arc.width*3.5}}/><path d={arc.d} pathLength="1" className="lightning-core" style={{strokeWidth:arc.width}}/></g>)}</svg>)}{failed&&<div className="persona-unavailable"><p>{failed.message}</p>{failed.details&&<details><summary>Причина ошибки</summary><pre>{failed.details}</pre></details>}</div>}</div>
}
