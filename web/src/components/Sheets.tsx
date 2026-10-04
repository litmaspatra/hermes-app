import { useEffect, useMemo, useState } from 'react'
import type { CommandsCatalogResult, ModelOptionsResult, RollbackDiffResult, RollbackListResult, RollbackRestoreResult } from '@hermes/shared/gateway-contract.generated'
import { REASONING_EFFORT_VALUES } from '@hermes/shared/reasoning-effort'
import { deleteSession, errText, reconnectNow, renameSession, renameStored, resumeSession, rpc, setModel, setReasoning, undoLast } from '../gateway'
import { openCanvas, useCanvas } from '../canvas'
import { confirmDialog } from '../dialog'
import { Title, keepBranch, plainTitle } from './Title'
import { autoReadFor, hasChatOverride, setAutoReadFor, setDraftRead, useAutoRead, useDraftAutoRead } from '../voice'
import { checkHealth, dotState, type Health } from '../health'
import { setState, toast, useStore } from '../store'
import { copyText, haptic, shareText } from '../bridge'
import { chatMarkdown } from '../export'
import { useSheetDrag } from './useSheetDrag'
import { DiffView } from './Diff'
import { useBackHandler } from '../backstack'

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  const drag = useSheetDrag(() => setState({ sheet: null }))
  return (
    <div className="sheet-backdrop" onClick={() => setState({ sheet: null })}>
      <div className="sheet tall" role="dialog" ref={drag.ref} {...drag.bind} onClick={e => e.stopPropagation()}>
        <div className="sheet-grip" />
        <div className="sheet-title">{title}</div>
        {children}
      </div>
    </div>
  )
}

export function ModelSheet() {
  const active = useStore(s => s.active)
  const [data, setData] = useState<ModelOptionsResult | null>(null)
  const [q, setQ] = useState('')
  const [err, setErr] = useState('')
  useEffect(() => {
    // A plain open reads Hermes's disk cache of each provider's catalog (stale after a new login or new models):
    // show it at once, then swap in the live list.
    let gone = false
    rpc<ModelOptionsResult>('model.options', { session_id: active?.runtimeId })
      .then(r => !gone && setData(r))
      .catch(e => setErr(errText(e)))
    rpc<ModelOptionsResult>('model.options', { session_id: active?.runtimeId, refresh: true })
      .then(r => !gone && setData(r))
      .catch(() => {})
    return () => {
      gone = true
    }
  }, [active?.runtimeId])
  const currentModel = active?.info.model || data?.model
  const currentProvider = active?.info.provider || data?.provider
  const effort = active?.info.reasoning_effort || 'medium'
  const providers = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return (data?.providers || [])
      .filter(p => p.authenticated !== false || p.is_current)
      .map(p => ({ ...p, models: (p.models || []).filter(m => !needle || m.toLowerCase().includes(needle) || p.name.toLowerCase().includes(needle)) }))
      .filter(p => p.models.length)
      .sort((a, b) => Number(Boolean(b.is_current) || b.slug === currentProvider?.replace(/^custom:/, '')) - Number(Boolean(a.is_current) || a.slug === currentProvider?.replace(/^custom:/, '')))
  }, [data, q, currentProvider])
  return (
    <Shell title="Model">
      <div className="effort-row">
        {REASONING_EFFORT_VALUES.map(e => (
          <button
            key={e}
            className={`pill${e === effort ? ' on' : ''}`}
            onClick={() => {
              haptic()
              setReasoning(e).catch(x => toast(errText(x), 'error'))
            }}
          >
            {e}
          </button>
        ))}
      </div>
      <input className="search" placeholder="Search models…" value={q} onChange={e => setQ(e.target.value)} />
      <div className="sheet-scroll">
        {err && <div className="notice notice-error">{err}</div>}
        {!data && !err && <div className="dim pad">Loading models…</div>}
        {providers.map(p => (
          <div key={p.slug} className="group">
            <div className="group-title">
              {p.name}
              {p.free_tier ? <span className="tag">free</span> : null}
            </div>
            {p.models.map(m => {
              const on = m === currentModel && (p.slug === currentProvider || `custom:${p.slug}` === currentProvider)
              return (
                <button
                  key={m}
                  className={`row${on ? ' on' : ''}`}
                  onClick={() => {
                    haptic()
                    // A new chat's switch waits for its agent (~2 s); a send meanwhile waits for the switch.
                    setState({ sheet: null })
                    setModel(p.slug, m).catch(x => toast(errText(x), 'error'))
                  }}
                >
                  {on ? '● ' : ''}
                  {m}
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </Shell>
  )
}

export function CommandsSheet({ onPick }: { onPick: (cmd: string) => void }) {
  const [data, setData] = useState<CommandsCatalogResult | null>(null)
  const [q, setQ] = useState('')
  useEffect(() => {
    rpc<CommandsCatalogResult>('commands.catalog').then(setData).catch(e => toast(errText(e), 'error'))
  }, [])
  const needle = q.trim().toLowerCase()
  const cats = (data?.categories || []).map(c => ({
    name: c.name,
    pairs: (c.pairs || []).filter(([cmd, desc]) => !needle || cmd.toLowerCase().includes(needle) || (desc || '').toLowerCase().includes(needle))
  }))
  const skills = Object.entries(data?.skills || {}).filter(([n]) => !needle || n.toLowerCase().includes(needle))
  return (
    <Shell title="Commands">
      <input className="search" placeholder="Search commands and skills…" value={q} onChange={e => setQ(e.target.value)} autoFocus />
      <div className="sheet-scroll">
        {!data && <div className="dim pad">Loading…</div>}
        {cats
          .filter(c => c.pairs.length)
          .map(c => (
            <div key={c.name} className="group">
              <div className="group-title">{c.name}</div>
              {c.pairs.map(([cmd, desc]) => (
                <button key={cmd} className="row cmd" onClick={() => onPick(cmd.startsWith('/') ? cmd : `/${cmd}`)}>
                  <span className="mono">{cmd.startsWith('/') ? cmd : `/${cmd}`}</span>
                  <span className="dim">{desc}</span>
                </button>
              ))}
            </div>
          ))}
        {skills.length > 0 && (
          <div className="group">
            <div className="group-title">Skills ({skills.length})</div>
            {skills.slice(0, 200).map(([name, meta]) => (
              <button key={name} className="row cmd" onClick={() => onPick(`/${name.replace(/^\/+/, '')}`)}>
                <span className="mono">/{name.replace(/^\/+/, '')}</span>
                <span className="dim">{String((meta as { description?: string })?.description || '')}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </Shell>
  )
}

/** The header ⋮: things you can do to this chat (rename, pin, archive, undo, details, delete). */
export function ChatMenuSheet() {
  const active = useStore(s => s.active)
  const running = useStore(s => s.active?.running ?? false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(plainTitle(active?.title))
  const drag = useSheetDrag(() => setState({ sheet: null }))
  const reading = useAutoRead(active?.storedId)
  const canvasCount = useCanvas(c => c.docs.length)
  if (!active) return null
  const id = active.storedId
  const close = () => setState({ sheet: null })
  const act = (fn: () => void) => () => {
    haptic()
    close()
    fn()
  }
  return (
    <div className="sheet-backdrop" onClick={close}>
      <div className="sheet session-menu" role="dialog" ref={drag.ref} {...drag.bind} onClick={e => e.stopPropagation()}>
        <div className="sheet-grip" />
        <div className="sheet-title session-menu-title">
          <Title text={active.title} fallback="New chat" />
        </div>
        {editing ? (
          <form
            className="rename-row"
            onSubmit={e => {
              e.preventDefault()
              close()
              renameStored(id, keepBranch(active.title, draft.trim()))
                .then(() => toast('Renamed'))
                .catch(err => toast(errText(err), 'error'))
            }}
          >
            <input autoFocus value={draft} onChange={e => setDraft(e.target.value)} placeholder="Chat title" />
            <button className="btn" type="submit">
              Save
            </button>
          </form>
        ) : (
          <div className="menu-list">
            <button className="menu-item" onClick={act(() => setState({ find: { q: '', i: 0 } }))}>
              <span className="mi-icon">🔍</span>
              Search in chat
            </button>
            <button className="menu-item" onClick={() => setEditing(true)}>
              <span className="mi-icon">✏️</span>
              Rename
            </button>
            <button
              className="menu-item"
              onClick={act(() => {
                setAutoReadFor(id, !reading)
                toast(!reading ? 'Reading every reply aloud in this chat' : 'Read-aloud off for this chat')
              })}
            >
              <span className="mi-icon gold">🔊</span>
              <span className="mi-text">
                Read every reply aloud
                <span className="mi-sub">
                  {reading ? 'On' : 'Off'}
                  {hasChatOverride(id) ? ' · this chat only' : autoReadFor(id) ? ' · all chats' : ''}
                </span>
              </span>
            </button>
            <button className="menu-item" onClick={act(() => openCanvas())}>
              <span className="mi-icon gold">🗒</span>
              <span className="mi-text">
                Canvas
                <span className="mi-sub">{canvasCount ? `${canvasCount} document${canvasCount === 1 ? '' : 's'}` : 'Documents, notes and pages beside the chat'}</span>
              </span>
            </button>
            <button
              className="menu-item"
              onClick={act(() => {
                if (!shareText(plainTitle(active.title) || 'Chat', chatMarkdown(active))) toast('Copied as Markdown (sharing works in the phone app)')
              })}
            >
              <span className="mi-icon">📤</span>
              <span className="mi-text">
                Share chat
                <span className="mi-sub">As Markdown, to any app</span>
              </span>
            </button>
            <button className="menu-item" onClick={() => setState({ sheet: 'rollback' })}>
              <span className="mi-icon">⏪</span>
              <span className="mi-text">
                File checkpoints
                <span className="mi-sub">See and undo Hermes's file changes</span>
              </span>
            </button>
            <button className="menu-item" disabled={running} onClick={act(() => void undoLast())}>
              <span className="mi-icon">↶</span>
              Undo last turn
            </button>
            <button className="menu-item" onClick={() => setState({ sheet: 'session-actions' })}>
              <span className="mi-icon">ℹ️</span>
              Chat details
            </button>
            <button
              className="menu-item danger"
              onClick={act(() => {
                void confirmDialog({ title: `Delete “${plainTitle(active.title) || 'this chat'}”?`, message: 'The whole conversation is removed. This cannot be undone.', danger: true }).then(ok => {
                  if (ok)
                    deleteSession(id)
                      .then(() => toast('Deleted'))
                      .catch(err => toast(errText(err), 'error'))
                })
              })}
            >
              <span className="mi-icon red">🗑</span>
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/** The header ⋮ on the empty new-chat screen: only what makes sense before the first message. */
export function DraftMenuSheet() {
  const reading = useDraftAutoRead()
  const drag = useSheetDrag(() => setState({ sheet: null }))
  const close = () => setState({ sheet: null })
  return (
    <div className="sheet-backdrop" onClick={close}>
      <div className="sheet session-menu" role="dialog" ref={drag.ref} {...drag.bind} onClick={e => e.stopPropagation()}>
        <div className="sheet-grip" />
        <div className="sheet-title session-menu-title">New chat</div>
        <div className="menu-list">
          <button
            className="menu-item"
            onClick={() => {
              haptic()
              close()
              setDraftRead(!reading)
              toast(!reading ? 'This chat will read every reply aloud' : 'Read-aloud off for this chat')
            }}
          >
            <span className="mi-icon gold">🔊</span>
            <span className="mi-text">
              Read every reply aloud
              <span className="mi-sub">{reading ? 'On' : 'Off'} · applies once the chat starts</span>
            </span>
          </button>
          <button className="menu-item" onClick={() => setState({ sheet: 'model' })}>
            <span className="mi-icon">🤖</span>
            Change model
          </button>
        </div>
        <div className="dim pad small">Rename, pin, archive and delete are available once you have sent a message.</div>
      </div>
    </div>
  )
}

/** Chat details (from the ⋮ menu): read-only facts. Rename / undo / delete live in the ⋮ menu itself. */
export function SessionActionsSheet() {
  const active = useStore(s => s.active)
  if (!active) return null
  const u = active.usage
  return (
    <Shell title="Chat details">
      <div className="sheet-scroll">
        <div className="kv">
          <div>Title</div>
          <div>{plainTitle(active.title) || '—'}</div>
          <div>Model</div>
          <div>{active.info.model || '—'}</div>
          <div>Provider</div>
          <div>{active.info.provider || '—'}</div>
          <div>Profile</div>
          <div>{active.profile}</div>
          <div>Working dir</div>
          <div className="mono small">{active.info.cwd || '—'}</div>
          {u && (
            <>
              <div>Tokens</div>
              <div>
                {(u.input ?? 0).toLocaleString()} in · {(u.output ?? 0).toLocaleString()} out
              </div>
              {u.context_percent != null && (
                <>
                  <div>Context</div>
                  <div>{Math.round(u.context_percent)}% used</div>
                </>
              )}
              {u.cost_usd != null && (
                <>
                  <div>Cost</div>
                  <div>${u.cost_usd.toFixed(4)}</div>
                </>
              )}
            </>
          )}
          <div>Session id</div>
          <button className="mono small link-like" onClick={() => void copyText(active.storedId).then(() => toast('Copied'))}>
            {active.storedId}
          </button>
        </div>
      </div>
    </Shell>
  )
}

// ── backend status ────────────────────────────────────────

const STATE_WORD: Record<string, string> = { error: 'Offline', closed: 'Offline', idle: 'Offline', connecting: 'Connecting', ok: 'OK', connected: 'Connected', running: 'Running', degraded: 'Degraded', fatal: 'Failed' }
const word = (s?: string) => (s ? STATE_WORD[s] || s.replace(/_/g, ' ') : '—')
const tone = (s?: string) => (!s ? '' : /^(ok|connected|running)$/.test(s) ? 'ok' : /fatal|error|down|stopped/.test(s) ? 'err' : 'warn')
const ago = (t: number) => {
  const s = Math.round((Date.now() - t) / 1000)
  return s < 5 ? 'just now' : s < 60 ? `${s}s ago` : `${Math.round(s / 60)} min ago`
}

function Row({ label, value, state, note }: { label: string; value: string; state?: string; note?: string | null }) {
  return (
    <div className="status-row">
      <span className={`conn-dot ${state || ''}`} />
      <div className="status-main">
        <div className="status-label">{label}</div>
        {note ? <div className="status-note">{note}</div> : null}
      </div>
      <div className="status-value">{value}</div>
    </div>
  )
}

export function StatusSheet() {
  const conn = useStore(s => s.conn)
  const detail = useStore(s => s.connDetail)
  const h = useStore(s => s.health) as Health | null
  const [busy, setBusy] = useState(false)
  const refresh = () => {
    setBusy(true)
    void checkHealth().finally(() => setBusy(false))
  }
  useEffect(refresh, [])
  const dot = dotState(conn, h)
  const headline =
    dot === 'ok' ? 'Everything is working' : dot === 'wait' ? 'Connecting to Hermes…' : dot === 'err' ? 'Hermes is offline' : 'Hermes is up, with problems'
  const mem = h?.memory
  return (
    <Shell title="Backend status">
      <div className="sheet-scroll">
        <div className={`status-hero ${dot}`}>
          <span className={`conn-dot big ${dot}`} />
          <div>
            <div className="status-headline">{headline}</div>
            <div className="dim small">
              {h ? `Checked ${ago(h.checkedAt)}` : 'Checking…'}
              {h?.version ? ` · Hermes v${h.version}` : ''}
            </div>
          </div>
        </div>
        <Row
          label="Connection"
          value={conn === 'open' ? (h?.pingMs != null ? `${h.pingMs} ms` : 'Connected') : word(conn)}
          state={conn === 'open' ? 'ok' : conn === 'connecting' ? 'wait' : 'err'}
          note={conn === 'open' ? 'Live link to Hermes on this phone' : detail || null}
        />
        <Row label="Dashboard" value={h?.error ? 'Unreachable' : word(h?.components?.dashboard?.status || (h ? 'ok' : undefined))} state={h?.error ? 'err' : tone(h?.components?.dashboard?.status || 'ok')} note={h?.error ? "Can't reach Hermes's dashboard on the phone" : null} />
        {h?.active_agents != null && <Row label="Agents running" value={String(h.active_agents)} state={h.active_agents ? 'wait' : 'ok'} />}
        {mem && (
          <Row
            label="Memory"
            value={mem.system_available_mb != null ? `${(mem.system_available_mb / 1024).toFixed(1)} GB free` : word(mem.pressure)}
            state={tone(mem.pressure)}
            note={mem.swap_used_mb ? `${(mem.swap_used_mb / 1024).toFixed(1)} GB swap in use` : null}
          />
        )}
        {h?.disk && <Row label="Storage" value={h.disk.free_mb != null ? `${Math.round(h.disk.free_mb / 1024)} GB free` : word(h.disk.pressure)} state={tone(h.disk.pressure)} />}
        <div className="sheet-actions col">
          <button className="btn primary" disabled={busy} onClick={refresh}>
            {busy ? 'Checking…' : 'Check again'}
          </button>
          <button
            className="btn"
            onClick={() => {
              haptic()
              reconnectNow()
              toast('Reconnecting…')
            }}
          >
            Reconnect / start Hermes
          </button>
        </div>
      </div>
    </Shell>
  )
}

const when = (ts?: string) => {
  if (!ts) return ''
  const d = new Date(/^\d+(\.\d+)?$/.test(ts) ? Number(ts) * 1000 : ts)
  return Number.isNaN(d.getTime()) ? ts : d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

/** Hermes snapshots the files it is about to change (checkpoints): list them, show what changed since, restore. */
export function RollbackSheet() {
  const a = useStore(s => s.active)
  const [data, setData] = useState<RollbackListResult | null>(null)
  const [err, setErr] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [diff, setDiff] = useState<RollbackDiffResult | null>(null)
  const [busy, setBusy] = useState(false)
  useBackHandler(() => setOpen(null), open != null)
  useEffect(() => {
    if (!a) return
    rpc<RollbackListResult>('rollback.list', { session_id: a.runtimeId })
      .then(setData)
      .catch(e => setErr(errText(e)))
  }, [a?.runtimeId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setDiff(null)
    if (!a || !open) return
    rpc<RollbackDiffResult>('rollback.diff', { session_id: a.runtimeId, hash: open })
      .then(setDiff)
      .catch(e => setDiff({ stat: errText(e) }))
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!a) return null
  const cps = data?.checkpoints ?? []
  const cp = cps.find(c => c.hash === open)
  const restore = async () => {
    if (!open || busy) return
    const ok = await confirmDialog({
      title: 'Restore files to this checkpoint?',
      message: 'Files Hermes changed after it go back to how they were, and the chat rewinds to that point. Changes you made yourself are kept.',
      confirmLabel: 'Restore',
      danger: true
    })
    if (!ok) return
    setBusy(true)
    try {
      const r = await rpc<RollbackRestoreResult>('rollback.restore', { session_id: a.runtimeId, hash: open }, 120_000)
      if (!r.success) throw new Error(r.error || r.reason || 'Restore failed')
      const n = r.restored_files?.length ?? 0
      const kept = r.skipped_user_edits?.length ?? 0
      toast(`Restored ${n} file${n === 1 ? '' : 's'}${kept ? ` · kept ${kept} you edited` : ''}`, kept ? 'warn' : 'info', 5000)
      setState({ sheet: null })
      if (r.history_removed) await resumeSession(a.storedId)
    } catch (e) {
      toast(errText(e), 'error')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Shell title={cp ? cp.message || 'Checkpoint' : 'File checkpoints'}>
      <div className="sheet-scroll">
        {err ? (
          <div className="dim pad">{err}</div>
        ) : !data ? (
          <div className="dim pad">
            <span className="spinner small" /> Loading…
          </div>
        ) : !data.enabled ? (
          <div className="dim pad">Checkpoints are off for app chats. Hermes takes them only when its backend starts with HERMES_TUI_CHECKPOINTS=1 (the profile's “checkpoints” setting applies to the terminal, not here).</div>
        ) : open ? (
          <>
            <button className="menu-item" onClick={() => setOpen(null)}>
              <span className="mi-icon">‹</span>
              All checkpoints
            </button>
            <div className="dim small pad">{when(cp?.timestamp)} · changed since then:</div>
            {!diff ? (
              <div className="dim pad">
                <span className="spinner small" /> Loading…
              </div>
            ) : (
              <>
                {diff.stat && <pre className="rollback-stat">{diff.stat}</pre>}
                {diff.diff ? <DiffView text={diff.diff} /> : !diff.stat && <div className="dim pad">No changes since this checkpoint.</div>}
              </>
            )}
            <button className="btn danger block rollback-go" disabled={busy} onClick={() => void restore()}>
              {busy ? 'Restoring…' : 'Restore files to this point'}
            </button>
          </>
        ) : cps.length === 0 ? (
          <div className="dim pad">No checkpoints yet. Hermes makes one before it changes files in this chat.</div>
        ) : (
          cps.map(c => (
            <button key={c.hash} className="menu-item" onClick={() => c.hash && setOpen(c.hash)}>
              <span className="mi-icon">⏺</span>
              <span className="mi-text">
                {c.message || (c.hash || '').slice(0, 8)}
                <span className="mi-sub">{when(c.timestamp)}</span>
              </span>
            </button>
          ))
        )}
      </div>
    </Shell>
  )
}
