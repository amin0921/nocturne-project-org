// Capture a wide strip covering several row dividers, no hover anywhere.
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
  return r.result.value
}

await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 300, y: 400 })
await new Promise((r) => setTimeout(r, 250))

// Geometry: trash button (all rows share x), table container right edge, first rows' divider ys.
const geo = await evalJs(`(() => {
  const btn = [...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') || '').includes('from library'));
  const r = btn.getBoundingClientRect();
  const rows = [...document.querySelectorAll('tbody tr')].slice(0, 4).map(tr => Math.round(tr.getBoundingClientRect().bottom));
  const cont = btn.closest('[role=grid]');
  const cr = cont.getBoundingClientRect();
  return JSON.stringify({ btnX: Math.round(r.x), btnW: Math.round(r.width), rowBottoms: rows, contRight: Math.round(cr.right), contLeft: Math.round(cr.left) });
})()`)
console.log('geometry: ' + geo)
const g = JSON.parse(geo)

// Capture the strip from just above the first row divider to below the third.
const top = g.rowBottoms[0] - 24
const height = (g.rowBottoms[2] - g.rowBottoms[0]) + 48
const shot = await send('Page.captureScreenshot', {
  format: 'png',
  clip: { x: g.contLeft, y: top, width: Math.min(g.contRight - g.contLeft, 960), height, scale: 3 }
})
const { writeFileSync } = await import('node:fs')
writeFileSync('divider-strip.png', Buffer.from(shot.data, 'base64'))
console.log('strip saved: divider-strip.png  (x from ' + g.contLeft + ', y from ' + top + ', scale 3)')
console.log('divider ys in CSS px: ' + g.rowBottoms.join(', ') + '  -> in image px (y*3 - ' + top * 3 + '): ' + g.rowBottoms.map((y) => y * 3 - top * 3).join(', '))
ws.close()
process.exit(0)
