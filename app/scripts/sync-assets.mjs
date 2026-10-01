// Copies the repo's shared icons/ and Presets/ folders into public/ and writes a
// manifest the app uses to discover them. Icons are lowercased so lookups are
// case-insensitive on every platform, matching the original desktop app.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
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

// Not shipped in the app:
// - photos of real controllers (the app ships line-art tracings of them instead,
//   made by scripts/trace-controllers.py)
// - personal presets kept in any folder named "User"
const CONTROLLER_PHOTOS = new Set([
  'dreamcast', 'duke', 'gamecube', 'genesis3b', 'genesis6b', 'leverlessg13', 'n64', 'nes',
  'playstation', 'playstation5', 'qanba', 'snes', 'wiiupro', 'xboxone',
])
const isPersonal = (file) => relative(repoDir, file).split(sep).some((part) => part.toLowerCase() === 'user')

// --- Icons ---
const iconsOut = join(publicDir, 'icons')
rmSync(iconsOut, { recursive: true, force: true })
mkdirSync(iconsOut, { recursive: true })
const icons = []
for (const file of walk(join(repoDir, 'icons'))) {
  if (!file.toLowerCase().endsWith('.png')) continue
  const key = file.split(sep).pop().slice(0, -4).toLowerCase()
  if (CONTROLLER_PHOTOS.has(key) || isPersonal(file)) continue
  cpSync(file, join(iconsOut, `${key}.png`))
  icons.push(key)
}

// --- Controller tracings ---
// Tracings are 1.5x the source picture; layouts are positioned in source pixels.
const tracesSrc = join(appDir, 'assets', 'controllers')
const tracesOut = join(publicDir, 'controllers')
rmSync(tracesOut, { recursive: true, force: true })
mkdirSync(tracesOut, { recursive: true })
const controllers = {}
for (const file of walk(tracesSrc)) {
  if (!file.endsWith('.png')) continue
  const key = file.split(sep).pop().slice(0, -4)
  const png = readFileSync(file)
  const w = png.readUInt32BE(16)
  const h = png.readUInt32BE(20)
  cpSync(file, join(tracesOut, `${key}.png`))
  controllers[key] = [Math.round(w / 1.5), Math.round(h / 1.5)]
}

// --- Presets ---
const presetsSrc = join(repoDir, 'Presets')
const presetsOut = join(publicDir, 'presets')
rmSync(presetsOut, { recursive: true, force: true })
if (existsSync(presetsSrc)) cpSync(presetsSrc, presetsOut, { recursive: true, filter: (src) => !isPersonal(src) })

const listPresets = (sub) =>
  walk(join(presetsSrc, sub))
    .filter((f) => f.toLowerCase().endsWith('.json') && !isPersonal(f))
    .map((f) => toPosix(relative(join(presetsSrc, sub), f)))
    .sort()

const manifest = {
  icons: icons.sort(),
  controllers,
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
