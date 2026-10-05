// Live experiments: hover row2's trash, then pixel-check the divider above it
// under different injected styles for the actions cell.
const list = await (await fetch('http://127.0.0.1:9223/json/list')).json()
const pages = list.filter((t) => t.type === 'page' && t.url.includes('tauri.localhost'))
const ws = new WebSocket(pages[0].webSocketDebuggerUrl)
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
const evalJs = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'page exception')
  return r.result.value
}

// row2 = first data row; trash at (897, 195); divider above it at y=167.
const hover = async () => {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 500, y: 195 })
  await new Promise((r) => setTimeout(r, 120))
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 897, y: 195 })
  await new Promise((r) => setTimeout(r, 300))
}
const shot = async (name) => {
  const s = await send('Page.captureScreenshot', { format: 'png', clip: { x: 850, y: 160, width: 80, height: 16, scale: 3 } })
  const { writeFileSync } = await import('node:fs')
  writeFileSync(name, Buffer.from(s.data, 'base64'))
}
const dividerTrace = () => evalJs(`(() => {
  // Read back pixels via canvas is impossible (no paint readback) — screenshot is handled outside.
  return 'hovered';
})()`)

const inject = (css) => evalJs(`(() => {
  document.getElementById('exp-divider')?.remove();
  if (${JSON.stringify(css)} !== '') {
    const s = document.createElement('style');
    s.id = 'exp-divider';
    s.textContent = ${JSON.stringify(css)};
    document.head.appendChild(s);
  }
  return 'style set';
})()`)

// Baseline (current shipped state): overflow-visible, no z-index.
await hover()
await shot('exp-A0-baseline.png')
console.log('A0 baseline captured (overflow-visible)')

// E-A: force the actions cell back to overflow-hidden.
await inject('td[data-colkey="actions"], tr td:last-child { overflow: hidden !important; }')
await hover()
await shot('exp-A1-hidden.png')
console.log('A1 captured (overflow hidden)')

// E-B: overflow-visible + stacking context on the td.
await inject('tr td:last-child { overflow: visible !important; position: relative; z-index: 0; }')
await hover()
await shot('exp-B0-visible-z0.png')
console.log('B0 captured (visible + z-index 0)')

// E-C: overflow-visible + isolation isolate on the td.
await inject('tr td:last-child { overflow: visible !important; isolation: isolate; }')
await hover()
await shot('exp-C0-isolation.png')
console.log('C0 captured (isolation)')

await inject('')
console.log('experiment styles removed')
ws.close()
process.exit(0)
