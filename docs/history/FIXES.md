NEXUS v0.4.4 Rust compile fixes:
- Enable Tokio macros feature for tokio::select!
- Clone Arc<Mutex<...>> directly instead of private Arc::inner()
- Return Result from async Tauri command with State reference
- Annotate ExitStatus for process wait loop
- Remove unused Path import

Build: nvm use 22 && npm install && npx tauri build --bundles app
Not compiled on macOS in this environment.
