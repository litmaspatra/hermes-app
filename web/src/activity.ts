// Live "what is Hermes doing" feed for the banner: polls the plugin's /activity while the app is open.
// It covers work the chat stream doesn't show, e.g. the background memory/skills review after a reply.
import { api } from './api'
import { loadSessionsSoon } from './gateway'
import { getState, setState, type ActivityItem } from './store'

let timer: ReturnType<typeof setInterval> | null = null

async function poll(): Promise<void> {
  if (document.visibilityState !== 'visible' || getState().conn !== 'open') return
  try {
    const r = await api<{ items: ActivityItem[] }>('GET', '/api/plugins/hermes-mobile/activity')
    const items = r.items ?? []
    const before = getState().activity
    if (JSON.stringify(items) !== JSON.stringify(before)) {
      setState({ activity: items })
      // A chat stopped working (its reply is in): refresh the list so its unread dot and time show.
      if (before.some(b => !items.some(i => i.session === b.session))) loadSessionsSoon()
    }
  } catch {
    /* keep the last value; the connection banner covers outages */
  }
}

export function startActivityPolling(): void {
  if (timer) return
  void poll()
  // Every 3 s while something is going on, every 9 s while the feed is empty.
  let tick = 0
  timer = setInterval(() => {
    tick++
    if (getState().activity.length || getState().active?.running || tick % 3 === 0) void poll()
  }, 3000)
  document.addEventListener('visibilitychange', () => void poll())
}
