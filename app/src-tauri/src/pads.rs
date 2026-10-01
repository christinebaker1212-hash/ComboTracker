#![cfg_attr(not(windows), allow(dead_code, unused_imports))]
// Reads controllers natively and sends their state to every window.
//
// The webview's own Gamepad API stops reporting controllers while another
// window (the game) has focus, which left the input viewer and practice mode
// frozen mid-match. These sources keep reporting regardless of focus, so on
// Windows we poll them here and the pages prefer them:
//   - XInput: Xbox controllers, and sticks/leverless boards in XInput mode.
//   - HID: PlayStation controllers (DualShock 4, DualSense, DualSense Edge)
//     and PS4-mode sticks that speak the DualShock 4 protocol, read straight
//     from their USB or Bluetooth reports.
//   - Generic HID: any other gamepad or stick (Switch Pro, 8BitDo, DirectInput
//     sticks), decoded from the device's own report descriptor.
//   - Keyboard: the keys mapped in Settings, for keyboard players and
//     leverless controllers in keyboard mode. Only those keys are read.
use serde::Serialize;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

/// One controller in the browser's standard layout, so pages treat every source alike.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize)]
pub struct PadSnapshot {
  /// Stable while the pad stays connected: 100+ for XInput, 110+ for HID pads.
  pub index: u32,
  /// Worded like the browser's ids ("... Vendor: 054c Product: 0ce6") so detection works.
  pub name: String,
  pub vendor: u16,
  pub product: u16,
  /// Bit i set = standard Gamepad API button i is pressed (0 = A/✕, 12–15 = D-pad, 16 = guide).
  pub buttons: u32,
  pub lt: u8,
  pub rt: u8,
  /// Sticks, -32768..32767, Y pointing down like the Gamepad API.
  pub lx: i16,
  pub ly: i16,
  pub rx: i16,
  pub ry: i16,
}

/// Latest state of every connected controller, for windows that open later,
/// and the keyboard keys to read (virtual-key code, standard button index).
#[derive(Default)]
pub struct Pads(pub Mutex<Vec<PadSnapshot>>, pub Mutex<Vec<(u16, u8)>>);

/// The keyboard pad's index; the page merges it into whichever pad is in use.
pub const KEYBOARD_INDEX: u32 = 120;

#[tauri::command]
pub fn native_pads(state: tauri::State<'_, Pads>) -> Vec<PadSnapshot> {
  state.0.lock().map(|p| p.clone()).unwrap_or_default()
}

/// Sets which keys stand in for controller buttons. An empty list turns the keyboard off.
#[tauri::command]
pub fn set_keyboard(state: tauri::State<'_, Pads>, keys: Vec<(u16, u8)>) {
  if let Ok(mut k) = state.1.lock() {
    *k = keys.into_iter().filter(|&(vk, b)| vk > 0 && vk < 256 && b < 32).collect();
  }
}

/// Sticks and triggers jitter constantly; only changes bigger than this are sent.
fn quantize(p: &PadSnapshot) -> (u32, u32, u8, u8, [i16; 4]) {
  let q = |v: i16| (v as i32 / 1024) as i16;
  (p.index, p.buttons, p.lt / 16, p.rt / 16, [q(p.lx), q(p.ly), q(p.rx), q(p.ry)])
}

pub fn start(app: &AppHandle) {
  app.manage(Pads::default());
  #[cfg(windows)]
  {
    let app = app.clone();
    std::thread::Builder::new()
      .name("pads".into())
      .spawn(move || poll_loop(app))
      .ok();
  }
}

#[cfg(windows)]
mod xinput {
  #[repr(C)]
  #[derive(Default)]
  pub struct Gamepad {
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
  pub struct State {
    pub packet: u32,
    pub gamepad: Gamepad,
  }
  #[link(name = "xinput")]
  unsafe extern "system" {
    pub fn XInputGetState(user_index: u32, state: *mut State) -> u32;
  }

  // XInput button bit → standard Gamepad API button index.
  const BITS: [(u16, u32); 14] = [
    (0x1000, 0), (0x2000, 1), (0x4000, 2), (0x8000, 3), (0x0100, 4), (0x0200, 5),
    (0x0020, 8), (0x0010, 9), (0x0040, 10), (0x0080, 11),
    (0x0001, 12), (0x0002, 13), (0x0004, 14), (0x0008, 15),
  ];

  pub fn read(slot: u32) -> Option<super::PadSnapshot> {
    let mut s = State::default();
    // SAFETY: XInputGetState only writes into the struct we pass.
    if unsafe { XInputGetState(slot, &mut s) } != 0 {
      return None;
    }
    let g = s.gamepad;
    let mut buttons = BITS.iter().filter(|(bit, _)| g.buttons & bit != 0).fold(0u32, |acc, (_, i)| acc | 1 << i);
    if g.left_trigger > 30 {
      buttons |= 1 << 6;
    }
    if g.right_trigger > 30 {
      buttons |= 1 << 7;
    }
    // XInput's Y axes point up; the Gamepad API's point down.
    let flip = |v: i16| v.saturating_neg().max(-32767);
    Some(super::PadSnapshot {
      index: 100 + slot,
      name: format!("Xbox Controller (XInput STANDARD GAMEPAD, player {})", slot + 1),
      vendor: 0x045e,
      product: 0,
      buttons,
      lt: g.left_trigger,
      rt: g.right_trigger,
      lx: g.thumb_lx,
      ly: flip(g.thumb_ly),
      rx: g.thumb_rx,
      ry: flip(g.thumb_ry),
    })
  }
}

#[cfg(windows)]
mod keyboard {
  #[link(name = "user32")]
  unsafe extern "system" {
    fn GetAsyncKeyState(vk: i32) -> i16;
  }

  pub fn read(keys: &[(u16, u8)]) -> Option<super::PadSnapshot> {
    if keys.is_empty() {
      return None;
    }
    let mut buttons = 0u32;
    for &(vk, button) in keys {
      // SAFETY: plain query of one key's state. The high bit means "down right now".
      if unsafe { GetAsyncKeyState(vk as i32) } as u16 & 0x8000 != 0 {
        buttons |= 1 << button;
      }
    }
    Some(super::PadSnapshot {
      index: super::KEYBOARD_INDEX,
      name: "Keyboard (ComboTracker)".into(),
      buttons,
      ..Default::default()
    })
  }
}

#[cfg(windows)]
mod hid {
  use super::PadSnapshot;
  use crate::hid_decode::{parse_descriptor, parse_generic_report, parse_ps_report, ps_kind, Layout, PsKind};
  use hidapi::{BusType, HidApi, HidDevice};
  use std::collections::HashMap;
  use std::ffi::CString;

  enum Decoder {
    PlayStation { kind: PsKind, bluetooth: bool },
    Generic { layout: Layout, nintendo: bool },
  }

  struct Open {
    device: HidDevice,
    decoder: Decoder,
    snapshot: PadSnapshot,
  }

  /// HID controllers opened directly: PlayStation pads by their known reports, any
  /// other gamepad or stick from its report descriptor. Shared access, so games still see them.
  pub struct HidPads {
    api: Option<HidApi>,
    open: HashMap<CString, Open>,
    next_index: u32,
  }

  impl HidPads {
    pub fn new() -> Self {
      Self { api: HidApi::new().ok(), open: HashMap::new(), next_index: 110 }
    }

    /// Looks for newly connected pads and forgets unplugged ones.
    pub fn refresh(&mut self) {
      let Some(api) = self.api.as_mut() else { return };
      if api.refresh_devices().is_err() {
        return;
      }
      let mut present = Vec::new();
      for info in api.device_list() {
        // Joysticks and gamepads only (usage page 1, usage 4 or 5).
        if info.usage_page() != 0x01 || !matches!(info.usage(), 0x04 | 0x05) {
          continue;
        }
        let ps = ps_kind(info.vendor_id(), info.product_id());
        // XInput pads also show up as HID ("IG_" in the path); XInput already covers them.
        let xinput = info.path().to_string_lossy().to_ascii_lowercase().contains("ig_") || info.vendor_id() == 0x045e;
        if ps.is_none() && xinput {
          continue;
        }
        let path = info.path().to_owned();
        present.push(path.clone());
        if self.open.contains_key(&path) {
          continue;
        }
        let Ok(device) = info.open_device(api) else { continue };
        let _ = device.set_blocking_mode(false);
        let decoder = match ps {
          Some(kind) => Decoder::PlayStation { kind, bluetooth: matches!(info.bus_type(), BusType::Bluetooth) },
          None => {
            let mut buf = vec![0u8; 4096];
            let Ok(n) = device.get_report_descriptor(&mut buf) else { continue };
            let layout = parse_descriptor(&buf[..n]);
            if layout.fields.is_empty() {
              continue;
            }
            Decoder::Generic { layout, nintendo: info.vendor_id() == 0x057e }
          }
        };
        let product = info.product_string().unwrap_or(match ps {
          Some(PsKind::DualSense) => "DualSense Wireless Controller",
          Some(PsKind::DualShock4) => "Wireless Controller",
          None => "Controller",
        });
        let index = self.next_index;
        self.next_index += 1;
        // "STANDARD GAMEPAD" only where the button order is known exactly.
        let standard = if ps.is_some() { "STANDARD GAMEPAD " } else { "" };
        let snapshot = PadSnapshot {
          index,
          name: format!(
            "{product} ({standard}Vendor: {:04x} Product: {:04x})",
            info.vendor_id(),
            info.product_id()
          ),
          vendor: info.vendor_id(),
          product: info.product_id(),
          ..Default::default()
        };
        self.open.insert(path, Open { device, decoder, snapshot });
      }
      self.open.retain(|path, _| present.contains(path));
    }

    /// Reads every waiting report and returns each pad's latest state.
    pub fn poll(&mut self) -> Vec<PadSnapshot> {
      let mut buf = [0u8; 128];
      let mut gone = Vec::new();
      for (path, pad) in self.open.iter_mut() {
        loop {
          match pad.device.read_timeout(&mut buf, 0) {
            Ok(0) => break,
            Ok(n) => {
              let parsed = match &pad.decoder {
                Decoder::PlayStation { kind, bluetooth } => parse_ps_report(*kind, *bluetooth, &buf[..n]),
                Decoder::Generic { layout, nintendo } => parse_generic_report(layout, *nintendo, &buf[..n]),
              };
              if let Some((buttons, lt, rt, [lx, ly, rx, ry])) = parsed {
                pad.snapshot = PadSnapshot { buttons, lt, rt, lx, ly, rx, ry, ..pad.snapshot.clone() };
              }
            }
            Err(_) => {
              gone.push(path.clone());
              break;
            }
          }
        }
      }
      for path in gone {
        self.open.remove(&path);
      }
      let mut pads: Vec<_> = self.open.values().map(|p| p.snapshot.clone()).collect();
      pads.sort_by_key(|p| p.index);
      pads
    }
  }
}

#[cfg(windows)]
fn poll_loop(app: AppHandle) {
  use std::time::{Duration, Instant};
  let mut connected = [false; 4];
  let mut last_probe = [Instant::now() - Duration::from_secs(10); 4];
  let mut ps = hid::HidPads::new();
  let mut last_hid_scan = Instant::now() - Duration::from_secs(10);
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
      match xinput::read(slot) {
        Some(p) => {
          connected[i] = true;
          now.push(p);
        }
        None => connected[i] = false,
      }
    }
    if last_hid_scan.elapsed() >= Duration::from_secs(2) {
      last_hid_scan = Instant::now();
      ps.refresh();
    }
    now.extend(ps.poll());
    let keys = app.try_state::<Pads>().and_then(|s| s.1.lock().ok().map(|k| k.clone())).unwrap_or_default();
    now.extend(keyboard::read(&keys));

    let changed = now.len() != sent.len() || now.iter().zip(&sent).any(|(a, b)| quantize(a) != quantize(b));
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
