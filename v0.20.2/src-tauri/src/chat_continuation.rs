use super::{NexusMessage,ProjectStore,PROJECTS_LOCK,load_project_store,save_project_store};
// `regenerate`: produce a new answer for the same request; the previous answer is kept as a variant.
pub struct Continuation{pub id:String,pub prefix:String,pub request:String,pub attachments:Vec<super::attachments::Attachment>,pub regenerate:bool}
pub fn prepare(db:&ProjectStore,chat:&str,id:&str)->Result<Continuation,String>{
 let index=db.messages.iter().position(|m|m.id==id&&m.chat_id==chat&&m.role=="assistant"&&m.stopped).ok_or("Остановленный ответ не найден в этом чате")?;
 let message=&db.messages[index];
 let user=db.messages[..index].iter().rev().find(|m|m.chat_id==chat&&m.role=="user").ok_or("Исходный запрос не найден")?;
 let prefix=if message.content=="Генерация остановлена."{String::new()}else{message.content.clone()};
 Ok(Continuation{id:message.id.clone(),prefix,request:user.content.clone(),attachments:user.attachments.clone(),regenerate:false})
}
pub fn prepare_regenerate(db:&ProjectStore,chat:&str,id:&str)->Result<Continuation,String>{
 let (index,message)=super::chat_variants::regenerate_target(db,chat,id)?;
 let user=db.messages[..index].iter().rev().find(|m|m.chat_id==chat&&m.role=="user").ok_or("Исходный запрос не найден")?;
 Ok(Continuation{id:message.id.clone(),prefix:String::new(),request:user.content.clone(),attachments:user.attachments.clone(),regenerate:true})
}
pub fn merge(prefix:&str,suffix:&str)->String{
 if prefix.is_empty(){return suffix.into()}
 if suffix.is_empty(){return prefix.into()}
 if suffix.starts_with(prefix){return suffix.into()}
 if prefix.starts_with(suffix)&&suffix.chars().count()>=24{return prefix.into()}
 // Find the longest suffix/prefix overlap in linear time, including Unicode.
 let pattern=suffix.chars().take(16000).collect::<Vec<_>>();
 let mut failure=vec![0;pattern.len()];let mut matched=0;
 for i in 1..pattern.len(){while matched>0&&pattern[i]!=pattern[matched]{matched=failure[matched-1]}if pattern[i]==pattern[matched]{matched+=1}failure[i]=matched;}
 matched=0;let tail=prefix.chars().rev().take(16000).collect::<Vec<_>>();
 for ch in tail.iter().rev(){while matched>0&&(matched==pattern.len()||pattern[matched]!=*ch){matched=failure[matched-1]}if matched<pattern.len()&&pattern[matched]==*ch{matched+=1}}
 let overlap=if matched>=24{matched}else{0};
 format!("{}{}",prefix,suffix.chars().skip(overlap).collect::<String>())
}
pub fn save(chat:&str,target:&Continuation,suffix:&str,details:String,stopped:bool)->Result<NexusMessage,String>{
 let _guard=PROJECTS_LOCK.lock().map_err(|_|"Project storage lock failed")?;let mut db=load_project_store()?;
 let message=db.messages.iter_mut().find(|m|m.id==target.id&&m.chat_id==chat&&m.role=="assistant").ok_or("Ответ был удалён")?;
 if target.regenerate{
  let content=if suffix.trim().is_empty(){"Генерация остановлена.".to_string()}else{suffix.to_string()};
  if content.len()>200000{return Err("Ответ превышает размер сообщения".into())}
  super::chat_variants::push_regenerated(message,content,details,stopped,super::now_string());
 }else{update(message,target,suffix,details,stopped)?;}
 let updated=message.clone();if let Some(c)=db.chats.iter_mut().find(|c|c.id==chat){c.unread=true;}save_project_store(&db)?;Ok(updated)
}
fn update(message:&mut NexusMessage,target:&Continuation,suffix:&str,details:String,stopped:bool)->Result<(),String>{
 if !message.stopped||message.content!=if target.prefix.is_empty(){"Генерация остановлена."}else{&target.prefix}{return Err("Ответ изменился: откройте чат заново".into())}
 let joined=merge(&target.prefix,suffix);if joined.len()>200000{return Err("Продолжение превышает размер сообщения".into())}
 message.content=if joined.trim().is_empty(){"Генерация остановлена.".into()}else{joined};message.details=Some(details);message.stopped=stopped;
 Ok(())
}

pub fn effort(mode:&str,weight:u32)->Result<&'static str,String>{match mode{"fast"=>Ok("low"),"normal"=>Ok("medium"),"deep"=>Ok("high"),"auto"=>Ok(if weight>=3{"high"}else if weight==2{"medium"}else{"low"}),_=>Err("Неизвестный режим рассуждений".into())}}
#[cfg(test)]mod tests{
 use super::*;
 #[test]fn merges_unicode_and_replayed_prefix(){
  assert_eq!(merge("Начало. ","Продолжение."),"Начало. Продолжение.");
  assert_eq!(merge("интерфе","йса"),"интерфейса");
  assert_eq!(merge("Начало. ","Начало. Продолжение."),"Начало. Продолжение.");
  assert_eq!(merge("", "Ответ"),"Ответ");assert_eq!(merge("Ответ", ""),"Ответ");
 }
 #[test]fn effort_modes_and_validation(){assert_eq!(effort("deep",1).unwrap(),"high");assert_eq!(effort("auto",3).unwrap(),"high");assert_eq!(effort("fast",3).unwrap(),"low");assert!(effort("invalid",1).is_err());}
 #[test]fn continuation_is_chat_scoped_and_requires_stopped(){
  let mut db:ProjectStore=serde_json::from_value(serde_json::json!({"projects":[],"chats":[],"messages":[{"id":"u","chatId":"c","role":"user","content":"Task","createdAt":"t"},{"id":"a","chatId":"c","role":"assistant","content":"Prefix","stopped":true,"createdAt":"t"}]})).unwrap();
  assert_eq!(prepare(&db,"c","a").unwrap().request,"Task");assert!(prepare(&db,"other","a").is_err());db.messages[1].stopped=false;assert!(prepare(&db,"c","a").is_err());
 }
 #[test]fn regenerate_uses_the_preceding_request(){
  let db:ProjectStore=serde_json::from_value(serde_json::json!({"projects":[],"chats":[],"messages":[{"id":"u","chatId":"c","role":"user","content":"Task","createdAt":"t"},{"id":"a","chatId":"c","role":"assistant","content":"Answer","createdAt":"t"}]})).unwrap();
  let r=prepare_regenerate(&db,"c","a").unwrap();assert!(r.regenerate);assert_eq!(r.request,"Task");assert!(r.prefix.is_empty());assert!(!prepare(&db,"c","a").is_ok(),"a finished answer is not a continuation target");
 }
 #[test]fn repeated_stop_then_complete_keeps_one_prefix(){
  let mut db:ProjectStore=serde_json::from_value(serde_json::json!({"projects":[],"chats":[],"messages":[{"id":"u","chatId":"c","role":"user","content":"Task","createdAt":"t"},{"id":"a","chatId":"c","role":"assistant","content":"Начало. ","stopped":true,"createdAt":"t"}]})).unwrap();
  let first=prepare(&db,"c","a").unwrap();update(&mut db.messages[1],&first,"Середина. ","stopped".into(),true).unwrap();
  assert_eq!(db.messages[1].content,"Начало. Середина. ");assert!(db.messages[1].stopped);
  assert!(update(&mut db.messages[1],&first,"stale","".into(),false).is_err());
  let second=prepare(&db,"c","a").unwrap();update(&mut db.messages[1],&second,"Конец.","done".into(),false).unwrap();
  assert_eq!(db.messages[1].content,"Начало. Середина. Конец.");assert!(!db.messages[1].stopped);assert_eq!(db.messages.len(),2);
 }

}
