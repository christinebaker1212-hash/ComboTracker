#![cfg_attr(not(windows), allow(dead_code))]
// Decoding controller reports read over HID: PlayStation pads by their known
// report layouts, any other gamepad from its report descriptor. No Tauri or OS
// code here, so it's tested on its own:
//   rustc --edition 2024 --test src/hid_decode.rs -o target/hid_decode && target/hid_decode

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

// --- Generic HID gamepads (pure, so they're testable anywhere) ---

/// One input field from a report descriptor.
#[derive(Clone, Debug, PartialEq)]
pub struct Field {
  pub report_id: u8,
  /// Bit position in the report, after the report id byte.
  pub bit: usize,
  pub size: usize,
  pub page: u16,
  pub usage: u16,
  pub min: i32,
  pub max: i32,
}

/// The fields a gamepad's reports carry, from its HID report descriptor.
#[derive(Clone, Debug, Default)]
pub struct Layout {
  pub fields: Vec<Field>,
  pub uses_report_ids: bool,
}

/// Reads the input fields out of a HID report descriptor. Only what gamepads use is
/// understood (buttons, hat switch, axes); everything else is skipped by size.
pub fn parse_descriptor(d: &[u8]) -> Layout {
  #[derive(Clone, Copy, Default)]
  struct Globals {
    page: u16,
    min: i32,
    max: i32,
    size: usize,
    count: usize,
    report_id: u8,
  }
  let mut g = Globals::default();
  let mut stack: Vec<Globals> = Vec::new();
  let mut usages: Vec<(u16, u16)> = Vec::new();
  let mut usage_range: Option<(u32, u32)> = None;
  let mut offsets: std::collections::HashMap<u8, usize> = Default::default();
  let mut layout = Layout::default();
  let mut i = 0;
  while i < d.len() {
    let prefix = d[i];
    if prefix == 0xfe {
      // Long item: skip it.
      let len = *d.get(i + 1).unwrap_or(&0) as usize;
      i += 3 + len;
      continue;
    }
    let len = [0, 1, 2, 4][(prefix & 3) as usize];
    let Some(bytes) = d.get(i + 1..i + 1 + len) else { break };
    let unsigned = bytes.iter().rev().fold(0u32, |acc, &b| acc << 8 | b as u32);
    let signed = match len {
      1 => bytes[0] as i8 as i32,
      2 => i16::from_le_bytes([bytes[0], bytes[1]]) as i32,
      4 => unsigned as i32,
      _ => 0,
    };
    let local_usage = |u: u32, page: u16| if len == 4 { ((u >> 16) as u16, u as u16) } else { (page, u as u16) };
    match prefix & 0xfc {
      0x04 => g.page = unsigned as u16,
      0x14 => g.min = signed,
      // Logical maximum is unsigned when the minimum isn't negative.
      0x24 => g.max = if g.min >= 0 { unsigned as i32 } else { signed },
      0x74 => g.size = unsigned as usize,
      0x94 => g.count = unsigned as usize,
      0x84 => {
        g.report_id = unsigned as u8;
        layout.uses_report_ids = true;
      }
      0xa4 => stack.push(g),
      0xb4 => g = stack.pop().unwrap_or(g),
      0x08 => usages.push(local_usage(unsigned, g.page)),
      0x18 => usage_range = Some((unsigned, usage_range.map_or(unsigned, |r| r.1))),
      0x28 => usage_range = Some((usage_range.map_or(0, |r| r.0), unsigned)),
      0x80 => {
        // Input item. Bit 0: constant (padding). Bit 1: variable (one value per usage).
        let offset = offsets.entry(g.report_id).or_insert(0);
        let constant = unsigned & 1 != 0;
        let variable = unsigned & 2 != 0;
        if !constant && variable {
          for n in 0..g.count {
            let (page, usage) = if let Some((lo, hi)) = usage_range {
              let u = (lo + n as u32).min(hi);
              local_usage(u, g.page)
            } else if let Some(&u) = usages.get(n).or(usages.last()) {
              u
            } else {
              continue;
            };
            layout.fields.push(Field {
              report_id: g.report_id,
              bit: *offset + n * g.size,
              size: g.size,
              page,
              usage,
              min: g.min,
              max: g.max,
            });
          }
        }
        *offset += g.size * g.count;
        usages.clear();
        usage_range = None;
      }
      // Output, feature, collections: just reset the local items.
      0x90 | 0xb0 | 0xa0 | 0xc0 => {
        usages.clear();
        usage_range = None;
      }
      _ => {}
    }
    i += 1 + len;
  }
  layout
}

/// Reads `size` bits at `bit` (little-endian) from a report body.
fn read_bits(body: &[u8], bit: usize, size: usize) -> Option<u32> {
  if size == 0 || size > 32 || body.len() * 8 < bit + size {
    return None;
  }
  let mut v = 0u64;
  for i in 0..size {
    let b = bit + i;
    if body[b / 8] >> (b % 8) & 1 != 0 {
      v |= 1 << i;
    }
  }
  Some(v as u32)
}

/// Button n (1-based) → standard index. Most DirectInput pads and sticks use the
/// PS3 order (□ ✕ ○ △ L1 R1 L2 R2 Select Start L3 R3 Home); Nintendo pads put
/// face buttons in B A Y X order.
fn button_to_standard(n: u16, nintendo: bool) -> Option<u32> {
  const PS3: [u32; 13] = [2, 0, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 16];
  const NINTENDO: [u32; 14] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 16, 17];
  let table: &[u32] = if nintendo { &NINTENDO } else { &PS3 };
  table.get(n.checked_sub(1)? as usize).copied()
}

/// Decodes one report with a parsed layout into standard buttons, triggers and sticks.
pub fn parse_generic_report(layout: &Layout, nintendo: bool, report: &[u8]) -> Option<(u32, u8, u8, [i16; 4])> {
  let (id, body) = if layout.uses_report_ids { (*report.first()?, report.get(1..)?) } else { (0, report) };
  let mut buttons = 0u32;
  let mut axes: [Option<i16>; 6] = [None; 6];
  let mut matched = false;
  for f in layout.fields.iter().filter(|f| f.report_id == id) {
    let Some(raw) = read_bits(body, f.bit, f.size) else { continue };
    matched = true;
    // Sign-extend when the field can be negative.
    let value = if f.min < 0 && f.size < 32 && raw & (1 << (f.size - 1)) != 0 { raw as i32 - (1 << f.size) } else { raw as i32 };
    match (f.page, f.usage) {
      (0x09, n) if value != 0 => buttons |= button_to_standard(n, nintendo).map_or(0, |b| 1 << b),
      (0x01, 0x39) => {
        let v = value - f.min;
        buttons |= if (0..=7).contains(&v) { hat_bits(v as u8) } else { 0 };
      }
      (0x01, u @ 0x30..=0x35) if f.max > f.min => {
        let t = (value - f.min) as f64 / (f.max - f.min) as f64;
        axes[(u - 0x30) as usize] = Some((t * 65535.0 - 32768.0).round().clamp(-32768.0, 32767.0) as i16);
      }
      _ => {}
    }
  }
  if !matched {
    return None;
  }
  let [x, y, z, rx, ry, rz] = axes;
  let sticks = [x.unwrap_or(0), y.unwrap_or(0), z.or(rx).unwrap_or(0), rz.or(ry).unwrap_or(0)];
  let digital = |b: u32| if buttons & (1 << b) != 0 { 255 } else { 0 };
  Some((buttons, digital(6), digital(7), sticks))
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

  /// A typical DirectInput fight stick: 13 buttons, 3 bits padding, a hat, four 8-bit axes.
  const STICK: &[u8] = &[
    0x05, 0x01, 0x09, 0x05, 0xa1, 0x01, // Usage page Generic Desktop, Gamepad, Collection
    0x15, 0x00, 0x25, 0x01, 0x75, 0x01, 0x95, 0x0d, 0x05, 0x09, 0x19, 0x01, 0x29, 0x0d, 0x81, 0x02, // 13 buttons
    0x95, 0x03, 0x81, 0x01, // 3 bits padding
    0x05, 0x01, 0x25, 0x07, 0x46, 0x3b, 0x01, 0x75, 0x04, 0x95, 0x01, 0x65, 0x14, 0x09, 0x39, 0x81, 0x42, // hat
    0x65, 0x00, 0x95, 0x01, 0x81, 0x01, // 4 bits padding
    0x26, 0xff, 0x00, 0x46, 0xff, 0x00, 0x09, 0x30, 0x09, 0x31, 0x09, 0x32, 0x09, 0x35, 0x75, 0x08, 0x95, 0x04, 0x81, 0x02, // X Y Z Rz
    0xc0,
  ];

  #[test]
  fn generic_descriptor_and_report() {
    let layout = parse_descriptor(STICK);
    assert!(!layout.uses_report_ids);
    assert_eq!(layout.fields.len(), 13 + 1 + 4);
    // Buttons 1 (□) and 2 (✕) and 13 (Home), hat = 2 (right), stick pushed left.
    let report = [0b0000_0011, 0b0001_0000, 0x02, 0x00, 0x80, 0x80, 0x80];
    let (buttons, _, _, sticks) = parse_generic_report(&layout, false, &report).unwrap();
    assert_eq!(buttons, 1 << 2 | 1 << 0 | 1 << 16 | 1 << 15);
    assert_eq!(sticks[0], -32768);
    // The same buttons on a Nintendo pad are B and A.
    let (nintendo, _, _, _) = parse_generic_report(&layout, true, &report).unwrap();
    assert_eq!(nintendo & 0b11, 0b11);
  }

  #[test]
  fn ignores_other_reports_and_unknown_pads() {
    assert_eq!(parse_ps_report(PsKind::DualShock4, false, &[0x05, 1, 2, 3]), None);
    assert_eq!(parse_ps_report(PsKind::DualSense, false, &[0x01, 1]), None);
    assert_eq!(ps_kind(0x054c, 0x0ce6), Some(PsKind::DualSense));
    assert_eq!(ps_kind(0x045e, 0x02ea), None);
  }
}
