//! Bounded, user-approved checks. Test output is evidence, never instructions.
use super::*;
use serde_json::{json,Value};
#[derive(Clone,Serialize)]#[serde(rename_all="camelCase")]
pub struct Check{pub program:String,pub args:Vec<String>,pub label:String}
#[derive(Clone,Serialize)]#[serde(rename_all="camelCase")]
pub struct ResultRow{pub label:String,pub status:String,pub output:String}
#[derive(Default,Serialize)]pub struct Report{pub checks:Vec<ResultRow>}
impl Report{
 pub fn passed(&self)->bool{!self.checks.is_empty()&&self.checks.iter().all(|c|c.status=="passed")}
 pub fn failed(&self)->bool{self.checks.iter().any(|c|c.status=="failed")}
 pub fn summary(&self)->String{if self.checks.is_empty(){"В проекте не найдены поддерживаемые команды проверки. Требуется проверка результата.".into()}else{self.checks.iter().map(|r|format!("{}: {}",r.label,r.status)).collect::<Vec<_>>().join("; ")}}
 pub fn feedback(&self)->String{self.checks.iter().map(|r|format!("{} [{}]\n{}",r.label,r.status,r.output)).collect::<Vec<_>>().join("\n\n").chars().take(14000).collect()}
}
fn scripts(value:&Value)->Vec<Check>{
 ["lint","typecheck","check","test","test:visual"].iter().filter(|key|value["scripts"][**key].as_str().is_some()).map(|key|Check{program:"npm".into(),args:vec!["run".into(),key.to_string()],label:format!("npm run {key}")}).collect()
}
pub fn discover(workspace:&str)->Vec<Check>{
 let root=PathBuf::from(workspace);let mut checks=std::fs::read(root.join("package.json")).ok().filter(|s|s.len()<100000).and_then(|s|serde_json::from_slice::<Value>(&s).ok()).map(|v|scripts(&v)).unwrap_or_default();
 for manifest in ["Cargo.toml","src-tauri/Cargo.toml"]{if root.join(manifest).is_file(){checks.push(Check{program:"cargo".into(),args:vec!["test".into(),"--offline".into(),"--manifest-path".into(),manifest.into(),"--lib".into()],label:format!("cargo test --offline --manifest-path {manifest} --lib")});}}
 checks
}
async fn execute(check:&Check,workspace:&str,control:&chat_runs::Control)->Result<ResultRow,String>{
 let exe=find_bin(&check.program).ok_or_else(||format!("{} не найден",check.program))?;
 let mut cmd=Command::new(exe);cmd.args(&check.args).current_dir(workspace).stdin(std::process::Stdio::null()).stdout(std::process::Stdio::piped()).stderr(std::process::Stdio::piped()).kill_on_drop(true);
 if let Some(node)=node_bin(){cmd.env("PATH",format!("{}:{}:{}",node.display(),app_bin().display(),std::env::var("PATH").unwrap_or_default()));}
 // A project test script can execute arbitrary project code. Approval precedes this spawn.
 cmd.process_group(0);
 let mut child=cmd.spawn().map_err(|_|"Не удалось запустить проверку")?;
 let group=process_group::Group::new(&child);
 let stdout=child.stdout.take().unwrap();let stderr=child.stderr.take().unwrap();
 async fn drain(mut r:impl tokio::io::AsyncRead+Unpin)->String{let mut bytes=Vec::new();let mut buf=[0u8;4096];while let Ok(n)=r.read(&mut buf).await{if n==0{break}let keep=n.min(16000usize.saturating_sub(bytes.len()));bytes.extend_from_slice(&buf[..keep]);}String::from_utf8_lossy(&bytes).into_owned()}
 let out=tokio::spawn(drain(stdout));let err=tokio::spawn(drain(stderr));
 let status=tokio::select!{biased;_=control.cancelled()=>{let _=child.kill().await;let _=child.wait().await;None},v=tokio::time::timeout(Duration::from_secs(180),child.wait())=>Some(v)};
 let _=child.kill().await;let _=child.wait().await;
 async fn finish(mut task:tokio::task::JoinHandle<String>)->String{match tokio::time::timeout(Duration::from_secs(1),&mut task).await{Ok(v)=>v.unwrap_or_default(),Err(_)=>{task.abort();String::new()}}}
 drop(group);
 let output=format!("{}\n{}",finish(out).await,finish(err).await);
 match status{None=>Err(chat_runs::STOPPED.into()),Some(Ok(Ok(status)))=>Ok(ResultRow{label:check.label.clone(),status:if status.success(){"passed"}else{"failed"}.into(),output:format!("Exit: {}\n{}",status,output)}),_=>Ok(ResultRow{label:check.label.clone(),status:"failed".into(),output:format!("Проверка не завершилась за 180 секунд.\n{output}")})}
}
pub async fn run(workspace:&str,app:&tauri::AppHandle,chat:&str,control:&chat_runs::Control)->Result<Report,String>{
 let mut report=Report::default();
 for check in discover(workspace){
  if control.stopped(){return Err(chat_runs::STOPPED.into())}
  let _=app.emit("chat-progress",json!({"chatId":chat,"stage":format!("Проверка: {}",check.label)}));
  let allow=tokio::select!{biased;_=control.cancelled()=>return Err(chat_runs::STOPPED.into()),v=chat_permissions::ask(app,chat,"Nexus","verification",json!({"command":check.label,"cwd":workspace,"reason":"Проверка результата после работы агента. Команда запускает код проекта и может создавать файлы. Разрешение однократное."}))=>v?};
  if !allow{report.checks.push(ResultRow{label:check.label,status:"declined".into(),output:"Пользователь отклонил запуск".into()});continue}
  control.mark_permission();
  let row=match execute(&check,workspace,control).await{Ok(row)=>row,Err(e) if e==chat_runs::STOPPED=>return Err(e),Err(e)=>ResultRow{label:check.label,status:"failed".into(),output:e}};
  report.checks.push(row);
 }
 Ok(report)
}
#[cfg(test)]mod tests{use super::*;
 #[test]fn only_supported_scripts_and_real_evidence(){let cmds=scripts(&json!({"scripts":{"test":"node tests.js","test:visual":"playwright test","postinstall":"danger","custom":"arbitrary"}}));assert_eq!(cmds.len(),2);assert_eq!(cmds[0].args,vec!["run","test"]);let mut report=Report::default();assert!(!report.passed());report.checks.push(ResultRow{label:"test".into(),status:"declined".into(),output:"".into()});assert!(!report.passed());assert!(!report.failed());report.checks[0].status="failed".into();assert!(report.failed());report.checks[0].status="passed".into();assert!(report.passed());}
}
