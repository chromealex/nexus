// Nexus browser gateway: a stdio MCP proxy in front of the pinned Playwright MCP server.
// Every tools/call is first sent to the running Nexus app over a private Unix socket; Nexus decides
// (and asks the user in the chat when needed) before the call reaches the browser. Agents never talk
// to Playwright directly, so the same confirmation rules apply to Claude, Codex, ACP agents and API models.
// Written by Nexus at runtime; no dependencies beyond Node.js.
import {spawn} from 'node:child_process';
import net from 'node:net';
import readline from 'node:readline';

const socketPath=process.env.NEXUS_GATEWAY_SOCKET, token=process.env.NEXUS_GATEWAY_TOKEN, cli=process.env.NEXUS_BROWSER_CLI;
let args=[];try{args=JSON.parse(process.env.NEXUS_BROWSER_ARGS||'[]')}catch{args=[]}
if(!socketPath||!token||!cli||!Array.isArray(args)){process.stderr.write('nexus browser gateway: missing configuration\n');process.exit(2)}
// Tools that run arbitrary code outside the page or install software are never exposed.
const blocked=name=>/run_code|install/.test(String(name||''));
const env={...process.env};for(const key of ['NEXUS_GATEWAY_SOCKET','NEXUS_GATEWAY_TOKEN','NEXUS_BROWSER_CLI','NEXUS_BROWSER_ARGS'])delete env[key];
const child=spawn(process.execPath,[cli,...args],{env,stdio:['pipe','pipe','ignore']});
const out=line=>process.stdout.write(line+'\n');
const listIds=new Set();

function ask(tool,input){
 return new Promise(resolve=>{
  let done=false,buffer='';
  const finish=value=>{if(done)return;done=true;clearTimeout(timer);socket.destroy();resolve(value)};
  const socket=net.createConnection(socketPath,()=>socket.write(JSON.stringify({token,tool,arguments:input??{}})+'\n'));
  const timer=setTimeout(()=>finish({allow:false,message:'Nexus не ответил на запрос разрешения.'}),615000);
  socket.setEncoding('utf8');
  socket.on('data',chunk=>{buffer+=chunk;if(buffer.length>65536)return finish({allow:false,message:'Некорректный ответ Nexus.'});const end=buffer.indexOf('\n');if(end<0)return;try{const v=JSON.parse(buffer.slice(0,end));finish({allow:v.allow===true,message:String(v.message||'')})}catch{finish({allow:false,message:'Некорректный ответ Nexus.'})}});
  socket.on('error',()=>finish({allow:false,message:'Nexus недоступен: действие в браузере не выполнено.'}));
  socket.on('close',()=>finish({allow:false,message:'Nexus закрыл запрос разрешения.'}));
 });
}

const denied=(id,message)=>out(JSON.stringify({jsonrpc:'2.0',id,result:{content:[{type:'text',text:message||'Пользователь отклонил действие в браузере.'}],isError:true}}));

readline.createInterface({input:process.stdin}).on('line',async line=>{
 let msg;try{msg=JSON.parse(line)}catch{return}
 if(msg&&msg.method==='tools/list'&&msg.id!==undefined)listIds.add(msg.id);
 if(msg&&msg.method==='tools/call'&&msg.id!==undefined){
  const name=String(msg.params?.name||'');
  if(blocked(name))return denied(msg.id,'Этот инструмент отключён в Nexus.');
  const answer=await ask(name,msg.params?.arguments);
  if(!answer.allow)return denied(msg.id,answer.message);
 }
 child.stdin.write(line+'\n');
}).on('close',()=>{child.stdin.end();setTimeout(()=>child.kill(),2000).unref()});

readline.createInterface({input:child.stdout}).on('line',line=>{
 let msg;try{msg=JSON.parse(line)}catch{return out(line)}
 if(msg&&listIds.has(msg.id)&&Array.isArray(msg.result?.tools)){listIds.delete(msg.id);msg.result.tools=msg.result.tools.filter(t=>!blocked(t?.name));return out(JSON.stringify(msg))}
 out(line);
});
child.on('exit',code=>process.exit(code??0));
child.on('error',()=>process.exit(1));
