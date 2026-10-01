// Reads XInput controllers natively and sends their state to every window.
//
// The webview's own Gamepad API stops reporting Xbox-style controllers while
// another window (the game) has focus, which left the input viewer and
// practice mode frozen mid-match. XInput keeps reporting regardless of focus,
// so on Windows we poll it here and the pages prefer this source.
use serde::Serialize;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize)]
pub struct PadSnapshot {
  pub slot: u32,
  /// XInput button bits (XINPUT_GAMEPAD_*).
  pub buttons: u16,
  pub lt: u8,
  pub rt: u8,
  pub lx: i16,
  pub ly: i16,
  pub rx: i16,
  pub ry: i16,
}

/// Latest state of every connected controller, for windows that open later.
#[derive(Default)]
pub struct Pads(pub Mutex<Vec<PadSnapshot>>);

#[tauri::command]
pub fn native_pads(state: tauri::State<'_, Pads>) -> Vec<PadSnapshot> {
  state.0.lock().map(|p| p.clone()).unwrap_or_default()
}

/// Sticks and triggers jitter constantly; only changes bigger than this are sent.
fn quantize(p: PadSnapshot) -> PadSnapshot {
  let q16 = |v: i16| (v as i32 / 1024) as i16;
  PadSnapshot { lt: p.lt / 16, rt: p.rt / 16, lx: q16(p.lx), ly: q16(p.ly), rx: q16(p.rx), ry: q16(p.ry), ..p }
}

pub fn start(app: &AppHandle) {
  app.manage(Pads::default());
  #[cfg(windows)]
  {
    let app = app.clone();
    std::thread::Builder::new()
      .name("xinput".into())
      .spawn(move || poll_loop(app))
      .ok();
  }
}

#[cfg(windows)]
mod ffi {
  #[repr(C)]
  #[derive(Default)]
  pub struct XInputGamepad {
    pub buttons: u16,
    pub left_trigger: u8,
    pub right_trigger: u8,
    pub thumb_lx: i16,
    pub thumb_ly: i16,
    pub thumb_rx: i16,
    pub thumb_ry: i16,
  }
  #[repr(C)]
  #[derive(Default)]
  pub struct XInputState {
    pub packet: u32,
    pub gamepad: XInputGamepad,
  }
  #[link(name = "xinput")]
  unsafe extern "system" {
    pub fn XInputGetState(user_index: u32, state: *mut XInputState) -> u32;
  }
}

#[cfg(windows)]
fn read(slot: u32) -> Option<PadSnapshot> {
  let mut s = ffi::XInputState::default();
  // SAFETY: XInputGetState only writes into the struct we pass.
  if unsafe { ffi::XInputGetState(slot, &mut s) } != 0 {
    return None;
  }
  let g = s.gamepad;
  Some(PadSnapshot {
    slot,
    buttons: g.buttons,
    lt: g.left_trigger,
    rt: g.right_trigger,
    lx: g.thumb_lx,
    ly: g.thumb_ly,
    rx: g.thumb_rx,
    ry: g.thumb_ry,
  })
}

#[cfg(windows)]
fn poll_loop(app: AppHandle) {
  use std::time::{Duration, Instant};
  let mut connected = [false; 4];
  let mut last_probe = [Instant::now() - Duration::from_secs(10); 4];
  let mut sent: Vec<PadSnapshot> = Vec::new();
  loop {
    let mut now: Vec<PadSnapshot> = Vec::new();
    for slot in 0..4u32 {
      let i = slot as usize;
      // Asking an empty slot is slow, so look for newly plugged-in pads once a second.
      if !connected[i] && last_probe[i].elapsed() < Duration::from_secs(1) {
        continue;
      }
      last_probe[i] = Instant::now();
      match read(slot) {
        Some(p) => {
          connected[i] = true;
          now.push(p);
        }
        None => connected[i] = false,
      }
    }
    let changed = now.len() != sent.len() || now.iter().zip(&sent).any(|(a, b)| quantize(*a) != quantize(*b));
    if changed {
      if let Some(state) = app.try_state::<Pads>() {
        if let Ok(mut p) = state.0.lock() {
          *p = now.clone();
        }
      }
      let _ = app.emit("native-pads", &now);
      sent = now;
    }
    std::thread::sleep(Duration::from_millis(4));
  }
}
