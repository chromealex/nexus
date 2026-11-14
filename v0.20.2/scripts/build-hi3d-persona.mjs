// Convert the user-supplied, untextured GLB into deterministic surface particles.
// No third-party executable code or network resources are read from the asset.
import fs from 'node:fs';
import crypto from 'node:crypto';
const source=process.argv[2]||'../Hi3D_Untitled_allparts_20261111_184233.glb';
const file=fs.readFileSync(source);
if(file.toString('ascii',0,4)!=='glTF'||file.readUInt32LE(4)!==2||file.readUInt32LE(8)!==file.length)throw Error('Invalid GLB');
let doc,bin;
for(let at=12;at<file.length;){const len=file.readUInt32LE(at),type=file.readUInt32LE(at+4);if(at+8+len>file.length)throw Error('Truncated GLB');const chunk=file.subarray(at+8,at+8+len);if(type===0x4e4f534a)doc=JSON.parse(chunk);if(type===0x004e4942)bin=chunk;at+=8+len;}
if(!doc||!bin||doc.meshes.length!==1||doc.nodes.length!==1||doc.nodes[0].matrix||doc.nodes[0].rotation||doc.nodes[0].translation||doc.nodes[0].scale)throw Error('Expected single untransformed mesh');
const primitive=doc.meshes[0].primitives[0];
if(primitive.mode!==4||doc.meshes[0].primitives.length!==1)throw Error('Expected triangles');
function accessor(id,type,components){const a=doc.accessors[id],v=doc.bufferViews[a.bufferView];if(a.componentType!==type||a.sparse||v.byteStride||v.buffer!==0)throw Error('Unsupported accessor');const start=(v.byteOffset||0)+(a.byteOffset||0),len=a.count*components*4;if(start+len>bin.length)throw Error('Invalid accessor range');const copy=Uint8Array.from(bin.subarray(start,start+len));return type===5126?new Float32Array(copy.buffer):new Uint32Array(copy.buffer);}
let vertices=accessor(primitive.attributes.POSITION,5126,3),indices=accessor(primitive.indices,5125,1);
// The supplied allparts file contains four disconnected heads. Keep the largest
// connected surface (the front-facing head), not a coordinate crop.
const sourceVertexCount=vertices.length/3,sourceTriangleCount=indices.length/3;
const parent=Uint32Array.from({length:sourceVertexCount},(_,i)=>i);
function root(a){while(parent[a]!==a){parent[a]=parent[parent[a]];a=parent[a];}return a;}
for(let i=0;i<indices.length;i+=3){if(indices[i]>=sourceVertexCount||indices[i+1]>=sourceVertexCount||indices[i+2]>=sourceVertexCount)throw Error('Invalid index');const a=root(indices[i]);parent[root(indices[i+1])]=a;parent[root(indices[i+2])]=a;}
const sizes=new Map();for(let i=0;i<sourceVertexCount;i++){const r=root(i);sizes.set(r,(sizes.get(r)||0)+1);}
const selected=[...sizes].sort((a,b)=>b[1]-a[1])[0][0],remap=new Map(),selectedVertices=[],selectedIndices=[];
for(let i=0;i<sourceVertexCount;i++)if(root(i)===selected){remap.set(i,selectedVertices.length/3);selectedVertices.push(vertices[i*3],vertices[i*3+1],vertices[i*3+2]);}
for(let i=0;i<indices.length;i+=3)if(root(indices[i])===selected)selectedIndices.push(remap.get(indices[i]),remap.get(indices[i+1]),remap.get(indices[i+2]));
vertices=new Float32Array(selectedVertices);indices=new Uint32Array(selectedIndices);
const count=vertices.length/3,triangles=indices.length/3,normals=new Float32Array(vertices.length),areas=new Float64Array(triangles);
let lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
for(let i=0;i<vertices.length;i++){if(!Number.isFinite(vertices[i]))throw Error('Nonfinite vertex');lo[i%3]=Math.min(lo[i%3],vertices[i]);hi[i%3]=Math.max(hi[i%3],vertices[i]);}
const scale=1.6/(hi[1]-lo[1]),center=lo.map((v,k)=>(v+hi[k])/2);
for(let i=0;i<vertices.length;i++)vertices[i]=(vertices[i]-center[i%3])*scale;
let total=0;
for(let t=0;t<triangles;t++){const ids=[indices[t*3],indices[t*3+1],indices[t*3+2]];if(ids.some(i=>i>=count))throw Error('Invalid index');const [a,b,c]=ids.map(i=>i*3);const ux=vertices[b]-vertices[a],uy=vertices[b+1]-vertices[a+1],uz=vertices[b+2]-vertices[a+2],vx=vertices[c]-vertices[a],vy=vertices[c+1]-vertices[a+1],vz=vertices[c+2]-vertices[a+2];const n=[uy*vz-uz*vy,uz*vx-ux*vz,ux*vy-uy*vx];total+=Math.hypot(...n)/2;areas[t]=total;for(const i of ids)for(let k=0;k<3;k++)normals[i*3+k]+=n[k];}
for(let i=0;i<normals.length;i+=3){const l=Math.hypot(normals[i],normals[i+1],normals[i+2])||1;for(let k=0;k<3;k++)normals[i+k]/=l;}
// Compare smoothed normals over a neighbourhood, not tiny triangle edges.
// This highlights panel joints and facial ridges rather than mesh tessellation.
const cells=new Map(),cellSize=.025;
const cellKey=i=>[0,1,2].map(k=>Math.floor(vertices[i*3+k]/cellSize)).join(',');
for(let i=0;i<count;i++){const key=cellKey(i);let cell=cells.get(key);if(!cell)cells.set(key,cell=[0,0,0]);for(let k=0;k<3;k++)cell[k]+=normals[i*3+k];}
const edges=new Float32Array(count);
for(let i=0;i<count;i++){const cell=cells.get(cellKey(i)),length=Math.hypot(...cell)||1;const dot=cell.reduce((sum,v,k)=>sum+v/length*normals[i*3+k],0);edges[i]=Math.min(1,Math.max(0,(1-dot)*2.5));}
// Bias sampling toward real changes in the surface normal.
total=0;
const geometricAreas=areas.slice();
for(let t=0;t<triangles;t++){const area=geometricAreas[t]-(t?geometricAreas[t-1]:0),edge=(edges[indices[t*3]]+edges[indices[t*3+1]]+edges[indices[t*3+2]])/3;total+=area*(.3+edge*2);areas[t]=total;}
let state=391;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
const surfaceCount=64000,floorCount=1200,out=new Float32Array((surfaceCount+floorCount)*18);
for(let i=0;i<surfaceCount;i++){const area=random()*total;let l=0,r=triangles-1;while(l<r){const m=(l+r)>>>1;if(areas[m]<area)l=m+1;else r=m;}const ids=[indices[l*3],indices[l*3+1],indices[l*3+2]],u=Math.sqrt(random()),v=random(),w=[1-u,u*(1-v),u*v],at=i*18;
 for(let k=0;k<3;k++){out[at+k]=ids.reduce((sum,id,j)=>sum+vertices[id*3+k]*w[j],0);out[at+15+k]=ids.reduce((sum,id,j)=>sum+normals[id*3+k]*w[j],0);}
 const nl=Math.hypot(...out.subarray(at+15,at+18))||1;for(let k=0;k<3;k++)out[at+15+k]/=nl;
 const edge=ids.reduce((sum,id,j)=>sum+edges[id]*w[j],0),spark=random(),accent=edge>.45&&spark>.86;
 const warm=accent&&spark>.97;
 out.set(warm?[1,.67,.30]:[.56,.83,.92],at+3);
 out[at+6]=random();out[at+7]=accent?1.6+random()*1.4:.45+random()*.65;
 out[at+9]=edge;out[at+10]=accent?1:0;

}
// The orthographic camera sees an untilted XZ plane edge-on. Give the floor
// a fixed presentation tilt, independent of the draggable head, and a soft rim.
for(let i=0;i<floorCount;i++){const at=(surfaceCount+i)*18,a=random()*Math.PI*2,r=Math.sqrt(random())*.52,z=Math.sin(a)*r*.46;out.set([Math.cos(a)*r,-.82+z*.42+random()*.012,z,.43,.70,.77,random(),.45+random()**4*1.4,1,0,0,0,0,0,0,0,1,0],at);}
fs.writeFileSync('public/persona/hi3d-head.points',Buffer.from(out.buffer));
const meta={source:source.split('/').pop(),sha256:crypto.createHash('sha256').update(file).digest('hex'),sourceVertexCount,sourceTriangleCount,selection:"largest connected component",vertices:count,triangles,surfaceCount,floorCount,pointCount:out.length/18,strideFloats:18,edgeFields:{curvature:9,accent:10},hasTextures:!!doc.textures?.length,hasRig:!!doc.skins?.length,hasAnimations:!!doc.animations?.length,hasMorphTargets:!!primitive.targets?.length,license:'User supplied; redistribution rights not independently verified',normalization:{center,scale},bounds:{min:lo,max:hi}};
fs.writeFileSync('public/persona/hi3d-head.json',JSON.stringify(meta,null,2)+'\n');console.log(meta);
