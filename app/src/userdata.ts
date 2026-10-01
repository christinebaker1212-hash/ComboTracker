// The user's own content: themes, icon packs, controller layouts and combo
// presets they make or add. On desktop these are plain files in
// Documents/ComboTracker, so people can add, back up and share them by hand.
// In the browser they live in local storage.
import { isDesktop } from './platform'

export type UserKind = 'combos' | 'commandLists' | 'themes' | 'layouts' | 'glyphs'

const FOLDERS: Record<UserKind, string> = {
  combos: 'Presets/Combos',
  commandLists: 'Presets/Command Lists',
  themes: 'Presets/Themes',
  layouts: 'Presets/Layouts',
  glyphs: 'Icon Packs',
}

const ROOT = 'ComboTracker'
const storageKey = (kind: UserKind) => `combotracker:user:${kind}`

/** Turns a display name into a safe file name, keeping it readable. */
export const safeName = (name: string) =>
  // eslint-disable-next-line no-control-regex -- stripping control characters is the point
  name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Untitled'

// ---------- Browser implementation ----------
function readStore(kind: UserKind): Record<string, unknown> {
  try {
    return JSON.parse(localStorage.getItem(storageKey(kind)) ?? '{}')
  } catch {
    return {}
  }
}
function writeStore(kind: UserKind, data: Record<string, unknown>) {
  try {
    localStorage.setItem(storageKey(kind), JSON.stringify(data))
  } catch {
    throw new Error('Browser storage is full. Delete some saved items, or use the desktop app.')
  }
}

// ---------- Desktop implementation ----------
async function fs() {
  const mod = await import('@tauri-apps/plugin-fs')
  return { ...mod, base: { baseDir: mod.BaseDirectory.Document } }
}

async function walk(dir: string, prefix = ''): Promise<string[]> {
  const { readDir, exists, base } = await fs()
  if (!(await exists(dir, base))) return []
  const out: string[] = []
  for (const e of await readDir(dir, base)) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name
    if (e.isDirectory) out.push(...(await walk(`${dir}/${e.name}`, rel)))
    else if (e.name.toLowerCase().endsWith('.json')) out.push(rel)
  }
  return out
}

// ---------- Public API ----------

/** Relative paths ("Street Fighter 6/Ryu.json") of the user's items of a kind. */
export async function listUser(kind: UserKind): Promise<string[]> {
  if (!isDesktop) return Object.keys(readStore(kind)).sort()
  try {
    return (await walk(`${ROOT}/${FOLDERS[kind]}`)).sort()
  } catch {
    return []
  }
}

export async function readUser(kind: UserKind, path: string): Promise<unknown> {
  if (!isDesktop) {
    const v = readStore(kind)[path]
    if (v === undefined) throw new Error(`${path} no longer exists.`)
    return v
  }
  const { readTextFile, base } = await fs()
  return JSON.parse(await readTextFile(`${ROOT}/${FOLDERS[kind]}/${path}`, base))
}

export async function writeUser(kind: UserKind, path: string, data: unknown): Promise<void> {
  if (!isDesktop) {
    writeStore(kind, { ...readStore(kind), [path]: data })
    return
  }
  const { writeTextFile, mkdir, base } = await fs()
  const full = `${ROOT}/${FOLDERS[kind]}/${path}`
  await mkdir(full.split('/').slice(0, -1).join('/'), { ...base, recursive: true })
  await writeTextFile(full, JSON.stringify(data, null, 2), base)
}

export async function deleteUser(kind: UserKind, path: string): Promise<void> {
  if (!isDesktop) {
    const all = readStore(kind)
    delete all[path]
    writeStore(kind, all)
    return
  }
  const { remove, base } = await fs()
  await remove(`${ROOT}/${FOLDERS[kind]}/${path}`, base)
}

/** Desktop only: opens the ComboTracker folder in Explorer. */
export async function openUserFolder(kind?: UserKind): Promise<boolean> {
  if (!isDesktop) return false
  const { documentDir, join } = await import('@tauri-apps/api/path')
  const { mkdir, base } = await fs()
  const rel = kind ? `${ROOT}/${FOLDERS[kind]}` : ROOT
  await mkdir(rel, { ...base, recursive: true })
  const { openPath } = await import('@tauri-apps/plugin-opener')
  await openPath(await join(await documentDir(), ...rel.split('/')))
  return true
}

export const userFolderLabel = (kind?: UserKind) =>
  `Documents\\ComboTracker${kind ? `\\${FOLDERS[kind].replace(/\//g, '\\')}` : ''}`
