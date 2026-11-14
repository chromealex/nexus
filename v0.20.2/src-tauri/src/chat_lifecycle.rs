use super::*;
fn branch(db:&ProjectStore,id:&str)->Result<std::collections::HashSet<String>,String>{
 let chat=db.chats.iter().find(|c|c.id==id).ok_or("Чат не найден")?;
 let mut ids=std::collections::HashSet::from([id.to_string()]);
 for _ in 0..17{let next=db.chats.iter().filter(|c|c.project_id==chat.project_id&&c.parent_chat_id.as_ref().is_some_and(|p|ids.contains(p))).map(|c|c.id.clone()).collect::<Vec<_>>();let before=ids.len();ids.extend(next);if ids.len()==before{return Ok(ids)}}
 Err("Слишком глубокое дерево чатов".into())
}
fn update(db:&mut ProjectStore,id:&str,action:&str)->Result<(),String>{
 if !["archive","trash","restore"].contains(&action){return Err("Неизвестное действие с чатом".into())}
 let mut ids=branch(db,id)?;
 if action=="restore"{let mut current=id.to_string();let project=db.chats.iter().find(|c|c.id==id).unwrap().project_id.clone();let mut seen=std::collections::HashSet::new();for _ in 0..17{if !seen.insert(current.clone()){return Err("Цикл в родительских чатах".into())}let c=db.chats.iter().find(|c|c.id==current&&c.project_id==project).ok_or("Родительский чат не найден")?;if let Some(parent)=&c.parent_chat_id{ids.insert(parent.clone());current=parent.clone()}else{break}}}
 if ids.iter().any(|id|chat_runs::is_running(id)){return Err("Сначала остановите выполнение в этом чате или его подчатах".into())}
 for c in db.chats.iter_mut().filter(|c|ids.contains(&c.id)){match action{"archive"=>{if c.deleted_at.is_none(){c.archived=true}},"trash"=>{c.deleted_at=Some(now_string())},"restore"=>{c.archived=false;c.deleted_at=None},_=>{}}}Ok(())
}
#[tauri::command]pub fn change_chat_state(chat_id:String,action:String)->Result<(),String>{let _guard=PROJECTS_LOCK.lock().map_err(|_|"Project store lock failed")?;let mut db=load_project_store()?;update(&mut db,&chat_id,&action)?;save_project_store(&db)}
#[tauri::command]pub fn list_saved_chats(kind:String)->Result<Vec<NexusChat>,String>{let db=load_project_store()?;match kind.as_str(){"archive"=>Ok(db.chats.into_iter().filter(|c|c.archived&&c.deleted_at.is_none()).collect()),"trash"=>Ok(db.chats.into_iter().filter(|c|c.deleted_at.is_some()).collect()),_=>Err("Неизвестная папка чатов".into())}}
#[cfg(test)]mod tests{use super::*;
 #[test]fn subtree_archive_and_trash_preserve_messages_and_restore_ancestors(){
  let mut db:ProjectStore=serde_json::from_value(serde_json::json!({"projects":[],"chats":[{"id":"p","projectId":"x","title":"P","createdAt":""},{"id":"c","projectId":"x","title":"C","createdAt":"","parentChatId":"p"},{"id":"other","projectId":"y","title":"Other","createdAt":""}],"messages":[{"id":"m","chatId":"c","role":"user","content":"keep","createdAt":""}]})).unwrap();
  update(&mut db,"p","archive").unwrap();assert!(db.chats[0].archived&&db.chats[1].archived);assert!(!db.chats[2].archived);
  update(&mut db,"p","trash").unwrap();assert!(db.chats[0].deleted_at.is_some()&&db.chats[1].deleted_at.is_some());assert_eq!(db.messages[0].content,"keep");
  update(&mut db,"c","restore").unwrap();assert!(!db.chats[0].archived&&!db.chats[1].archived);assert!(db.chats.iter().all(|c|c.deleted_at.is_none()));
  let round:ProjectStore=serde_json::from_slice(&serde_json::to_vec(&db).unwrap()).unwrap();assert_eq!(round.messages.len(),1);assert!(update(&mut db,"missing","trash").is_err());
 }
}
