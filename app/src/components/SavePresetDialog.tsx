import { useEffect, useState } from 'react'
import { loadManifest } from '../assets'
import { toComboFile } from '../core/combos'
import { isDesktop } from '../platform'
import { useLibrary } from '../store/useLibrary'
import { useStore } from '../store/useStore'
import { useUI } from '../store/useUI'
import { safeName, userFolderLabel, writeUser } from '../userdata'
import { Field, Modal, Segmented } from './ui'

/** Saves the current list into the user's own presets so it shows up in the Presets menu. */
export function SavePresetDialog() {
  const close = useUI((s) => s.close)
  const list = useStore((s) => s.lists[s.player])
  const glyph = useStore((s) => s.glyph)
  const notify = useStore((s) => s.notify)
  const refresh = useLibrary((s) => s.refresh)
  const user = useLibrary((s) => s.user)

  const [kind, setKind] = useState<'combos' | 'commandLists'>('combos')
  const [game, setGame] = useState('')
  const [name, setName] = useState('')
  const [games, setGames] = useState<string[]>([])

  useEffect(() => {
    void loadManifest().then((m) => {
      const folders = [...m.presets.combos, ...m.presets.commandLists, ...user.combos, ...user.commandLists]
        .filter((p) => p.includes('/'))
        .map((p) => p.split('/')[0])
      setGames([...new Set(folders)].sort())
    })
  }, [user])

  const path = `${game.trim() ? `${safeName(game)}/` : ''}${safeName(name)}.json`
  const exists = user[kind].includes(path)

  const save = async () => {
    try {
      await writeUser(kind, path, toComboFile(list, glyph.name))
      await refresh(kind)
      notify(`Saved "${safeName(name)}". Find it under Presets → ${kind === 'combos' ? 'Combos' : 'Command lists'}.`)
      close()
    } catch (e) {
      notify(`Couldn't save: ${e instanceof Error ? e.message : e}`, 'error')
    }
  }

  return (
    <Modal
      title="Save as preset"
      subtitle={`Adds this list (${list.length} combos) to your Presets menu${isDesktop ? `. Saved in ${userFolderLabel(kind)}` : ''}.`}
      onClose={close}
      footer={<><span className="spacer" /><button className="btn" onClick={close}>Cancel</button><button className="btn btn-accent" disabled={!name.trim()} onClick={save}>{exists ? 'Replace' : 'Save'}</button></>}
    >
      <Field label="Type">
        <Segmented value={kind} onChange={setKind} options={[{ value: 'combos', label: 'Combos' }, { value: 'commandLists', label: 'Command list' }]} />
      </Field>
      <Field label="Game" hint="Presets are grouped by game. Leave empty to keep it at the top level.">
        <input className="input" list="preset-games" value={game} onChange={(e) => setGame(e.target.value)} placeholder="e.g. Street Fighter 6" />
        <datalist id="preset-games">{games.map((g) => <option key={g} value={g} />)}</datalist>
      </Field>
      <Field label="Name">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ken – BnBs" autoFocus />
      </Field>
      {exists && <p className="notice notice-warn">You already have a preset with this name. Saving will replace it.</p>}
    </Modal>
  )
}
