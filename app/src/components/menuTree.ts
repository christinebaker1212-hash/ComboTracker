import type { ReactNode } from 'react'

export interface MenuItem {
  label: string
  onSelect?: () => void
  children?: MenuItem[]
  /** undefined: plain command; true/false: a radio-style choice. */
  checked?: boolean
  hint?: string
  icon?: ReactNode
  separator?: boolean
  keepOpen?: boolean
}

export const SEPARATOR: MenuItem = { label: '', separator: true }

/** Builds a nested menu from "Folder/Sub/File.json" paths. */
export function treeFromPaths(paths: string[], onSelect: (path: string) => void, isChecked?: (p: string) => boolean): MenuItem[] {
  const root: MenuItem[] = []
  for (const path of paths) {
    const parts = path.split('/')
    let level = root
    parts.slice(0, -1).forEach((folder) => {
      let node = level.find((n) => n.label === folder && n.children)
      if (!node) {
        node = { label: folder, children: [] }
        level.push(node)
      }
      level = node.children!
    })
    level.push({
      label: parts.at(-1)!.replace(/\.json$/i, ''),
      onSelect: () => onSelect(path),
      checked: isChecked ? isChecked(path) : undefined,
    })
  }
  // Folders first, then files, alphabetically.
  const sort = (items: MenuItem[]) => {
    items.sort((a, b) => Number(!a.children) - Number(!b.children) || a.label.localeCompare(b.label))
    items.forEach((i) => i.children && sort(i.children))
  }
  sort(root)
  return root
}
