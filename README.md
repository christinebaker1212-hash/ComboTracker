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
- **Scenes:** save where your overlay windows sit and how they look, and switch
  between setups in one click (or Ctrl+Alt+1–9).
- **Hotkeys that work in-game:** Ctrl+Alt+O shows or hides the overlay,
  Ctrl+Alt+L locks it, Ctrl+Alt+R restarts practice, Ctrl+Alt+V toggles the
  input viewer.
- **Stream-ready:** switch the overlay to a green-screen backdrop and key it out in OBS.
- **Move lists for 140+ characters:** every character in Street Fighter 6,
  Street Fighter V, Ultra Street Fighter IV and SF III: 3rd Strike, plus
  selections for SF EX Plus α, Tekken 3, BlazBlue and Persona 4 Arena. Read
  them like the in-game command list, search them, and add, pin or practise
  any move in one click.
- **Set up in seconds:** on first launch, pick your game, your character and
  your controller; ComboTracker picks matching button icons and opens their
  moves. Plug in a different controller later and it offers to switch.
- **Themes:** 38 colour themes, including gradients, or make your own.
- **Controller support:** Xbox, PlayStation, Switch and most others. Hold a
  direction for a charge input, or a button for a held press.
- **Two players:** separate combo lists for P1 and P2.
- **Practice mode:** a window on top of your game that checks your controller
  inputs against a combo as you play, tells you exactly where you dropped it,
  and shows your timing in frames. Your success rate and best streak are kept
  over time, and each practised combo shows its success rate in the list.
- **Input viewer:** shows your controller on screen and lights up buttons as you
  press them. Comes with 20+ layouts (pads, arcade sticks, leverless), drawn in
  your theme's colours as clean line art, or design your own by dragging buttons around.
- **Make it yours:** build your own icon styles (mix icons from any style or
  upload pictures, and map controller buttons by pressing them), themes with a
  live preview, and controller layouts.
- **Share codes:** turn a combo or a whole list into a short code you can paste
  in Discord.
- **Comfortable editing:** undo/redo (every delete offers an Undo button),
  search, drag to reorder, group combos under a parent, and autosave. Drop any
  ComboTracker file onto the window to open it.
- **Easy on the eyes:** Compact, Standard or Large interface sizes, and short
  one-time tips instead of a tutorial.

## Download

**[Download the latest Windows build](https://github.com/christinebaker1212-hash/ComboTracker/releases/tag/latest)**:
grab `ComboTracker-windows-portable.zip`, unzip it and run `ComboTracker.exe`;
there's nothing to install. This download updates automatically with every change.

> **"Windows protected your PC"?** The app isn't code-signed yet. Click
> **More info → Run anyway**.

## Quick start

1. **Answer three questions:** the first time it opens, pick your game,
   character and controller.
2. **Enter a combo:** click a combo row, then use the palette, your controller,
   or the **Type it** box. Or press **Move list** and add moves from there.
3. **Load presets:** **Presets → Combos** loads ready-made combo lists.
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
| Ctrl+F | Search combos |
| Backspace / Delete | Delete before / after the caret |
| ← → Home End | Move the caret |
| ↑ ↓ | Previous / next combo |
| / or Enter | Jump to the notation box |
| Esc | Hide the caret |

## Making your own content

Use the editors in the app: **Save → Save as my preset**, **Theme → Customize
this theme**, **Icon style → New icon style**, and **Settings → Edit layouts**.
On the desktop app everything you save goes in `Documents\ComboTracker`, as
plain JSON files you can back up or share. To use someone else's file, press
**Presets → Open a file**: it works out whether it's a combo list, theme, icon
style or layout.

The built-in presets live in this repo's `Presets/` folder:

- `Presets/Combos/<Game>/<Character>.json`: combo lists
- `Presets/Command Lists/<Game>/<Character>.json`: move lists
- `Presets/Themes/<Folder>/<Name>.json`: colour themes
- `Presets/Layouts/<Folder>/<Name>.json`: input viewer layouts

Folders named `User` are personal and are left out of the app build.

A theme needs just a few colours:

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
| `ComboTracker.py` | The original Tkinter version (everything it did is now in the new app). |

Build and run the new app:

```sh
cd app
npm install
npm run dev          # in a browser, at http://localhost:5173
npx tauri dev        # as the desktop app (needs Rust: https://rustup.rs)
npm test             # core logic tests
```

Every push that changes `app/`, `icons/` or `Presets/` builds the Windows app
with GitHub Actions and replaces the files on the
[`latest` release](https://github.com/christinebaker1212-hash/ComboTracker/releases/tag/latest).
It can also push to itch.io: see the setup notes at the bottom of
`.github/workflows/windows-build.yml`.
See [`app/README.md`](app/README.md) for the code layout.

## Credits

Move lists for Street Fighter 6, Street Fighter V, Ultra Street Fighter IV and
Street Fighter III: 3rd Strike are built from move names and inputs in
[FAT (Frame Assistant Tool)](https://github.com/D4RKONION/FAT) by D4RKONION
(GPL-3.0), using `app/scripts/build-command-lists.py`.

## Roadmap

- Keyboard and hitbox input without a controller driver
- Frame data overlays
- Auto-update inside the app
