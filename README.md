# ComboTracker

Build, organise and practise fighting game combos, and pin them on screen
while you play.

ComboTracker turns button presses, arrows and motions into clean combo notation
with icons for dozens of games and controllers. Pinned combos float on top of
your game in a see-through overlay, so you can read them mid-match or show them
on stream.

## Features

- **Three ways to enter combos:** click the on-screen palette, use your
  controller, or type notation like `2MK > 236HP`.
- **26 icon styles:** Street Fighter, Tekken, Soul Calibur, Guilty Gear,
  BlazBlue, SNK, PlayStation, Xbox, Nintendo, keyboard, numpad notation and more.
- **Game overlay:** pinned combos float see-through and always on top. Lock it
  and clicks pass straight through to your game.
- **Stream-ready:** switch the overlay to a green-screen backdrop and key it out in OBS.
- **Ready-made presets:** command lists for SF6, SF III: 3rd Strike, SF EX Plus α,
  Tekken 3, BlazBlue and Persona 4 Arena, plus starter combos.
- **Themes:** 38 colour themes, including gradients, or make your own.
- **Controller support:** Xbox, PlayStation, Switch and most others. Hold a
  direction for a charge input, or a button for a held press.
- **Two players:** separate combo lists for P1 and P2.
- **Comfortable editing:** undo/redo, drag to reorder, group combos under a
  parent, and autosave.

## Download

Get the latest Windows version from itch.io. Unzip it and run
`ComboTracker.exe`; there's nothing to install.

> **"Windows protected your PC"?** The app isn't code-signed yet. Click
> **More info → Run anyway**.

## Quick start

1. **Pick your style:** choose an icon style (top left, e.g. *PlayStation*)
   and a theme.
2. **Enter a combo:** click a combo row, then use the palette, your controller,
   or the **Type it** box.
3. **Load presets:** use **Combos** or **Command lists** in the top bar to load
   a whole character.
4. **Pin it:** click the 📌 on the combos you want, then press **Overlay**.
5. **Play:** drag the overlay where you want it, scroll over it to resize,
   then click 🔒 in the main window so clicks go through to the game.

Run your game in **borderless windowed** mode. Overlays can't draw over
exclusive fullscreen.

### Typing notation

| You type | You get |
|---|---|
| `2MK > 236HP` | ↓+MK ➔ QCF+HP |
| `[4]6HP` | charge ←, then →+HP |
| `623P` | DP + any punch |
| `j.HK` | jumping HK |
| `5LP 5LP, 2LP xx 214K` | steps split by spaces, `>`, `,` or `xx` |
| `qcf+lp` | words work too |
| `DRC` | shortcut names from the current icon style |

Buttons: `LP MP HP LK MK HK`, `P`/`K` for any punch/kick, and `[HP]` for a held press.

### Keyboard shortcuts

| Keys | Action |
|---|---|
| Ctrl+Z / Ctrl+Shift+Z | Undo / redo |
| Ctrl+S | Save combos to a file |
| Backspace / Delete | Delete before / after the caret |
| ← → Home End | Move the caret |
| ↑ ↓ | Previous / next combo |
| / or Enter | Jump to the notation box |
| Esc | Hide the caret |

## Making your own content

Everything is plain JSON in the `Presets/` folder, so you can add your own and
share them:

- `Presets/Combos/<Game>/<Character>.json`: combo lists
- `Presets/Command Lists/<Game>/<Character>.json`: move lists
- `Presets/Themes/<Folder>/<Name>.json`: colour themes

The easiest way to make a combo list is to build it in the app and press
**Save**. A theme needs just a few colours:

```json
{ "bg": "#2A065E", "highlight": "#C429C7", "font": "#FFFFFF", "entry_bg": "#3B0984" }
```

or a four-corner gradient, from which the other colours are worked out:

```json
{ "bg_grad": ["#0000AB", "#000080", "#000048", "#000020"], "grad_combos": true }
```

Icons live in `icons/` and are named `<token><style suffix>.png`, for example
`lp_ps.png` is Light Punch in the PlayStation style.

## For developers

The repository contains two versions:

| Folder | What it is |
|---|---|
| `app/` | **The current app.** React + TypeScript, packaged for desktop with Tauri. |
| `ComboTracker.py` | The original Tkinter version, kept until the new app covers everything. |

Build and run the new app:

```sh
cd app
npm install
npm run dev          # in a browser, at http://localhost:5173
npx tauri dev        # as the desktop app (needs Rust: https://rustup.rs)
npm test             # core logic tests
```

Windows builds are made automatically by GitHub Actions (**Actions → Windows
build**). Download the `ComboTracker-windows` artifact when the run finishes.
See [`app/README.md`](app/README.md) for the code layout.

## Roadmap

- Custom icon-set builder and theme editor
- Live input viewer with controller layouts
- Soul Calibur and SNK special-input detection for controllers
- Practice mode that checks your inputs against a combo
- Shareable combo codes
