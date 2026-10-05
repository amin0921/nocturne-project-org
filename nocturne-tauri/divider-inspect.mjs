// Divider inspection: screenshot + elementsFromPoint along the divider above a track row.
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

// Mouse away from any row so we sample the at-rest state.
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 300, y: 400 })
await new Promise((r) => setTimeout(r, 250))

// What paints at the divider line (y=167) over the trash icon vs far left?
const stack = await evalJs(`(() => {
  const probe = (px, py) => document.elementsFromPoint(px, py).slice(0, 6).map(el => {
    const cs = getComputedStyle(el);
    return el.tagName + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ').slice(0, 4).join('.') : '') + ' [bg=' + cs.backgroundColor + ', borderB=' + cs.borderBottomWidth + ' ' + cs.borderBottomColor + ']';
  });
  return JSON.stringify({
    overTrash: probe(897, 167),
    midRow: probe(500, 167),
    overTrash2: probe(897, 166),
    overTrash3: probe(897, 168)
  }, null, 1);
})()`)
console.log('elementsFromPoint stacks:\n' + stack)

// Screenshot of the divider region above the trash icon (2x for clarity).
const shot = await send('Page.captureScreenshot', {
  format: 'png',
  clip: { x: 640, y: 130, width: 300, height: 80, scale: 3 }
})
const { writeFileSync } = await import('node:fs')
writeFileSync('divider-before.png', Buffer.from(shot.data, 'base64'))
console.log('screenshot saved: divider-before.png')
ws.close()
process.exit(0)
