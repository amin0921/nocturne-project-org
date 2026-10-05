// One-off hover verification for the Library trash-button tooltip.
// Moves the real mouse over a track row's remove button (Input domain),
// then reports tooltip visibility/geometry and captures a clipped screenshot.
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

// 1. Get the trash button rect (first "Remove ... from library" button).
const rect = await evalJs(`(() => {
  const btn = [...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') || '').includes('from library'));
  if (!btn) return null;
  btn.scrollIntoView({ block: 'center' });
  const r = btn.getBoundingClientRect();
  const td = btn.closest('td');
  const tdOverflow = td ? getComputedStyle(td).overflow : 'none';
  return JSON.stringify({ x: r.x, y: r.y, w: r.width, h: r.height, tdOverflow });
})()`)
console.log('button rect: ' + rect)
const { x, y, w, h, tdOverflow } = JSON.parse(rect)
if (tdOverflow !== 'visible') console.log('WARNING: td overflow is ' + tdOverflow)

// 2. Real mouse move onto the button (also pre-move nearby to settle hover state).
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(x - 40), y: Math.round(y + h / 2) })
await new Promise((r) => setTimeout(r, 120))
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(x + w / 2), y: Math.round(y + h / 2) })
await new Promise((r) => setTimeout(r, 350))

// 3. Tooltip state: visible? full bubble? does a point over its left half hit the bubble?
const probe = await evalJs(`(() => {
  const tip = document.querySelector('[role="tooltip"]');
  if (!tip) return JSON.stringify({ tooltip: false });
  const cs = getComputedStyle(tip);
  const r = tip.getBoundingClientRect();
  const tdRect = document.activeElement; // unused
  // point in the bubble's left half, vertically centered:
  const px = r.x + 20, py = r.y + r.height / 2;
  const hit = document.elementFromPoint(px, py);
  const hitIsTooltip = hit ? (hit.closest('[role="tooltip"]') === tip) : false;
  return JSON.stringify({ tooltip: true, opacity: cs.opacity, rectW: Math.round(r.width), rectH: Math.round(r.height), rectX: Math.round(r.x), leftHalfPaints: hitIsTooltip, hitTag: hit ? hit.tagName + '.' + String(hit.className).slice(0, 30) : 'none' });
})()`)
console.log('tooltip probe: ' + probe)

// 4. Screenshot of the region around the button (visual evidence).
const shot = await send('Page.captureScreenshot', {
  format: 'png',
  clip: { x: Math.max(0, x - 260), y: Math.max(0, y - 60), width: 420, height: 160, scale: 2 }
})
const { writeFileSync } = await import('node:fs')
writeFileSync('hover-tooltip-proof.png', Buffer.from(shot.data, 'base64'))
console.log('screenshot saved: hover-tooltip-proof.png')
ws.close()
process.exit(0)
