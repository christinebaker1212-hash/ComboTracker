mod hid_decode;
mod pads;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_opener::init())
    // Remembers every window's position and size, including overlays.
    .plugin(tauri_plugin_window_state::Builder::default().build())
    // Hotkeys that work while a game has focus (toggle overlay, lock, restart practice).
    .plugin(tauri_plugin_global_shortcut::Builder::new().build())
    .invoke_handler(tauri::generate_handler![pads::native_pads, pads::set_keyboard])
    .setup(|app| {
      // Controller input that keeps working while the game has focus.
      pads::start(app.handle());
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
