# ComboTracker (new app)

The modern rewrite of ComboTracker: React + TypeScript, running in the browser
or as a Windows desktop app built with Tauri. It covers everything the Python
app in the repo root did, plus practice mode, share codes and search.

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

## Desktop app (Windows)

The desktop build adds a real game overlay: pinned combos float see-through
and always on top, and can be locked so clicks pass through to the game.

**Get a build without installing anything:** every push that changes the app,
icons or presets builds it on GitHub and updates the
[`latest` release](https://github.com/christinebaker1212-hash/ComboTracker/releases/tag/latest), which has:

- `ComboTracker-windows-portable.zip`: one `.exe`, no install. Upload this to itch.io.
- `ComboTracker_x.y.z_x64-setup.exe`: a regular installer.

**Build it yourself:** install [Rust](https://rustup.rs), then in `app/` run
`npx tauri dev` (live-reloading app) or `npx tauri build`.

Overlays show over games running in **borderless windowed** mode, not
exclusive fullscreen.

## Using it

See the main [README](../README.md) for features and shortcuts; the app's **?**
button has a quick guide too.

## Layout

```
src/
  core/         Pure logic, no UI. Tested in core.test.ts.
    tokens.ts     Token names and labels (the JSON vocabulary)
    editor.ts     Combo editing rules (ported from the Python app)
    notation.ts   Typed notation → tokens
    glyphs.ts     Icon styles (built-in and user) and icon fallback rules
    input.ts      Controller timing, per-game chords, SC/SNK specials, custom mappings
    layouts.ts    Input viewer layouts
    practice.ts   Practice mode input checking
    share.ts      Share codes
    theme.ts      Theme JSON → colours
    combos.ts     File format read/write
  store/        App state (undo/redo, autosave), user library, open dialogs
  components/   UI: editor, dialogs, overlay and input viewer windows
  hooks/        Controller, keyboard, shared state for floating windows
  userdata.ts   The user's saved files (Documents\ComboTracker on desktop)
  platform.ts   Browser vs desktop differences (windows, files)
```

Per-game controller chords (Tekken 1+2 and so on) are data in `core/input.ts`
(`INPUT_PROFILES`), not code, so adding a game means adding an entry.
