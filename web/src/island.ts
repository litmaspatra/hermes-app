import { sharedItem } from './bridge'
import { attachFile, errText, sendPrompt, startDraft } from './gateway'
import { whenOnline, toFile } from './share'
import { setState, toast } from './store'

declare global {
  interface Window {
    hermesIsland?: (count: number, text: string) => 'y'
  }
}

async function submit(count: number, text: string): Promise<void> {
  try {
    if (!(await whenOnline(60_000))) throw new Error('Hermes is offline')
    setState({ screen: null, sheet: null, drawer: false })
    startDraft()
    for (let i = 0; i < count; i++) {
      const item = sharedItem(i)
      if (!item.b64) throw new Error(`${item.name || 'Dropped file'}: ${item.error || 'unreadable'}`)
      await attachFile(toFile(item.b64, item.name || `drop-${i + 1}`, item.mime || 'application/octet-stream'))
    }
    await sendPrompt(text)
  } catch (error) {
    const message = errText(error)
    toast(message, 'error', 6000)
    ;(window.HermesAndroid as unknown as { islandFailed?: (text: string) => void } | undefined)?.islandFailed?.(text)
  }
}

// Native needs an immediate acknowledgement from evaluateJavascript; the asynchronous work continues here.
window.hermesIsland = (count: number, text: string) => {
  const prompt = String(text || '').trim()
  if (!prompt) return 'y'
  void submit(Math.max(0, Number(count) || 0), prompt)
  return 'y'
}
