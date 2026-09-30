// Copies the repo's shared icons/ and Presets/ folders into public/ and writes a
// manifest the app uses to discover them. Icons are lowercased so lookups are
// case-insensitive on every platform, matching the original desktop app.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const appDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const repoDir = join(appDir, '..')
const publicDir = join(appDir, 'public')

function walk(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })
}

const toPosix = (p) => p.split(sep).join('/')

// --- Icons ---
const iconsOut = join(publicDir, 'icons')
rmSync(iconsOut, { recursive: true, force: true })
mkdirSync(iconsOut, { recursive: true })
const icons = []
for (const file of walk(join(repoDir, 'icons'))) {
  if (!file.toLowerCase().endsWith('.png')) continue
  const key = file.split(sep).pop().slice(0, -4).toLowerCase()
  cpSync(file, join(iconsOut, `${key}.png`))
  icons.push(key)
}

// --- Presets ---
const presetsSrc = join(repoDir, 'Presets')
const presetsOut = join(publicDir, 'presets')
rmSync(presetsOut, { recursive: true, force: true })
if (existsSync(presetsSrc)) cpSync(presetsSrc, presetsOut, { recursive: true })

const listPresets = (sub) =>
  walk(join(presetsSrc, sub))
    .filter((f) => f.toLowerCase().endsWith('.json'))
    .map((f) => toPosix(relative(join(presetsSrc, sub), f)))
    .sort()

const manifest = {
  icons: icons.sort(),
  presets: {
    combos: listPresets('Combos'),
    commandLists: listPresets('Command Lists'),
    themes: listPresets('Themes'),
    layouts: listPresets('Layouts'),
  },
}
writeFileSync(join(publicDir, 'manifest.json'), JSON.stringify(manifest))
console.log(
  `synced ${icons.length} icons, ${Object.values(manifest.presets).flat().length} presets`,
)
