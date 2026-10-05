// One-off verification: Cinema Stage bottom transport bar centering.
// Opens the stage (F key), measures .stage-chrome geometry vs stage viewport
// at multiple emulated viewport sizes, and under emulated prefers-reduced-motion.
// Captures screenshots for visual review. No dependencies (Node >= 22).

const list = await (await fetch('http://127.0.0.1:9223/json/list')).json()
const page = list.find((t) => t.type === 'page')
if (!page) { console.error('no page target'); process.exit(1) }

const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })

let seq = 0
const pending = new Map()
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data)
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id) }
}
const send = (method, params = {}) => {
  const id = ++seq
  ws.send(JSON.stringify({ id, method, params }))
  return new Promise((res, rej) => {
    pending.set(id, (m) => (m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result)))
  })
}
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'page exception')
  return r.result.value
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Open Cinema Stage with an F keydown (bubbles to the window listener in App.tsx)
await evaluate(`(() => {
  const stageOpen = !!document.querySelector('.cinema-stage')
  if (!stageOpen) {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', bubbles: true }))
  }
  return { wasOpen: stageOpen }
})()`)
await sleep(800)

const measureExpr = `(() => {
  const stage = document.querySelector('.cinema-stage')
  const chrome = document.querySelector('.stage-chrome')
  if (!stage || !chrome) return { stage: null, chrome: null }
  const s = stage.getBoundingClientRect()
  const c = chrome.getBoundingClientRect()
  const cs = getComputedStyle(chrome)
  return {
    stage: { w: s.width, h: s.height },
    chrome: { left: c.left, right: c.right, width: c.width, height: c.height,
              centerX: c.left + c.width / 2 },
    stageCenterX: s.left + s.width / 2,
    offsetFromCenter: (c.left + c.width / 2) - (s.left + s.width / 2),
    computed: { left: cs.left, right: cs.right, transform: cs.transform, width: cs.width,
                visibility: cs.visibility, opacity: cs.opacity }
  }
})()`

const shot = async (name) => {
  // Reset the 2s idle timer right before capture so chrome is visible.
  await evaluate(`window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 10, clientY: 10 }))`)
  await sleep(120)
  const { data } = await send('Page.captureScreenshot', { format: 'png' })
  const { writeFileSync } = await import('node:fs')
  writeFileSync(`${process.cwd()}/${name}`, Buffer.from(data, 'base64'))
  console.log(`screenshot -> ${name}`)
}

// --- 1. Default (no emulation) at the real window size ---
console.log('== real window size ==')
console.log(JSON.stringify(await evaluate(measureExpr)))

// --- 2. Emulated viewports: 1080p, 1440p, 4K ---
for (const [w, h, label] of [[1280, 720, '720p'], [1920, 1080, '1080p'], [2560, 1440, '1440p'], [3840, 2160, '4K']]) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false })
  await sleep(400)
  const m = await evaluate(measureExpr)
  console.log(`== ${label} ${w}x${h} ==`)
  console.log(JSON.stringify(m))
  if (label === '1080p') await shot('cinema-centered-1080p.png')
}

// --- 3. prefers-reduced-motion: reduce (the case that used to break centering) ---
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
await sleep(300)
console.log('== 1080p + prefers-reduced-motion: reduce ==')
const rm = await evaluate(measureExpr)
console.log(JSON.stringify(rm))
await shot('cinema-centered-1080p-reduced-motion.png')

// cleanup emulation
await send('Emulation.setEmulatedMedia', { features: [] })
await send('Emulation.clearDeviceMetricsOverride')
ws.close()
process.exit(0)
