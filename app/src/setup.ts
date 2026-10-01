// Whether to show first-run setup: only for people who've never used the app.
const SETUP_KEY = 'combotracker:setup-done'

export function needsSetup(): boolean {
  try {
    if (localStorage.getItem(SETUP_KEY)) return false
    // People upgrading from an earlier version already have their own setup.
    if (localStorage.getItem('combotracker:v1')) {
      markSetupDone()
      return false
    }
    return true
  } catch {
    return false
  }
}

export function markSetupDone() {
  try {
    localStorage.setItem(SETUP_KEY, '1')
  } catch {
    // Setup would show again next time; harmless.
  }
}
