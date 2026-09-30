# ComboTracker (new app)

The modern rewrite of ComboTracker: React + TypeScript, running in the browser
today and packaged as a desktop app with Tauri in the next milestone. The
Python app in the repo root keeps working until this one does everything it does.

It reads the same `icons/` and `Presets/` folders and the same combo, command
list and theme JSON files, so nothing you've made needs converting.

## Run it

Needs [Node.js](https://nodejs.org) 20 or newer.

```sh
cd app
npm install
npm run dev      # opens at http://localhost:5173
```

Other commands:

| Command | What it does |
|---|---|
| `npm test` | Runs the core logic tests |
| `npm run build` | Builds a static site into `dist/` |
| `npm run lint` | Lints the code |

`npm run dev` and `npm run build` first copy `../icons` and `../Presets` into
`public/` and index them, so add icons and presets in the repo-root folders as usual.

## Using it

- **Click** palette buttons, or **hold** one for the held/charge version.
- **Type** notation in the "Type it" box: `2MK > 236HP`, `[4]6HP`, `j.HK`,
  `623P`, `qcf+lp`, or a shortcut name like `DRC`.
- **Controller**: plug one in and press a button; input goes into the selected combo.
- **Click inside a combo** to place the caret and insert in the middle.
- **Pin** combos and press **Overlay** for a live-updating window you can
  capture in OBS (switch its backdrop to green screen for chroma key).
- Everything autosaves in the browser. **Save/Open** read and write the same
  JSON files as the desktop app.

| Shortcut | Action |
|---|---|
| Ctrl+Z / Ctrl+Shift+Z | Undo / redo |
| Ctrl+S | Save the current list |
| Backspace / Delete | Delete before / after the caret |
| ← → Home End | Move the caret |
| ↑ ↓ | Previous / next combo |
| / or Enter | Jump to the notation box |
| Esc | Hide the caret |

## Layout

```
src/
  core/         Pure logic, no UI. Tested in core.test.ts.
    tokens.ts     Token names and labels (the JSON vocabulary)
    editor.ts     Combo editing rules (ported from the Python app)
    notation.ts   Typed notation → tokens
    glyphs.ts     Icon packs and icon fallback rules
    input.ts      Controller timing and per-game button chords
    theme.ts      Theme JSON → colours
    combos.ts     File format read/write
  store/        App state, undo/redo, autosave
  components/   UI
  hooks/        Gamepad and keyboard
```

Per-game controller chords (Tekken 1+2 and so on) are data in `core/input.ts`
(`INPUT_PROFILES`), not code, so adding a game means adding an entry.
