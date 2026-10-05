// Hover the trash button of row 2 and capture the divider ABOVE it (y=223).
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
// Row 2 spans y 223-279; button centered at (897, 251).
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 500, y: 251 })
await new Promise((r) => setTimeout(r, 150))
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 897, y: 251 })
await new Promise((r) => setTimeout(r, 400))
const shot = await send('Page.captureScreenshot', {
  format: 'png',
  clip: { x: 89, y: 190, width: 838, height: 120, scale: 3 }
})
const { writeFileSync } = await import('node:fs')
writeFileSync('divider-hover.png', Buffer.from(shot.data, 'base64'))
console.log('saved divider-hover.png (y CSS 190-310, divider row2-top at image y=(223-190)*3=99, row2-bottom at 267)')
ws.close()
process.exit(0)
