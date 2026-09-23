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
 * Fetches synchronized LRC lyrics from LRCLIB (open-source synced lyrics API).
 * Tries exact match first via /api/get (with the rounded local duration for
 * strict edition matching), then falls back to /api/search — results there are
 * filtered to the duration-matching edition (±2s) when a duration is provided.
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

  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), 6000)

  try {
    // 1. Try exact match endpoint: https://lrclib.net/api/get
    const getParams = new URLSearchParams()
    getParams.set('track_name', cleanTitle)
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
      if (data?.syncedLyrics && typeof data.syncedLyrics === 'string') {
        window.clearTimeout(timeoutId)
        return data.syncedLyrics
      }
    }

    // 2. If exact match didn't yield syncedLyrics, try search fallback: https://lrclib.net/api/search
    const searchParams = new URLSearchParams()
    searchParams.set('track_name', cleanTitle)
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
        // Candidates with non-empty syncedLyrics
        const candidates = results.filter((r) => r.syncedLyrics && r.syncedLyrics.trim().length > 0)
        if (candidates.length > 0) {
          // Strict edition matching: prefer a result whose duration matches the
          // local audio exactly (±2s rounding tolerance) so we never latch onto
          // an alternate release (album version vs radio edit, extended intro…).
          let match = candidates[0]
          if (duration && duration > 0) {
            const target = Math.round(duration)
            match =
              candidates.find(
                (r) => typeof r.duration === 'number' && Math.abs(r.duration - target) <= 2
              ) ?? candidates[0]
          }
          window.clearTimeout(timeoutId)
          return match.syncedLyrics ?? null
        }
      }
    }

    window.clearTimeout(timeoutId)
    return null
  } catch (err) {
    window.clearTimeout(timeoutId)
    // Graceful offline fallback: log silently and return null
    return null
  }
}
