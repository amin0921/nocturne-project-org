/** filePath → safe-file://track/<base64url>. Pure string transform, no Node APIs. */
export function toSafeFileUrl(filePath: string): string {
  const bytes = new TextEncoder().encode(filePath)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  const b64 = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `safe-file://track/${b64}`
}
