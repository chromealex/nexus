// Flowing ribbons projected onto the actual particle surface, never through the head.
import fs from 'node:fs';
const raw=fs.readFileSync('public/persona/hi3d-head.points');
const points=new Float32Array(raw.buffer,raw.byteOffset,raw.length/4),count=64000;
const cell=.035,grid=new Map(),key=p=>p.map(v=>Math.floor(v/cell)).join(',');
const pos=i=>Array.from(points.subarray(i*18,i*18+3));
const norm=i=>Array.from(points.subarray(i*18+15,i*18+18));
const dot=(a,b)=>a.reduce((s,v,k)=>s+v*b[k],0);
const unit=v=>{const l=Math.hypot(...v)||1;return v.map(x=>x/l);};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
for(let i=0;i<count;i++){const k=key(pos(i));if(!grid.has(k))grid.set(k,[]);grid.get(k).push(i);}
function nearest(p,n,previous){const c=p.map(v=>Math.floor(v/cell));let best=-1,distance=.025**2;for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++)for(const i of grid.get([c[0]+x,c[1]+y,c[2]+z].join(','))||[]){if(i===previous||dot(norm(i),n)<.65)continue;const q=pos(i),d=q.reduce((s,v,k)=>s+(v-p[k])**2,0);if(d<distance){best=i;distance=d;}}return best;}
let rng=716;const random=()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng/4294967296;};
const ribbons=[],starts=[];let paths=0;
for(let attempt=0;attempt<1400&&paths<144;attempt++){
 let index=Math.floor(random()*count);const start=pos(index);
 if(points[index*18+9]<.2||starts.some(p=>Math.hypot(...p.map((v,k)=>v-start[k]))<.065))continue;
 const angle=random()*Math.PI*2;let direction=unit([Math.cos(angle),Math.sin(angle)*.8,.25]);const path=[index],seen=new Set(path);
 for(let step=0;step<38;step++){const p=pos(index),n=norm(index),projection=dot(direction,n);direction=unit(direction.map((v,k)=>v-n[k]*projection));const next=nearest(p.map((v,k)=>v+direction[k]*.018),n,index);if(next<0||seen.has(next))break;const q=pos(next),delta=unit(q.map((v,k)=>v-p[k]));if(dot(delta,direction)<.35)break;direction=unit(direction.map((v,k)=>v*.8+delta[k]*.2));path.push(next);seen.add(next);index=next;}
 if(path.length<12)continue;starts.push(start);const warm=paths%13===0,seed=random(),rgb=warm?[1,.66,.30]:[.65,.9,1];paths++;
 for(let j=0;j<path.length-1;j++){
  const a=pos(path[j]),b=pos(path[j+1]),na=norm(path[j]),nb=norm(path[j+1]),t=unit(b.map((v,k)=>v-a[k]));
  const sa=unit(cross(na,t)),sb=unit(cross(nb,t));
  const fadeA=Math.sin(j/(path.length-1)*Math.PI),fadeB=Math.sin((j+1)/(path.length-1)*Math.PI);
  function vertex(p,n,side,offset,alpha,fade){return [...p.map((v,k)=>v+side[k]*offset+n[k]*.0015),...rgb,seed,1,2,alpha*fade,0,0,0,0,0,...n];}
  // Broad faint halo and a narrow bright core; triangle interpolation feathers both.
  for(const [width,brightness] of [[.006,.12],[.0012,.65]]){
   const al=vertex(a,na,sa,-width,0,fadeA),ac=vertex(a,na,sa,0,brightness,fadeA),ar=vertex(a,na,sa,width,0,fadeA);
   const bl=vertex(b,nb,sb,-width,0,fadeB),bc=vertex(b,nb,sb,0,brightness,fadeB),br=vertex(b,nb,sb,width,0,fadeB);
   for(const v of [al,ac,bc,al,bc,bl,ac,ar,br,ac,br,bc])ribbons.push(...v);
  }
 }
}
if(paths<20||!ribbons.every(Number.isFinite))throw Error('Insufficient surface filaments');
const data=new Float32Array(ribbons);fs.writeFileSync('public/persona/hi3d-filaments.bin',Buffer.from(data.buffer));
fs.writeFileSync('public/persona/hi3d-filaments.json',JSON.stringify({paths,vertices:data.length/18,strideFloats:18,primitive:'triangles',source:'hi3d-head.points',style:'surface-projected cool ribbons with sparse amber accents'},null,2)+'\n');
console.log({paths,vertices:data.length/18});
