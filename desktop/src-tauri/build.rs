fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "load_widget_settings",
            "save_widget_settings",
            "set_mouse_passthrough",
            "mouse_passthrough_enabled",
        ]),
    ))
    .expect("failed to build Tauri application permissions");
}
