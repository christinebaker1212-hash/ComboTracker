// Small shared building blocks for dialogs and forms.
import { X } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode } from 'react'

export function Modal({ title, subtitle, onClose, children, footer, wide }: {
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  wide?: boolean | 'xl'
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    ref.current?.querySelector<HTMLElement>('input, select, button:not(.modal-close)')?.focus({ preventScroll: true })
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className={`modal${wide === 'xl' ? ' modal-xl' : wide ? ' modal-wide' : ''}`} role="dialog" aria-modal aria-label={title}>
        <header className="modal-head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p className="modal-sub">{subtitle}</p>}
          </div>
          <button className="icon-btn modal-close" onClick={onClose} title="Close (Esc)"><X size={18} /></button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  )
}

const HEX = /^#[0-9a-f]{6}$/i

export function ColorField({ label, value, onChange, hint, allowEmpty }: {
  label: string
  value: string
  onChange: (v: string) => void
  hint?: string
  /** Shows a "Use theme" option that clears the value. */
  allowEmpty?: boolean
}) {
  const id = useId()
  return (
    <div className="color-field">
      <label htmlFor={id} className="color-swatch" style={{ background: HEX.test(value) ? value : 'transparent' }}>
        <input
          id={id}
          type="color"
          value={HEX.test(value) ? value : '#888888'}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
        />
      </label>
      <div className="color-meta">
        <span className="field-label">{label}</span>
        {hint && <span className="field-hint">{hint}</span>}
      </div>
      <input
        className="input input-hex"
        value={value}
        placeholder={allowEmpty ? 'Theme' : '#000000'}
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
        aria-label={`${label} hex colour`}
      />
      {allowEmpty && value && (
        <button type="button" className="btn btn-small" onClick={() => onChange('')} title="Use the theme colour">Reset</button>
      )}
    </div>
  )
}

export function Toggle({ label, hint, checked, onChange }: {
  label: string
  hint?: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track" aria-hidden />
      <span className="toggle-text">
        <span>{label}</span>
        {hint && <span className="field-hint">{hint}</span>}
      </span>
    </label>
  )
}

export function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T
  options: { value: T; label: string; hint?: string }[]
  onChange: (v: T) => void
  label?: string
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={value === o.value ? 'is-active' : ''}
          title={o.hint}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
