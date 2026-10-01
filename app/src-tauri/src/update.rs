// In-app updates (Windows): download the new ComboTracker.exe next to the
// running one, swap them (Windows lets a running exe be renamed), and start
// the new one. Works for the portable exe and the per-user install alike.
// The page decides whether there's an update (see src/updates.ts).
use tauri::AppHandle;

/// Removes the previous exe left behind by an update.
pub fn cleanup() {
  if let Ok(exe) = std::env::current_exe() {
    let old = old_path(&exe);
    if std::fs::remove_file(&old).is_err() && old.exists() {
      // Right after an update the old process may still be closing.
      std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(5));
        let _ = std::fs::remove_file(old);
      });
    }
  }
}

fn old_path(exe: &std::path::Path) -> std::path::PathBuf {
  exe.with_extension("old.exe")
}

#[cfg(windows)]
mod download {
  use std::os::windows::ffi::OsStrExt;
  #[link(name = "urlmon")]
  unsafe extern "system" {
    fn URLDownloadToFileW(caller: *mut core::ffi::c_void, url: *const u16, file: *const u16, reserved: u32, callback: *mut core::ffi::c_void) -> i32;
  }
  fn wide(s: &std::ffi::OsStr) -> Vec<u16> {
    s.encode_wide().chain(std::iter::once(0)).collect()
  }
  /// Downloads a URL to a file with Windows' own downloader (follows redirects, HTTPS).
  pub fn to_file(url: &str, file: &std::path::Path) -> Result<(), String> {
    let (u, f) = (wide(std::ffi::OsStr::new(url)), wide(file.as_os_str()));
    // SAFETY: both strings are NUL-terminated and outlive the call.
    let hr = unsafe { URLDownloadToFileW(std::ptr::null_mut(), u.as_ptr(), f.as_ptr(), 0, std::ptr::null_mut()) };
    if hr == 0 { Ok(()) } else { Err(format!("Download failed (error 0x{:08x})", hr as u32)) }
  }
}

/// Downloads the new version, swaps it in and restarts into it.
#[tauri::command]
pub async fn update_install(app: AppHandle, url: String) -> Result<(), String> {
  if !url.starts_with("https://github.com/") {
    return Err("Updates only come from GitHub".into());
  }
  tauri::async_runtime::spawn_blocking(move || install(app, &url))
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(windows)]
fn install(app: AppHandle, url: &str) -> Result<(), String> {
  let exe = std::env::current_exe().map_err(|e| e.to_string())?;
  let new = exe.with_extension("new.exe");
  let _ = std::fs::remove_file(&new);
  download::to_file(url, &new)?;
  // A real Windows program, not an error page.
  let head = std::fs::read(&new).map_err(|e| e.to_string())?;
  if head.len() < 1_000_000 || !head.starts_with(b"MZ") {
    let _ = std::fs::remove_file(&new);
    return Err("The download wasn't a complete ComboTracker.exe. Try again later.".into());
  }
  let old = old_path(&exe);
  let _ = std::fs::remove_file(&old);
  std::fs::rename(&exe, &old).map_err(|e| {
    let _ = std::fs::remove_file(&new);
    format!("Couldn't replace the app where it's installed ({e}). Download the new version from the website instead.")
  })?;
  if let Err(e) = std::fs::rename(&new, &exe) {
    let _ = std::fs::rename(&old, &exe);
    return Err(format!("Couldn't put the new version in place ({e})."));
  }
  std::process::Command::new(&exe).spawn().map_err(|e| e.to_string())?;
  app.exit(0);
  Ok(())
}

#[cfg(not(windows))]
fn install(_app: AppHandle, _url: &str) -> Result<(), String> {
  Err("In-app updates are only available on Windows.".into())
}
