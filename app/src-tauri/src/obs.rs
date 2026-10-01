// Stream links: a tiny web server on this computer only (127.0.0.1) that serves
// the overlay, input viewer and input history as pages OBS can add as a
// Browser Source: no window capture, no green screen, transparent and crisp
// at any size.
//
//   GET /?view=viewer&obs=1   the app's own pages (from the built-in files)
//   GET /api/state            the main window's latest state (combos, theme, settings)
//   GET /api/events           live updates as server-sent events: "state" and "pads"
//
// The main window pushes its state with `obs_state`; controller state comes
// from the pad reader's "native-pads" event.
use std::io::{BufRead, BufReader, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{channel, Receiver, Sender};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Listener, Manager};

#[derive(Default)]
pub struct Obs {
  state: Mutex<String>,
  pads: Mutex<String>,
  clients: Mutex<Vec<Sender<(String, String)>>>,
  running: Mutex<Option<(u16, Arc<AtomicBool>)>>,
}

impl Obs {
  fn broadcast(&self, event: &str, data: &str) {
    if let Ok(mut clients) = self.clients.lock() {
      clients.retain(|c| c.send((event.to_string(), data.to_string())).is_ok());
    }
  }
}

pub fn setup(app: &AppHandle) {
  app.manage(Obs::default());
  // COMBOTRACKER_STREAM_PORT=7777 starts the server at launch, for automated streaming setups.
  if let Some(port) = std::env::var("COMBOTRACKER_STREAM_PORT").ok().and_then(|p| p.parse().ok()) {
    let _ = obs_start(app.clone(), port);
  }
  let handle = app.clone();
  app.listen_any("native-pads", move |e| {
    if let Some(obs) = handle.try_state::<Obs>() {
      if let Ok(mut p) = obs.pads.lock() {
        *p = e.payload().to_string();
      }
      obs.broadcast("pads", e.payload());
    }
  });
}

/// The main window's state, as the JSON it saves. Sent to every open stream page.
#[tauri::command]
pub fn obs_state(obs: tauri::State<'_, Obs>, state: String) {
  if let Ok(mut s) = obs.state.lock() {
    *s = state.clone();
  }
  obs.broadcast("state", &state);
}

/// Starts the server (or reports the port it's already on). Tries a few ports if `port` is taken.
#[tauri::command]
pub fn obs_start(app: AppHandle, port: u16) -> Result<u16, String> {
  let obs = app.state::<Obs>();
  let mut running = obs.running.lock().map_err(|e| e.to_string())?;
  if let Some((p, _)) = running.as_ref() {
    return Ok(*p);
  }
  let (listener, port) = (port..port.saturating_add(10))
    .find_map(|p| TcpListener::bind(("127.0.0.1", p)).ok().map(|l| (l, p)))
    .ok_or_else(|| format!("Ports {port}–{} are all in use", port.saturating_add(9)))?;
  listener.set_nonblocking(true).map_err(|e| e.to_string())?;
  let stop = Arc::new(AtomicBool::new(false));
  *running = Some((port, stop.clone()));
  let app = app.clone();
  std::thread::Builder::new()
    .name("obs-server".into())
    .spawn(move || {
      while !stop.load(Ordering::Relaxed) {
        match listener.accept() {
          Ok((stream, _)) => {
            let app = app.clone();
            std::thread::spawn(move || handle(app, stream));
          }
          Err(_) => std::thread::sleep(Duration::from_millis(25)),
        }
      }
    })
    .map_err(|e| e.to_string())?;
  Ok(port)
}

/// The port the server is on, if it's running (it may have been started at launch).
#[tauri::command]
pub fn obs_port(obs: tauri::State<'_, Obs>) -> Option<u16> {
  obs.running.lock().ok().and_then(|r| r.as_ref().map(|(p, _)| *p))
}

#[tauri::command]
pub fn obs_stop(obs: tauri::State<'_, Obs>) {
  if let Ok(mut running) = obs.running.lock() {
    if let Some((_, stop)) = running.take() {
      stop.store(true, Ordering::Relaxed);
    }
  }
  if let Ok(mut clients) = obs.clients.lock() {
    clients.clear();
  }
}

fn respond(stream: &mut TcpStream, status: &str, kind: &str, body: &[u8]) {
  let head = format!(
    "HTTP/1.1 {status}\r\nContent-Type: {kind}\r\nContent-Length: {}\r\nCache-Control: no-cache\r\nConnection: close\r\n\r\n",
    body.len()
  );
  let _ = stream.write_all(head.as_bytes());
  let _ = stream.write_all(body);
}

fn handle(app: AppHandle, mut stream: TcpStream) {
  let _ = stream.set_nonblocking(false);
  let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
  let mut reader = BufReader::new(match stream.try_clone() {
    Ok(s) => s,
    Err(_) => return,
  });
  let mut request_line = String::new();
  if reader.read_line(&mut request_line).is_err() {
    return;
  }
  // Skip the headers.
  let mut line = String::new();
  while reader.read_line(&mut line).map(|n| n > 2).unwrap_or(false) {
    line.clear();
  }
  let mut parts = request_line.split_whitespace();
  let (method, target) = (parts.next().unwrap_or(""), parts.next().unwrap_or("/"));
  if method != "GET" {
    respond(&mut stream, "405 Method Not Allowed", "text/plain", b"GET only");
    return;
  }
  let path = target.split(['?', '#']).next().unwrap_or("/");
  let Some(obs) = app.try_state::<Obs>() else { return };
  match path {
    "/api/state" => {
      let state = obs.state.lock().map(|s| s.clone()).unwrap_or_default();
      respond(&mut stream, "200 OK", "application/json", if state.is_empty() { b"{}" } else { state.as_bytes() });
    }
    "/api/events" => {
      let (tx, rx) = channel();
      if let Ok(mut clients) = obs.clients.lock() {
        clients.push(tx);
      }
      let first = [
        ("state".to_string(), obs.state.lock().map(|s| s.clone()).unwrap_or_default()),
        ("pads".to_string(), obs.pads.lock().map(|s| s.clone()).unwrap_or_default()),
      ];
      drop(obs);
      events(stream, first, rx);
    }
    _ => match app.asset_resolver().get(asset_path(path)) {
      Some(asset) => respond(&mut stream, "200 OK", asset.mime_type(), asset.bytes()),
      None => respond(&mut stream, "404 Not Found", "text/plain", b"Not found"),
    },
  }
}

/// "/presets/Command%20Lists/x.json" → "presets/Command Lists/x.json"; "/" → "index.html".
fn asset_path(path: &str) -> String {
  let bytes = path.trim_start_matches('/').as_bytes();
  let mut out = Vec::with_capacity(bytes.len());
  let mut i = 0;
  while i < bytes.len() {
    let hex = |b: u8| (b as char).to_digit(16);
    match (bytes[i], bytes.get(i + 1).and_then(|&b| hex(b)), bytes.get(i + 2).and_then(|&b| hex(b))) {
      (b'%', Some(h), Some(l)) => {
        out.push((h * 16 + l) as u8);
        i += 3;
      }
      (b, _, _) => {
        out.push(b);
        i += 1;
      }
    }
  }
  let decoded = String::from_utf8_lossy(&out).into_owned();
  if decoded.is_empty() || decoded.contains("..") { "index.html".into() } else { decoded }
}

/// Streams events until the page goes away.
fn events(mut stream: TcpStream, first: [(String, String); 2], rx: Receiver<(String, String)>) {
  let head = "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nCache-Control: no-cache\r\nConnection: keep-alive\r\n\r\nretry: 1000\n\n";
  if stream.write_all(head.as_bytes()).is_err() {
    return;
  }
  let send = |stream: &mut TcpStream, event: &str, data: &str| -> bool {
    if data.is_empty() {
      return true;
    }
    stream.write_all(format!("event: {event}\ndata: {data}\n\n").as_bytes()).and_then(|_| stream.flush()).is_ok()
  };
  for (event, data) in first {
    if !send(&mut stream, &event, &data) {
      return;
    }
  }
  loop {
    match rx.recv_timeout(Duration::from_secs(15)) {
      Ok((event, data)) => {
        // Only the newest pad state matters; skip any backlog.
        let (mut event, mut data) = (event, data);
        while let Ok((e, d)) = rx.try_recv() {
          if e == "pads" && event == "pads" {
            data = d;
          } else {
            if !send(&mut stream, &event, &data) {
              return;
            }
            event = e;
            data = d;
          }
        }
        if !send(&mut stream, &event, &data) {
          return;
        }
      }
      // A comment line keeps the connection alive and notices closed pages.
      Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
        if stream.write_all(b": ping\n\n").is_err() {
          return;
        }
      }
      Err(_) => return,
    }
  }
}
