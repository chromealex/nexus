import assert from 'node:assert/strict';
import fs from 'node:fs';
const raw=fs.readFileSync(new URL('../public/persona/hi3d-head.points',import.meta.url));
assert.equal(raw.length%72,0);
const data=new Float32Array(raw.buffer,raw.byteOffset,raw.length/4);
assert.ok(data.every(Number.isFinite));
let radius=0,yMax=0,blink=0,smile=0,hair=0,floor=0,front=false,back=false;
for(let i=0;i<data.length;i+=18){radius=Math.max(radius,Math.hypot(data[i],data[i+2]));yMax=Math.max(yMax,Math.abs(data[i+1]));blink+=data.slice(i+9,i+12).some(v=>Math.abs(v)>1e-7);smile+=data.slice(i+12,i+15).some(v=>Math.abs(v)>1e-7);hair+=data[i+8]===2;floor+=data[i+8]===1;front ||= data[i+2]>.4;back ||= data[i+2]<-.25}
const meta=JSON.parse(fs.readFileSync(new URL('../public/persona/hi3d-head.json',import.meta.url)));
assert.equal(data.length/18,meta.pointCount);
assert.equal(meta.selection,'largest connected component');
assert.ok(meta.vertices<meta.sourceVertexCount&&meta.triangles<meta.sourceTriangleCount);
assert.ok(front&&back&&blink>100&&smile===0&&hair===0&&floor===1200);
assert.equal(meta.hasMorphTargets,false);
assert.equal(meta.surfaceCount,64000);
let accents=0,edges=0,minSize=Infinity,maxSize=0;
for(let i=0;i<meta.surfaceCount*18;i+=18){assert.ok(data[i+9]>=0&&data[i+9]<=1);edges+=data[i+9]>.25;accents+=data[i+10]===1;minSize=Math.min(minSize,data[i+7]);maxSize=Math.max(maxSize,data[i+7]);}
assert.ok(edges>1000&&accents>200&&accents<meta.surfaceCount*.2);
assert.ok(maxSize/minSize>4);

for(let i=0;i<data.length;i+=18){assert.ok(Math.abs(Math.hypot(...data.subarray(i+15,i+18))-1)<.001);}
const fitX=radius*1.12,fitY=(yMax+radius*Math.sin(.3))*1.12;
for(const aspect of [.25,.5,1,1.5,2.5,4])for(const yaw of [0,.6,1.57,2.7,Math.PI])for(const pitch of [-.3,0,.3]){
 const scale=Math.min(.9/fitY,.9*aspect/fitX);
 for(let i=0;i<data.length;i+=18*31){const x=data[i],y=data[i+1],z=data[i+2];const xx=x*Math.cos(yaw)+z*Math.sin(yaw),zz=-x*Math.sin(yaw)+z*Math.cos(yaw),yy=y*Math.cos(pitch)+zz*Math.sin(pitch);assert.ok(Math.abs(xx*scale/aspect)<.91);assert.ok(Math.abs(yy*scale)<.91)}
}
console.log('Hi3D asset: single head, full depth, normalized smooth normals, edge accents, varied sizes, floor and viewport fit across aspect ratios/yaw/pitch passed.');

// Shared shader uniforms must have matching precision at link time (WebGL 1).
const source=fs.readFileSync(new URL('../src/particle-persona.jsx',import.meta.url),'utf8');
const vertex=source.match(/const vertex=`([\s\S]*?)`;/)[1];
const fragment=source.match(/const fragment=`([\s\S]*?)`;/)[1];
function interfaces(code,defaultPrecision){const result=new Map();for(const m of code.matchAll(/(uniform|varying)\s+(?:(lowp|mediump|highp)\s+)?(float|vec[234])\s+([^;]+);/g))for(const name of m[4].split(','))result.set(m[1]+':'+name.trim(),(m[2]||defaultPrecision)+' '+m[3]);return result;}
const vi=interfaces(vertex,'highp'),fi=interfaces(fragment,'mediump');
for(const [name,type] of fi)if(vi.has(name))assert.equal(type,vi.get(name),'Shader interface mismatch: '+name);
console.log('Shader shared uniforms/varyings: matching WebGL precision passed.');

const ribbonBytes=fs.readFileSync(new URL('../public/persona/hi3d-filaments.bin',import.meta.url));
assert.equal(ribbonBytes.length%(72*3),0);
const ribbonData=new Float32Array(ribbonBytes.buffer,ribbonBytes.byteOffset,ribbonBytes.length/4);
assert.ok(ribbonData.every(Number.isFinite));
let warm=0,cool=0,faded=0,lit=0;
for(let i=0;i<ribbonData.length;i+=18){assert.equal(ribbonData[i+8],2);assert.ok(ribbonData[i+9]>=0&&ribbonData[i+9]<=.66);warm+=ribbonData[i+3]>ribbonData[i+5];cool+=ribbonData[i+5]>ribbonData[i+3];faded+=ribbonData[i+9]===0;lit+=ribbonData[i+9]>.3;}
assert.ok(warm>0&&cool>warm*5&&faded>0&&lit>0);
for(let i=0;i<ribbonData.length;i+=54){for(let v=1;v<3;v++){const j=i+v*18;assert.ok(Math.hypot(ribbonData[j]-ribbonData[i],ribbonData[j+1]-ribbonData[i+1],ribbonData[j+2]-ribbonData[i+2])<.06,'A filament segment crosses a gap');}}
console.log('Filaments: finite surface ribbons, bounded segments, cool/warm palette and feathering passed.');
