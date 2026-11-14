use super::*;
use serde_json::{Value,json};
use tokio::io::AsyncWriteExt;
async fn write(input:&mut tokio::process::ChildStdin,value:Value)->Result<(),String>{input.write_all(format!("{value}\n").as_bytes()).await.map_err(|e|e.to_string())}
pub async fn run(agent:&custom_agents::CustomAgent,prompt:&str,workspace:&str,app:&tauri::AppHandle,chat:&str,images:&[String],control:&chat_runs::Control)->Result<(String,String),String>{
 let mut child=custom_agents::command(agent,workspace).stdin(std::process::Stdio::piped()).stdout(std::process::Stdio::piped()).stderr(std::process::Stdio::null()).spawn().map_err(|e|e.to_string())?;
 let _group=process_group::Group::new(&child);
 let mut input=child.stdin.take().ok_or("Missing ACP input")?;let mut lines=BufReader::new(child.stdout.take().ok_or("Missing ACP output")?).lines();
 control.set_model(&agent.manifest.name);control.metadata(&format!("Route: {}\nModel: {}\nEffort: provider-default",agent.manifest.name,agent.manifest.name));
 let operation=async{
  let mut supports_images=false;
  let mut answer=String::new();let mut log=String::new();let mut session=String::new();
  write(&mut input,json!({"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":1,"clientCapabilities":{},"clientInfo":{"name":"nexus","version":"0.20.2"}}})).await?;
  while let Some(line)=lines.next_line().await.map_err(|e|e.to_string())?{
   if line.len()>1_000_000{return Err("Слишком большой пакет ACP".into())}
   let Ok(v)=serde_json::from_str::<Value>(&line)else{continue};
   if log.len()<20000{log.push_str(&format!("ACP: {}",v["method"].as_str().unwrap_or("response")));log.push('\n');control.diagnostics(&log);}
   if v.get("method").is_none(){
    if v.get("error").is_some(){return Err("Агент отклонил запрос. Проверьте авторизацию и параметры ACP-адаптера.".into())}
    if v["id"]==1{
     supports_images=v["result"]["agentCapabilities"]["promptCapabilities"]["image"]==true;
     if v["result"]["protocolVersion"]!=1{return Err("Несовместимая версия ACP".into())}
     if let Some(method)=&agent.manifest.auth_method{write(&mut input,json!({"jsonrpc":"2.0","id":2,"method":"authenticate","params":{"methodId":method}})).await?;}
     else{write(&mut input,json!({"jsonrpc":"2.0","id":3,"method":"session/new","params":{"cwd":workspace,"mcpServers":[]}})).await?;}
    }else if v["id"]==2{write(&mut input,json!({"jsonrpc":"2.0","id":3,"method":"session/new","params":{"cwd":workspace,"mcpServers":[]}})).await?;}
    else if v["id"]==3{
     session=v["result"]["sessionId"].as_str().ok_or("ACP не вернул сессию")?.into();
     let mut blocks=vec![json!({"type":"text","text":prompt})];let mut total=0;
     if !images.is_empty()&&!supports_images{return Err("Этот ACP-агент не объявил поддержку изображений. Выберите другого агента.".into())}
     for path in images{let data=std::fs::read(path).map_err(|_|"Не удалось прочитать изображение")?;total+=data.len();if total>20_000_000{return Err("Для ACP допускается до 20 МБ изображений в запросе".into())}use base64::Engine;let ext=std::path::Path::new(path).extension().and_then(|s|s.to_str()).unwrap_or("");let mime=match ext{"png"=>"image/png","webp"=>"image/webp","gif"=>"image/gif",_=>"image/jpeg"};blocks.push(json!({"type":"image","mimeType":mime,"data":base64::engine::general_purpose::STANDARD.encode(data)}));}
     write(&mut input,json!({"jsonrpc":"2.0","id":4,"method":"session/prompt","params":{"sessionId":session,"prompt":blocks}})).await?;
    }else if v["id"]==4{
     if answer.trim().is_empty(){return Err("Агент не вернул текст ответа".into())}
     return Ok((answer,log));
    }
   }else if v["method"]=="session/update"&&v["params"]["sessionId"]==session{
    let u=&v["params"]["update"];
    if u["sessionUpdate"]=="agent_message_chunk"&&u["content"]["type"]=="text"{
     if let Some(text)=u["content"]["text"].as_str(){answer.push_str(text);if answer.len()>190000{return Err("Ответ агента слишком большой".into())}control.update(&answer);let _=app.emit("chat-text",json!({"chatId":chat,"text":control.text()}));}
    }else if u["sessionUpdate"]=="tool_call"{let _=app.emit("chat-progress",json!({"chatId":chat,"stage":u["title"]}));}
   }else if v["method"]=="session/request_permission"{
    let params=&v["params"];let allow=chat_permissions::ask(app,chat,&agent.manifest.name,"tool",params.clone()).await?;
    let option=params["options"].as_array().and_then(|options|options.iter().find(|o|o["kind"]==if allow{"allow_once"}else{"reject_once"})).and_then(|o|o["optionId"].as_str());
    let outcome=if let Some(option)=option{if allow{control.mark_permission();}json!({"outcome":"selected","optionId":option})}else{json!({"outcome":"cancelled"})};
    write(&mut input,json!({"jsonrpc":"2.0","id":v["id"],"result":{"outcome":outcome}})).await?;
   }else if v.get("id").is_some(){write(&mut input,json!({"jsonrpc":"2.0","id":v["id"],"error":{"code":-32601,"message":"Client capability is not available"}})).await?;}
  }Err("Соединение с агентом завершилось до ответа".into())
 };
 let result=tokio::select!{biased;_=control.cancelled()=>Err(chat_runs::STOPPED.into()),v=tokio::time::timeout(Duration::from_secs(600),operation)=>v.unwrap_or_else(|_|Err("Время ответа агента истекло".into()))};
 let _=child.kill().await;let _=child.wait().await;result
}
