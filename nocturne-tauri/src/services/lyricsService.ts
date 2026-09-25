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

/** Result of an online lyrics fetch: raw LRC text + its [offset:±ms] header tag. */
export interface LrcFetchResult {
  lrc: string
  tagOffsetMs: number
}

/**
 * Parses the standard LRC header tag `[offset:±ms]` (whitespace tolerated).
 * Returns 0 when the header is absent or malformed. The value is passed into
 * the sync engine: effectiveTime = currentTime + (tagOffsetMs + userTrimMs) / 1000.
 */
export function parseLrcOffsetTag(rawLrc: string): number {
  const offsetMatch = rawLrc.match(/^\[offset:\s*([+-]?\d+)\s*\]/m)
  return offsetMatch ? parseInt(offsetMatch[1], 10) : 0
}

/**
 * Strict candidate validation for LRCLIB results.
 * Rejects any record that: has no synced lyrics, does not mention the target
 * artist (case-insensitive, either-direction substring), or is more than 4s
 * away from the track duration (when both durations are known).
 * Never lets a same-title track by a DIFFERENT artist pass, and never lets an
 * edition (radio edit / live intro running ~10s off) pass as the real track.
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

  // 2. Mandatory strict duration match (±4 seconds tolerance when both sides
  //    know the duration). A radio edit with a 10s-shorter intro, a clean edit
  //    or a remaster must never slip through: its timestamps desync every line.
  if (
    typeof targetDuration === 'number' &&
    targetDuration > 0 &&
    typeof candidate.duration === 'number' &&
    Number.isFinite(candidate.duration) &&
    Math.abs(candidate.duration - targetDuration) > 4
  ) {
    return false
  }

  return true
}

/**
 * Fetches synchronized LRC lyrics from LRCLIB (open-source synced lyrics API).
 * Patch 137: LRCLIB `/api/get` is PERMANENTLY DEPRECATED — it ORDERs BY
 * tracks.id and returns the OLDEST record in the ±2s window, which on new
 * singles is almost always synchronized against the official video (5-10s
 * intro skit/logo) and caused the documented lyric drift. Candidates are
 * now queried exclusively via `/api/search?track_name=&artist_name=` and the
 * winner is picked by absolute nearest fractional duration to the audio master:
 * minBy(|r.duration - trackDuration|), gated by a mandatory ±4s window and a
 * strict artist check (isCandidateValid) once the duration is derivable.
 * The LRC header `[offset:±ms]` is parsed here and returned as `tagOffsetMs`
 * so the sync engine can apply it exactly once:
 * effectiveTime = currentTime + (tagOffsetMs + userTrimMs) / 1000.
 * Gracefully returns null if no lyrics are found or on network issues. Never throws.
 */
export async function fetchLyricsOnline(
  title: string,
  artist: string,
  duration?: number
): Promise<LrcFetchResult | null> {
  // Single source of truth for edition matching: seconds, finite, > 0.
  // Anything else means the duration is genuinely underivable for this call.
  const targetDuration =
    typeof duration === 'number' && Number.isFinite(duration) && duration > 0
      ? duration
      : undefined

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
    // /api/search is the ONLY LRCLIB endpoint used (Patch 137). One query per
    // title candidate (bilingual titles etc.), always in the
    // track_name + artist_name form — never /api/get, never a bare q= term.
    for (const candidateTitle of titleCandidates) {
      try {
        const searchParams = new URLSearchParams()
        searchParams.set('track_name', candidateTitle)
        if (cleanArtist) {
          searchParams.set('artist_name', cleanArtist)
        }

        const searchUrl = `https://lrclib.net/api/search?${searchParams.toString()}`
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
            // Filter: synced lyrics present, NOT instrumental, duration known,
            // artist verified, and within the mandatory ±4s duration window
            // whenever the audio master's duration is derivable.
            const valid = results.filter(
              (r) =>
                !!r.syncedLyrics &&
                !r.instrumental &&
                typeof r.duration === 'number' &&
                Number.isFinite(r.duration) &&
                isCandidateValid(r, cleanArtist, targetDuration)
            )

            if (targetDuration) {
              // Nearest-fractional selection: among all surviving candidates,
              // minBy(|r.duration - targetDuration|) — the album master's LRC
              // (matching the audio file length) always beats an upload that
              // was synchronized against the official video (5-10s intro skit).
              const durationDiff = (r: LrcLibItem): number =>
                typeof r.duration === 'number' && Number.isFinite(r.duration)
                  ? Math.abs(r.duration - targetDuration)
                  : Number.POSITIVE_INFINITY
              valid.sort((a, b) => durationDiff(a) - durationDiff(b))
            }

            const best = valid[0]
            if (best && best.syncedLyrics && best.syncedLyrics.trim().length > 0) {
              window.clearTimeout(timeoutId)
              return {
                lrc: best.syncedLyrics,
                tagOffsetMs: parseLrcOffsetTag(best.syncedLyrics)
              }
            }
            // No verified candidate on this title — keep trying other titles,
            // never accept another artist's song with the same title.
          }
        }
      } catch {
        // Continue to next title candidate
      }
    }

    window.clearTimeout(timeoutId)
    return null
  } catch (err) {
    window.clearTimeout(timeoutId)
    return null
  }
}
