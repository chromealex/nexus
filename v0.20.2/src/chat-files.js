export function previewKind(file){
 const ext=file.name?.split('.').pop()?.toLowerCase();
 if(file.mime?.startsWith('image/')||['png','jpg','jpeg','gif','webp','svg','bmp'].includes(ext))return 'image';
 if(file.mime==='application/pdf'||ext==='pdf')return 'pdf';
 if(file.mime?.startsWith('audio/')||['mp3','wav','m4a','ogg'].includes(ext))return 'audio';
 if(file.mime?.startsWith('video/')||['mp4','webm','mov'].includes(ext))return 'video';
 if(file.mime?.startsWith('text/')||['txt','md','csv','tsv','json','js','jsx','ts','tsx','py','rs','css','html','xml','yaml','yml','log','sql','sh','c','cpp','h'].includes(ext))return 'text';
 return 'file';
}
export function normalizeQuestions(value){
 const rows=Array.isArray(value)?value:[value];
 return rows.slice(0,6).map((q,i)=>({id:String(q.id||i),question:String(q.question||'').slice(0,1500),options:(Array.isArray(q.options)?q.options:[]).slice(0,8).map(o=>typeof o==='string'?{label:o,description:''}:{label:String(o.label||''),description:String(o.description||'')}).filter(o=>o.label),multiple:q.multiple===true||q.multiSelect===true,isSecret:!!q.isSecret})).filter(q=>q.question);
}

export function restoreQuestionSelection(questions,saved){
 const answers={},custom={},own={};
 for(const q of normalizeQuestions(questions)){
  const values=Array.isArray(saved?.[q.id]?.answers)?saved[q.id].answers.filter(v=>typeof v==='string'):[];
  const labels=new Set(q.options.map(o=>o.label));
  answers[q.id]=values.filter(v=>labels.has(v));
  const other=values.filter(v=>!labels.has(v));
  if(other.length){custom[q.id]=other.join('\n');own[q.id]=true;}
 }
 return {answers,custom,own};
}
export function legacyQuestionSelection(questions,reply){
 if(typeof reply!=='string')return null;
 const saved={};
 for(const q of normalizeQuestions(questions)){
  const prefix=q.question+': ';
  const line=reply.split('\n').find(line=>line.startsWith(prefix));if(!line)return null;
  const text=line.slice(prefix.length);if(!text.trim())return null;
  const exact=q.options.find(o=>o.label===text);
  const pieces=q.multiple?text.split(', '):[text];
  saved[q.id]={answers:exact?[text]:pieces.every(p=>q.options.some(o=>o.label===p))?pieces:[text]};
 }
 return Object.keys(saved).length?saved:null;
}
