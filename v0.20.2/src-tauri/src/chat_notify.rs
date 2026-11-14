// "Answer ready" signal while NEXUS is in the background: a macOS notification through
// osascript (arguments passed as argv, never interpolated into the script) and a Dock bounce.
// No extra Tauri plugin is required. The notification is attributed by macOS to Script Editor.
use tauri::Manager;

fn clean(value:&str,limit:usize)->String{value.chars().map(|c|if c.is_control(){' '}else{c}).take(limit).collect::<String>().trim().to_string()}

#[tauri::command]
pub fn notify_answer_ready(app:tauri::AppHandle,title:String,body:String)->Result<(),String>{
 let title=clean(&title,80);let body=clean(&body,180);
 #[cfg(target_os="macos")]
 std::thread::spawn(move||{let _=std::process::Command::new("osascript").args(["-e","on run argv","-e","display notification (item 2 of argv) with title (item 1 of argv)","-e","end run",&title,&body]).status();});
 if let Some(window)=app.webview_windows().values().next(){let _=window.request_user_attention(Some(tauri::UserAttentionType::Informational));}
 Ok(())
}
