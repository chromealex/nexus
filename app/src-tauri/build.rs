fn main() {
    #[cfg(target_os = "macos")]
    {
        cc::Build::new()
            .file("src/claude_ax.m")
            .flag("-fobjc-arc")
            .compile("nexus_claude_ax");
        cc::Build::new()
            .file("src/connection_keychain.m")
            .flag("-fobjc-arc")
            .compile("nexus_connection_keychain");
        cc::Build::new()
            .file("src/background_macos.m")
            .flag("-fobjc-arc")
            .compile("nexus_background_macos");
        println!("cargo:rerun-if-changed=src/background_macos.m");
        println!("cargo:rustc-link-lib=framework=ServiceManagement");
        println!("cargo:rerun-if-changed=src/connection_keychain.m");
        println!("cargo:rustc-link-lib=framework=Security");
        println!("cargo:rustc-link-lib=framework=Foundation");
        println!("cargo:rustc-link-lib=framework=AppKit");
        println!("cargo:rustc-link-lib=framework=ApplicationServices");
    }
    tauri_build::build()
}
