use super::*;
#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;
async fn output(mut cmd: Command, cancel: &AtomicBool) -> Result<Vec<u8>, String> {
    cmd.kill_on_drop(true)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null());
    let child = cmd.spawn().map_err(|_| "Не удалось запустить установку")?;
    let cancelled = async {
        loop {
            if cancel.load(Ordering::SeqCst) {
                return;
            }
            tokio::time::sleep(Duration::from_millis(120)).await;
        }
    };
    let out = tokio::select! {_=cancelled=>return Err("Установка отменена".into()),v=tokio::time::timeout(Duration::from_secs(600),child.wait_with_output())=>v.map_err(|_|"Время установки истекло")?.map_err(|_|"Ошибка установщика")?};
    if !out.status.success() {
        return Err("Установка не завершена: проверьте сеть и доступность официального выпуска".into());
    }
    Ok(out.stdout)
}
pub async fn install(app: &tauri::AppHandle, id: &str, cancel: Arc<AtomicBool>) -> Result<(), String> {
    let root = home()
        .join("Library/Application Support/NEXUS/installers")
        .join(format!("{id}-{}", project_id()));
    std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    let result=async{
 let (url,filename,entry,digest)=if id=="goose"{
  let asset=if cfg!(target_arch="aarch64"){"goose-aarch64-apple-darwin.tar.bz2"}else{"goose-x86_64-apple-darwin.tar.bz2"};
  let mut cmd=crate::new_command(super::curl_path());cmd.args(["--fail","--silent","--show-error","--max-time","40","--proto","=https","https://api.github.com/repos/aaif-goose/goose/releases/latest"]);
  let release:serde_json::Value=serde_json::from_slice(&output(cmd,&cancel).await?).map_err(|_|"Официальный сервер не вернул список выпусков")?;
  let asset=release["assets"].as_array().and_then(|a|a.iter().find(|v|v["name"]==asset)).ok_or("В выпуске нет сборки Goose для этого Mac")?;
  let url=asset["browser_download_url"].as_str().ok_or("Нет ссылки на выпуск")?;
  if !url.starts_with("https://github.com/aaif-goose/goose/releases/download/"){return Err("Неподдерживаемый источник Goose".into())}
  let digest=asset["digest"].as_str().and_then(|s|s.strip_prefix("sha256:")).filter(|s|s.len()==64&&s.chars().all(|c|c.is_ascii_hexdigit())).ok_or("GitHub не предоставил SHA-256 выпуска. Установка остановлена.")?;
  (url.to_string(),"goose.tar.bz2","goose",Some(digest.to_string()))
 }else if id=="antigravity"{
  let arch=if cfg!(target_arch="aarch64"){"arm64"}else{"x86_64"};
  (format!("https://dl.google.com/agy-extensions/releases/macos/agy-acp-server-1.4.5-darwin-{arch}.zip"),"antigravity.zip","agy_acp_server.par",Some(if cfg!(target_arch="aarch64"){"886fff7767d08994ca39eb02c3d01a7532c7325a94aa33aaf52d52068733284f"}else{"b39f3573c03b9acb9df028853f647527f1f3133f32bd77e78b796e48a205114a"}.to_string()))
 }else{return Err("Неизвестный установщик".into())};
 emit(app,id,"installing","Загрузка официального выпуска…",None);
 let archive=root.join(filename);let mut download=crate::new_command(super::curl_path());download.args(["--fail","--location","--silent","--show-error","--max-time","540","--max-filesize","536870912","--proto","=https","--proto-redir","=https","--output"]).arg(&archive).arg(&url);output(download,&cancel).await?;
 if let Some(digest)=digest{let mut hash=crate::new_command("/usr/bin/shasum");hash.args(["-a","256"]).arg(&archive);let actual=String::from_utf8(output(hash,&cancel).await?).map_err(|_|"Ошибка проверки SHA-256")?;if actual.split_whitespace().next()!=Some(&digest){return Err("SHA-256 выпуска не совпал".into())}}
 emit(app,id,"verifying","Проверка исполняемого файла…",None);
 let mut extract=if id=="goose"{let mut c=crate::new_command("/usr/bin/tar");c.arg("-xOf").arg(&archive).arg(entry);c}else{let mut c=crate::new_command("/usr/bin/unzip");c.arg("-p").arg(&archive).arg(entry);c};
 extract.current_dir(&root);let binary=output(extract,&cancel).await?;if binary.is_empty()||binary.len()>536870912{return Err("Повреждённый выпуск".into())}
 let candidate=root.join(entry);std::fs::write(&candidate,binary).map_err(|e|e.to_string())?;#[cfg(unix)]std::fs::set_permissions(&candidate,std::fs::Permissions::from_mode(0o755)).map_err(|e|e.to_string())?;
 if id=="antigravity"{let mut signature=crate::new_command("/usr/bin/codesign");signature.args(["--verify","--strict","-R","anchor apple generic"]).arg(&candidate);output(signature,&cancel).await.map_err(|_|"Не удалось подтвердить подпись официального ACP Google. Файл не установлен.")?;}
 let target=app_bin().join(entry);std::fs::create_dir_all(app_bin()).map_err(|e|e.to_string())?;std::fs::rename(candidate,target).map_err(|e|e.to_string())?;Ok(())
 }.await;
    let _ = std::fs::remove_dir_all(root);
    result
}

pub async fn ollama(app: &tauri::AppHandle, cancel: Arc<AtomicBool>) -> Result<(), String> {
    let managed = home().join("Library/Application Support/NEXUS/runtime/Ollama.app");
    let installed = [
        PathBuf::from("/Applications/Ollama.app"),
        home().join("Applications/Ollama.app"),
        managed.clone(),
    ]
    .into_iter()
    .find(|p| p.is_dir());
    let target = if let Some(installed) = installed {
        installed
    } else {
        let root = home()
            .join("Library/Application Support/NEXUS/installers")
            .join(format!("ollama-{}", project_id()));
        std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
        let result = async {
            emit(
                app,
                "local-qwen",
                "installing",
                "Загрузка официального Ollama для macOS…",
                None,
            );
            let zip = root.join("Ollama.zip");
            let mut download = crate::new_command(super::curl_path());
            download
                .args([
                    "--fail",
                    "--location",
                    "--silent",
                    "--show-error",
                    "--max-time",
                    "540",
                    "--max-filesize",
                    "2147483648",
                    "--proto",
                    "=https",
                    "--proto-redir",
                    "=https",
                    "--output",
                ])
                .arg(&zip)
                .arg("https://ollama.com/download/Ollama-darwin.zip");
            output(download, &cancel).await?;
            let mut listing = crate::new_command("/usr/bin/unzip");
            listing.arg("-Z1").arg(&zip);
            let listing = String::from_utf8(output(listing, &cancel).await?)
                .map_err(|_| "Повреждённый архив Ollama")?;
            if listing
                .lines()
                .any(|p| p.starts_with('/') || p.split('/').any(|s| s == ".."))
            {
                return Err("Небезопасные пути в архиве Ollama".into());
            }
            let mut extract = crate::new_command("/usr/bin/ditto");
            extract.args(["-x", "-k"]).arg(&zip).arg(&root);
            output(extract, &cancel).await?;
            let candidate = root.join("Ollama.app");
            let mut signature = crate::new_command("/usr/bin/codesign");
            signature
                .args(["--verify", "--deep", "--strict", "-R", "anchor apple generic"])
                .arg(&candidate);
            output(signature, &cancel)
                .await
                .map_err(|_| "Подпись Ollama не подтверждена; запуск отменён")?;
            std::fs::create_dir_all(managed.parent().unwrap()).map_err(|e| e.to_string())?;
            std::fs::rename(candidate, &managed).map_err(|e| e.to_string())?;
            Ok::<(), String>(())
        }
        .await;
        let _ = std::fs::remove_dir_all(root);
        result?;
        managed
    };
    let mut open = crate::new_command("/usr/bin/open");
    open.arg(&target);
    output(open, &cancel).await?;
    Ok(())
}
