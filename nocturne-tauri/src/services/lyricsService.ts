/**
 * Clean and sanitize song titles and artist names before querying lyrics APIs.
 * Removes download tags, telegram handles, bitrate labels, and noise tokens.
 */
export function sanitizeQueryText(text: string): string {
  if (!text) return ''

  let cleaned = text
    // Remove telegram / social handles e.g. @channel_name
    .replace(/@[\w\d_.-]+/g, ' ')
    // Remove website urls / domains
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\bwww\.[^\s]+/gi, ' ')
    // Remove common media tags in brackets e.g. [Official Video], [Lyrics], [Audio], [Visualizer]
    .replace(/\[\s*(?:official\s+)?(?:music\s+)?(?:video|audio|lyrics?|visualizer|hd|4k|hq|remaster(?:ed)?)\s*\]/gi, ' ')
    .replace(/\(\s*(?:official\s+)?(?:music\s+)?(?:video|audio|lyrics?|visualizer|hd|4k|hq|remaster(?:ed)?)\s*\)/gi, ' ')
    // Remove audio quality tokens in brackets e.g. [320kbps], [FLAC], [Lossless]
    .replace(/\[\s*(?:\d{2,4}\s*kbps|flac|mp3|wav|m4a|lossless|hi-res)\s*\]/gi, ' ')
    .replace(/\(\s*(?:\d{2,4}\s*kbps|flac|mp3|wav|m4a|lossless|hi-res)\s*\)/gi, ' ')
    // Remove featured artist markers that commonly break exact matching: (feat. X), (ft. X)
    .replace(/[\(\[]\s*(?:feat\.?|ft\.?)\s+[^)\]]+[\)\]]/gi, ' ')
    // Remove file extension suffixes if in the title
    .replace(/\.(mp3|flac|wav|m4a|ogg|opus|aac)$/i, ' ')
    // Strip leading track numbers like "01. ", "02 - "
    .replace(/^\d{1,3}[\s._-]+/, ' ')
    // Collapse extra whitespaces
    .replace(/\s+/g, ' ')
    .trim()

  return cleaned
}

export function cleanTrackMetadata(title: string, artist: string): { cleanTitle: string; cleanArtist: string } {
  const cleanTitle = sanitizeQueryText(title)
  let cleanArtist = sanitizeQueryText(artist)

  // Remove "Unknown Artist" placeholder
  if (cleanArtist.toLowerCase() === 'unknown artist' || cleanArtist.toLowerCase() === 'unknown') {
    cleanArtist = ''
  }

  return { cleanTitle, cleanArtist }
}

/**
 * Extracts multiple search candidates for titles with bilingual representations or separators.
 * Handles patterns like "بیم / BEEM", "BEEM / بیم", "Yas - Beem (بیم)", "یا مولا (Ya Mola)".
 */
export function getTitleCandidates(rawTitle: string): string[] {
  const clean = sanitizeQueryText(rawTitle)
  if (!clean) return []

  const candidates: string[] = [clean]

  // Check for slashes, pipes, or backslashes e.g. "بیم / BEEM", "BEEM | بیم"
  if (/[\/|\\]/.test(clean)) {
    const parts = clean
      .split(/\s*[\/|\\]\s*/)
      .map(sanitizeQueryText)
      .filter(Boolean)
    for (const p of parts) {
      if (p && !candidates.includes(p)) {
        candidates.push(p)
      }
    }
  }

  // Check for dash separation e.g. "Yas - Beem" or "بیم - Beem"
  if (clean.includes(' - ')) {
    const parts = clean
      .split(/\s+-\s+/)
      .map(sanitizeQueryText)
      .filter(Boolean)
    for (const p of parts) {
      if (p && !candidates.includes(p)) {
        candidates.push(p)
      }
    }
  }

  // Check for parentheses e.g. "Beem (بیم)", "یا مولا (Ya Mola)"
  const parenMatch = clean.match(/^([^(]+)\(([^)]+)\)$/)
  if (parenMatch) {
    const main = sanitizeQueryText(parenMatch[1])
    const inside = sanitizeQueryText(parenMatch[2])
    if (main && !candidates.includes(main)) candidates.push(main)
    if (inside && !candidates.includes(inside)) candidates.push(inside)
  }

  return candidates
}

interface LrcLibItem {
  id?: number
  trackName?: string
  artistName?: string
  albumName?: string
  duration?: number
  instrumental?: boolean
  plainLyrics?: string
  syncedLyrics?: string
}

/**
 * Strict candidate validation for LRCLIB results.
 * Rejects any record that: has no synced lyrics, does not mention the target
 * artist (case-insensitive, either-direction substring), or is more than 5s
 * away from the track duration (when both durations are known).
 * Never lets a same-title track by a DIFFERENT artist pass.
 */
export function isCandidateValid(
  candidate: LrcLibItem | null | undefined,
  targetArtist: string,
  targetDuration?: number
): boolean {
  if (!candidate || typeof candidate.syncedLyrics !== 'string' || candidate.syncedLyrics.trim().length === 0) {
    return false
  }

  // 1. Strict artist match (case-insensitive substring / inclusion both ways)
  const cArtist = (candidate.artistName ?? '').toLowerCase().trim()
  const tArtist = (targetArtist ?? '').toLowerCase().trim()
  if (tArtist) {
    // Unknown/empty candidate artist can never be verified against a known target
    if (!cArtist) return false
    const artistMatches = cArtist.includes(tArtist) || tArtist.includes(cArtist)
    if (!artistMatches) return false
  }

  // 2. Strict duration match (±5 seconds tolerance when both sides know duration)
  if (
    typeof targetDuration === 'number' &&
    targetDuration > 0 &&
    typeof candidate.duration === 'number' &&
    Number.isFinite(candidate.duration)
  ) {
    const diff = Math.abs(candidate.duration - targetDuration)
    if (diff > 5) return false
  }

  return true
}

/**
 * Fetches synchronized LRC lyrics from LRCLIB (open-source synced lyrics API).
 * Tries exact match first via /api/get across title candidates, then falls back
 * to /api/search?q=... for bilingual / Persian queries.
 * Gracefully returns null if no lyrics are found or on network issues. Never throws.
 */
export async function fetchLyricsOnline(
  title: string,
  artist: string,
  duration?: number
): Promise<string | null> {
  const { cleanTitle, cleanArtist } = cleanTrackMetadata(title, artist)
  if (!cleanTitle) {
    return null
  }

  const titleCandidates = getTitleCandidates(title)
  if (!titleCandidates.includes(cleanTitle)) {
    titleCandidates.unshift(cleanTitle)
  }

  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), 7000)

  try {
    // 1. Try exact match endpoint: https://lrclib.net/api/get for each candidate
    for (const candidateTitle of titleCandidates) {
      try {
        const getParams = new URLSearchParams()
        getParams.set('track_name', candidateTitle)
        if (cleanArtist) {
          getParams.set('artist_name', cleanArtist)
        }
        if (duration && duration > 0) {
          getParams.set('duration', Math.round(duration).toString())
        }

        const getUrl = `https://lrclib.net/api/get?${getParams.toString()}`
        const getRes = await fetch(getUrl, {
          signal: controller.signal,
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'Nocturne-MusicPlayer/0.1.0 (https://github.com/nocturne-player/nocturne)'
          }
        })

        if (getRes.status === 200) {
          const data = (await getRes.json()) as LrcLibItem
          if (isCandidateValid(data, cleanArtist, duration)) {
            window.clearTimeout(timeoutId)
            return data.syncedLyrics ?? null
          }
        }
      } catch {
        // Continue to next candidate
      }
    }

    // 2. Fallback to search endpoint: https://lrclib.net/api/search?q=
    const searchQueries: string[] = []
    const baseQuery = `${cleanTitle} ${cleanArtist}`.trim()
    searchQueries.push(baseQuery)

    for (const t of titleCandidates) {
      const qWithArtist = `${t} ${cleanArtist}`.trim()
      if (!searchQueries.includes(qWithArtist)) {
        searchQueries.push(qWithArtist)
      }
      if (t.length > 2 && !searchQueries.includes(t)) {
        searchQueries.push(t)
      }
    }

    for (const query of searchQueries) {
      try {
        const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(query)}`
        const searchRes = await fetch(searchUrl, {
          signal: controller.signal,
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'Nocturne-MusicPlayer/0.1.0 (https://github.com/nocturne-player/nocturne)'
          }
        })

        if (searchRes.status === 200) {
          const results = (await searchRes.json()) as LrcLibItem[]
          if (Array.isArray(results) && results.length > 0) {
            // STRICT: only candidates whose artist (and duration) verify against this track
            const valid = results.filter((r) => isCandidateValid(r, cleanArtist, duration))
            if (valid.length > 0) {
              let match = valid[0]
              if (duration && duration > 0) {
                match = valid.reduce((best, r) => {
                  const bestDiff =
                    typeof best.duration === 'number' && Number.isFinite(best.duration)
                      ? Math.abs(best.duration - duration)
                      : Number.POSITIVE_INFINITY
                  const rDiff =
                    typeof r.duration === 'number' && Number.isFinite(r.duration)
                      ? Math.abs(r.duration - duration)
                      : Number.POSITIVE_INFINITY
                  return rDiff < bestDiff ? r : best
                })
              }
              if (match.syncedLyrics && match.syncedLyrics.trim().length > 0) {
                window.clearTimeout(timeoutId)
                return match.syncedLyrics
              }
            }
            // No verified candidate on this query — keep trying other queries,
            // never accept another artist's song with the same title.
          }
        }
      } catch {
        // Continue to next query
      }
    }

    window.clearTimeout(timeoutId)
    return null
  } catch (err) {
    window.clearTimeout(timeoutId)
    return null
  }
}
