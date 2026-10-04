// Backend health for the header dot and the status card: gateway WebSocket state (store.conn),
// round-trip ping, and the dashboard's own /api/status (dashboard/storage health, memory/disk pressure). Polled while connected so the dot turns amber when Hermes degrades.
import { api } from './api'
import { rpc } from './gateway'
import { getState, setState } from './store'

export interface Health {
  checkedAt: number
  pingMs: number | null
  version?: string
  overall?: string
  active_agents?: number
  components?: Record<string, { status?: string }>
  memory?: { pressure?: string; system_available_mb?: number; swap_used_mb?: number }
  disk?: { pressure?: string; free_mb?: number }
  can_update_hermes?: boolean
  error?: string
}

let timer: ReturnType<typeof setInterval> | null = null

export async function checkHealth(): Promise<Health> {
  const h: Health = { checkedAt: Date.now(), pingMs: null }
  if (getState().conn === 'open') {
    const t = performance.now()
    try {
      await rpc('gateway.ping', {}, 8000)
      h.pingMs = Math.round(performance.now() - t)
    } catch {
      /* shown as no ping */
    }
  }
  try {
    // Machine-wide status (one host gateway serves every profile), not the open profile's view.
    Object.assign(h, await api<Partial<Health>>('GET', '/api/status', undefined, { profile: false }))
  } catch (e) {
    h.error = e instanceof Error ? e.message : String(e)
  }
  setState({ health: h })
  return h
}

/** Poll every minute while the app runs (cheap: one ping + one local GET). */
export function startHealthPolling(): void {
  if (timer) return
  void checkHealth()
  timer = setInterval(() => {
    if (!document.hidden) void checkHealth()
  }, 60_000)
}

export type Dot = 'ok' | 'warn' | 'err' | 'wait'

export function dotState(conn: string, h: Health | null): Dot {
  if (conn === 'connecting' || conn === 'idle') return 'wait'
  if (conn !== 'open') return 'err'
  // This app is the only front end, so the messaging gateway / Telegram etc. don't count: the dashboard's
  // own "overall" folds them in and would stay amber forever. Judge only what the app needs.
  if (h) {
    const bad = (s?: string) => Boolean(s) && !['ok', 'unknown'].includes(s as string)
    if (h.error || bad(h.components?.dashboard?.status) || bad(h.components?.storage?.status)) return 'warn'
    if (h.disk?.pressure === 'critical' || h.memory?.pressure === 'critical') return 'warn'
  }
  return 'ok'
}
