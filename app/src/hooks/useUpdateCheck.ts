import { useEffect } from 'react'
import { useStore } from '../store/useStore'
import { checkForUpdate, installUpdate, type UpdateInfo } from '../updates'

/** Offers to update, then downloads and restarts. Shared by the launch check and Settings. */
export function offerUpdate(info: UpdateInfo) {
  const { notify } = useStore.getState()
  notify(`A new version of ComboTracker is ready (build ${info.build}).`, 'info', {
    label: 'Update now',
    linger: true,
    run: () => {
      notify('Downloading the update… ComboTracker restarts by itself when it’s done.')
      installUpdate(info).catch((e) => notify(String(e), 'error'))
    },
  })
}

/** Checks GitHub for a newer build a few seconds after launch (desktop builds from GitHub only). */
export function useUpdateCheck() {
  const enabled = useStore((s) => s.settings.updateCheck ?? true)
  useEffect(() => {
    if (!enabled) return
    const t = setTimeout(() => {
      checkForUpdate()
        .then((info) => info && offerUpdate(info))
        .catch(() => {
          // Offline or rate-limited: try again next launch.
        })
    }, 5000)
    return () => clearTimeout(t)
  }, [enabled])
}
