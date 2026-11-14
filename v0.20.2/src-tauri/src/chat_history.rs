use super::*;
#[derive(Serialize)]#[serde(rename_all="camelCase")]
pub struct Page{messages:Vec<NexusMessage>,has_more:bool,before_id:Option<String>}
fn page(db:&ProjectStore,chat:&str,before:Option<&str>,limit:usize)->Result<Page,String>{
 if !db.chats.iter().any(|c|c.id==chat){return Err("Чат не найден".into())}
 let rows=db.messages.iter().filter(|m|m.chat_id==chat).collect::<Vec<_>>();
 let end=if let Some(id)=before{rows.iter().position(|m|m.id==id).ok_or("Сообщение-курсор не найдено в этом чате")?}else{rows.len()};let start=end.saturating_sub(limit.clamp(1,60));
 let messages=rows[start..end].iter().map(|m|(*m).clone()).collect::<Vec<_>>();
 Ok(Page{before_id:messages.first().map(|m|m.id.clone()),messages,has_more:start>0})
}
#[tauri::command]pub fn chat_message_page(chat_id:String,before_id:Option<String>,limit:Option<usize>)->Result<Page,String>{page(&load_project_store()?,&chat_id,before_id.as_deref(),limit.unwrap_or(40))}
#[cfg(test)]mod tests{use super::*;
 #[test]fn stable_chat_scoped_pagination_with_new_tail(){let mut db:ProjectStore=serde_json::from_value(serde_json::json!({"projects":[],"chats":[{"id":"c","projectId":"p","title":"Chat","createdAt":""},{"id":"other","projectId":"p","title":"Other","createdAt":""}],"messages":[]})).unwrap();
  for i in 0..105{db.messages.push(serde_json::from_value(serde_json::json!({"id":format!("m{i}"),"chatId":"c","role":"user","content":format!("{i}"),"createdAt":""})).unwrap());}
  let last=page(&db,"c",None,40).unwrap();assert_eq!(last.messages.len(),40);assert_eq!(last.before_id.as_deref(),Some("m65"));assert!(last.has_more);
  let older=page(&db,"c",last.before_id.as_deref(),40).unwrap();assert_eq!(older.messages[0].id,"m25");assert_eq!(older.messages.last().unwrap().id,"m64");
  let first=page(&db,"c",older.before_id.as_deref(),40).unwrap();assert_eq!(first.messages.len(),25);assert!(!first.has_more);assert!(page(&db,"other",Some("m65"),40).is_err());assert_eq!(page(&db,"c",None,999).unwrap().messages.len(),60);
 }
}
