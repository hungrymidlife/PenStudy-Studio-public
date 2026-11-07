#[cfg(target_os = "android")]
use tauri_plugin_penstudy_immersive::ImmersiveExt;

#[tauri::command]
fn set_immersive(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    #[cfg(target_os = "android")]
    { app.immersive().set_mode(enabled) }
    #[cfg(not(target_os = "android"))]
    { let _ = (app, enabled); Ok(()) }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            #[cfg(mobile)]
            app.handle().plugin(tauri_plugin_barcode_scanner::init())?;
            #[cfg(target_os = "android")]
            app.handle().plugin(tauri_plugin_penstudy_immersive::init())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![set_immersive])
        .run(tauri::generate_context!())
        .expect("failed to launch PenStudy Pad");
}
