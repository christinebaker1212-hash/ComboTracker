import { describe, expect, it } from 'vitest'
import { parseRelease } from './updates'

describe('updates', () => {
  it('reads the build number and exe link from the latest release', () => {
    const release = {
      name: 'ComboTracker 0.4.0 (build 42)',
      assets: [
        { name: 'ComboTracker-windows-portable.zip', browser_download_url: 'https://github.com/x/y/releases/download/latest/z.zip' },
        { name: 'ComboTracker.exe', browser_download_url: 'https://github.com/x/y/releases/download/latest/ComboTracker.exe' },
      ],
    }
    expect(parseRelease(release)).toEqual({ build: 42, url: 'https://github.com/x/y/releases/download/latest/ComboTracker.exe' })
  })

  it('ignores releases from before builds were numbered, or without the exe', () => {
    expect(parseRelease({ name: 'ComboTracker 0.4.0 (latest build)', assets: [] })).toBeNull()
    expect(parseRelease({ name: 'ComboTracker 0.4.0 (build 5)', assets: [{ name: 'other.zip', browser_download_url: 'x' }] })).toBeNull()
  })
})
