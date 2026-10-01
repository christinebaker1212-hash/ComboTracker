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

// --- PlayStation reports (pure, so they're testable anywhere) ---

/// Which report layout a PlayStation-protocol controller uses.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PsKind {
  DualShock4,
  DualSense,
}

/// Sony and licensed controllers that send DualShock 4 / DualSense reports.
pub fn ps_kind(vendor: u16, product: u16) -> Option<PsKind> {
  use PsKind::*;
  Some(match (vendor, product) {
    (0x054c, 0x0ce6 | 0x0df2) => DualSense,
    (0x054c, 0x05c4 | 0x09cc | 0x0ba0) => DualShock4,
    // Licensed PS4 pads and fight sticks.
    (0x0f0d, 0x0055 | 0x005e | 0x0066 | 0x0084 | 0x0087 | 0x008a | 0x00ee) => DualShock4, // HORI
    (0x1532, 0x0401 | 0x1000 | 0x1004 | 0x1007 | 0x1008 | 0x1009) => DualShock4,          // Razer
    (0x2c22, 0x2000 | 0x2200 | 0x2300 | 0x2302 | 0x2303) => DualShock4,                   // Qanba
    (0x0738, 0x8180 | 0x8250 | 0x8384 | 0x8481) => DualShock4,                            // Mad Catz
    (0x0c12, 0x0e10 | 0x0e13 | 0x0e15 | 0x0e16 | 0x0ef6 | 0x1cf6) => DualShock4,          // Brook, Zeroplus
    (0x146b, 0x0d01 | 0x0d02 | 0x0d08) => DualShock4,                                     // Nacon
    (0x7545, 0x0104) => DualShock4,                                                       // Armor
    _ => return None,
  })
}

/// D-pad hat (0 = up, clockwise, 8+ = centred) → standard buttons 12–15.
fn hat_bits(hat: u8) -> u32 {
  const UP: u32 = 1 << 12;
  const DOWN: u32 = 1 << 13;
  const LEFT: u32 = 1 << 14;
  const RIGHT: u32 = 1 << 15;
  match hat {
    0 => UP,
    1 => UP | RIGHT,
    2 => RIGHT,
    3 => DOWN | RIGHT,
    4 => DOWN,
    5 => DOWN | LEFT,
    6 => LEFT,
    7 => UP | LEFT,
    _ => 0,
  }
}

/// Reads sticks/triggers/buttons from a report, given where each block starts.
fn ps_fields(r: &[u8], sticks: usize, triggers: usize, buttons: usize) -> Option<(u32, u8, u8, [i16; 4])> {
  if r.len() < buttons + 3 || r.len() < triggers + 2 {
    return None;
  }
  let axis = |v: u8| ((v as i16) - 128) * 256;
  let (b0, b1, b2) = (r[buttons], r[buttons + 1], r[buttons + 2]);
  let bit = |byte: u8, n: u8, std: u32| if byte & (1 << n) != 0 { 1u32 << std } else { 0 };
  let pressed = hat_bits(b0 & 0x0f)
    | bit(b0, 4, 2) // □ → X
    | bit(b0, 5, 0) // ✕ → A
    | bit(b0, 6, 1) // ○ → B
    | bit(b0, 7, 3) // △ → Y
    | bit(b1, 0, 4) // L1
    | bit(b1, 1, 5) // R1
    | bit(b1, 2, 6) // L2 (digital)
    | bit(b1, 3, 7) // R2 (digital)
    | bit(b1, 4, 8) // Share / Create
    | bit(b1, 5, 9) // Options
    | bit(b1, 6, 10) // L3
    | bit(b1, 7, 11) // R3
    | bit(b2, 0, 16) // PS
    | bit(b2, 1, 17); // Touchpad click
  let sticks = [axis(r[sticks]), axis(r[sticks + 1]), axis(r[sticks + 2]), axis(r[sticks + 3])];
  Some((pressed, r[triggers], r[triggers + 1], sticks))
}

/// Decodes one input report (starting with its report id). None if it isn't an input state report.
pub fn parse_ps_report(kind: PsKind, bluetooth: bool, r: &[u8]) -> Option<(u32, u8, u8, [i16; 4])> {
  match (kind, r.first()?) {
    // DualShock 4 over USB, and the short report both pads send over Bluetooth at first:
    // sticks, buttons, then triggers.
    (PsKind::DualShock4, 0x01) => ps_fields(r, 1, 8, 5),
    (PsKind::DualSense, 0x01) if bluetooth => ps_fields(r, 1, 8, 5),
    // DualShock 4 full Bluetooth report: same layout two bytes later.
    (PsKind::DualShock4, 0x11) => ps_fields(r, 3, 10, 7),
    // DualSense over USB: sticks, triggers, a counter, then buttons.
    (PsKind::DualSense, 0x01) => ps_fields(r, 1, 5, 8),
    // DualSense full Bluetooth report: same layout one byte later.
    (PsKind::DualSense, 0x31) => ps_fields(r, 2, 6, 9),
    _ => None,
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
  use super::{parse_ps_report, ps_kind, PadSnapshot, PsKind};
  use hidapi::{BusType, HidApi, HidDevice};
  use std::collections::HashMap;
  use std::ffi::CString;

  struct Open {
    device: HidDevice,
    kind: PsKind,
    bluetooth: bool,
    snapshot: PadSnapshot,
  }

  /// PlayStation-protocol controllers, opened directly. Shared access, so games still see them.
  pub struct PlayStation {
    api: Option<HidApi>,
    open: HashMap<CString, Open>,
    next_index: u32,
  }

  impl PlayStation {
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
        let Some(kind) = ps_kind(info.vendor_id(), info.product_id()) else { continue };
        // Only the gamepad interface (usage page 1, usage 5) carries input reports.
        if info.usage_page() != 0x01 || info.usage() != 0x05 {
          continue;
        }
        let path = info.path().to_owned();
        present.push(path.clone());
        if self.open.contains_key(&path) {
          continue;
        }
        let Ok(device) = info.open_device(api) else { continue };
        let _ = device.set_blocking_mode(false);
        let product = info.product_string().unwrap_or(match kind {
          PsKind::DualSense => "DualSense Wireless Controller",
          PsKind::DualShock4 => "Wireless Controller",
        });
        let index = self.next_index;
        self.next_index += 1;
        let snapshot = PadSnapshot {
          index,
          name: format!(
            "{product} (STANDARD GAMEPAD Vendor: {:04x} Product: {:04x})",
            info.vendor_id(),
            info.product_id()
          ),
          vendor: info.vendor_id(),
          product: info.product_id(),
          ..Default::default()
        };
        let bluetooth = matches!(info.bus_type(), BusType::Bluetooth);
        self.open.insert(path, Open { device, kind, bluetooth, snapshot });
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
              if let Some((buttons, lt, rt, [lx, ly, rx, ry])) = parse_ps_report(pad.kind, pad.bluetooth, &buf[..n]) {
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
  let mut ps = hid::PlayStation::new();
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

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn dualshock4_usb_report() {
    // id, lx ly rx ry, ✕ held with the hat centred, L1, PS, L2 half, R2 full
    let r = [0x01, 0, 128, 255, 128, 0x28, 0x01, 0x01, 128, 255];
    let (buttons, lt, rt, sticks) = parse_ps_report(PsKind::DualShock4, false, &r).unwrap();
    assert_eq!(buttons, 1 << 0 | 1 << 4 | 1 << 16);
    assert_eq!((lt, rt), (128, 255));
    assert_eq!(sticks, [-32768, 0, 32512, 0]);
  }

  #[test]
  fn dualsense_usb_and_bluetooth_reports() {
    // USB: id, sticks, L2 R2, counter, buttons (□ + hat right), Options
    let usb = [0x01, 128, 128, 128, 128, 10, 20, 7, 0x12, 0x20, 0x00];
    let (buttons, lt, rt, _) = parse_ps_report(PsKind::DualSense, false, &usb).unwrap();
    assert_eq!(buttons, 1 << 2 | 1 << 15 | 1 << 9);
    assert_eq!((lt, rt), (10, 20));
    // Full Bluetooth report: one byte later, after a sequence number.
    let bt = [0x31, 0x00, 128, 128, 128, 128, 10, 20, 7, 0x12, 0x20, 0x00];
    assert_eq!(parse_ps_report(PsKind::DualSense, true, &bt).map(|r| r.0), Some(buttons));
    // Short Bluetooth report uses the DualShock 4 order.
    let short = [0x01, 128, 128, 128, 128, 0x12, 0x20, 0x00, 10, 20];
    assert_eq!(parse_ps_report(PsKind::DualSense, true, &short).map(|r| r.0), Some(buttons));
  }

  #[test]
  fn ignores_other_reports_and_unknown_pads() {
    assert_eq!(parse_ps_report(PsKind::DualShock4, false, &[0x05, 1, 2, 3]), None);
    assert_eq!(parse_ps_report(PsKind::DualSense, false, &[0x01, 1]), None);
    assert_eq!(ps_kind(0x054c, 0x0ce6), Some(PsKind::DualSense));
    assert_eq!(ps_kind(0x045e, 0x02ea), None);
  }
}
