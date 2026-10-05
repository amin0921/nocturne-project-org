// Minimal CDP driver for the Nocturne WebView2 windows under measurement.
// Usage: node cdp-eval.mjs "<js expression>" [pageIndex]
//   Without pageIndex: evaluates on EVERY page target and prefixes each
//   result with its index (use when a mini-island window may exist).
//   With pageIndex: evaluates only on that page target.
// No dependencies: uses Node's built-in WebSocket + fetch (Node >= 22).

const list = await (await fetch('http://127.0.0.1:9223/json/list')).json()
const pages = list.filter((t) => t.type === 'page' && t.url.includes('tauri.localhost'))
if (pages.length === 0) {
  console.error('No Nocturne page target found. Targets: ' + JSON.stringify(list.map((t) => ({ url: t.url, type: t.type }))))
  process.exit(1)
}

const onlyIndex = process.argv[3] !== undefined ? Number(process.argv[3]) : null
const targets = onlyIndex !== null ? [pages[onlyIndex]] : pages

for (let ti = 0; ti < targets.length; ti++) {
  const page = targets[ti]
  const label = onlyIndex !== null ? '' : `[${pages.indexOf(page)}] `
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })

  let seq = 0
  const pending = new Map()
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg)
      pending.delete(msg.id)
    }
  }
  const send = (method, params = {}) => {
    const id = ++seq
    ws.send(JSON.stringify({ id, method, params }))
    return new Promise((res, rej) => {
      pending.set(id, (m) => (m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result)))
    })
  }

  const expression = process.argv[2]
  if (!expression) {
    console.error('usage: node cdp-eval.mjs "<js expression>" [pageIndex]')
    process.exit(1)
  }

  try {
    const result = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true
    })
    if (result.exceptionDetails) {
      console.log(label + 'PAGE EXCEPTION: ' + (result.exceptionDetails.exception?.description || JSON.stringify(result.exceptionDetails)))
    } else {
      console.log(label + JSON.stringify(result.result.value, null, 1))
    }
  } catch (err) {
    console.log(label + 'DRIVER ERROR: ' + err.message)
  }
  ws.close()
}
process.exit(0)

