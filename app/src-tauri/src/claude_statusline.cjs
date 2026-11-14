// NEXUS status line adapter: accepts stdin from Claude Code, stores ONLY rate-limit fields.
// Never writes the raw payload (which may include sensitive project context).
const fs=require('fs');
const path=require('path');
const [,,profileId,outputDir]=process.argv;
if(!/^claude-[a-zA-Z0-9_-]+$/.test(profileId||'')||!outputDir)process.exit(1);
let input='';process.stdin.setEncoding('utf8');
process.stdin.on('data',chunk=>{input+=chunk;if(input.length>1024*1024)process.exit(1)});
function percent(v){const n=typeof v==='number'?v:Number(v);return Number.isFinite(n)&&n>=0&&n<=100?n:null}
function windowData(v){if(!v||typeof v!=='object')return null;
 let used=percent(v.used_percentage??v.used_percent??v.usedPercent??v.utilization??v.utilisation);
 // Some providers report utilization 0..1; do not guess units. Keep as 0..100.
 let reset=v.resets_at??v.resetsAt??v.reset_at??null;
 if(typeof reset!=='string'&&typeof reset!=='number')reset=null;
 return used===null?null:{usedPercent:used,resetAt:reset};
}
process.stdin.on('end',()=>{try{
 const v=JSON.parse(input);
 const limits=v.rate_limits??v.rateLimits??v.context_window?.rate_limits??null;
 if(!limits)return;
 const five=windowData(limits.five_hour??limits.fiveHour);
 const weekly=windowData(limits.seven_day??limits.sevenDay);
 if(!five&&!weekly)return;
 fs.mkdirSync(outputDir,{recursive:true,mode:0o700});
 const file=path.join(outputDir,profileId+'.json');
 const data={fiveHour:five,sevenDay:weekly,receivedAt:new Date().toISOString(),source:'Claude Code statusLine'};
 const tmp=file+'.tmp.'+process.pid;
 fs.writeFileSync(tmp,JSON.stringify(data),{mode:0o600});fs.renameSync(tmp,file);
}catch(e){/* Status line must never interfere with Claude Code */}});
