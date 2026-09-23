export interface LyricLine {
  id: number;
  time: number;
  text: string;
}

const TIMESTAMP_REGEX = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
const OFFSET_REGEX = /\[offset:([+-]?\d+)\]/i;

/**
 * Parses raw LRC string content into sorted, timestamped LyricLine objects.
 * Supports [mm:ss.xx], [mm:ss:xx], and [mm:ss] timestamp formats.
 * Handles multiple timestamps per line and ignores non-timestamp metadata tags.
 * Honors the standard [offset:±ms] header: every line timestamp is shifted by
 * -offset milliseconds so the lyric engine locks to the audio master.
 */
export function parseLrc(lrcText: string): LyricLine[] {
  if (!lrcText || typeof lrcText !== 'string') {
    return [];
  }

  // Standard LRC header: overall timestamp adjustment in milliseconds.
  const offsetMatch = lrcText.match(OFFSET_REGEX);
  const offsetSec = offsetMatch ? parseInt(offsetMatch[1], 10) / 1000 : 0;

  const lines = lrcText.split(/\r?\n/);
  const parsedItems: { time: number; text: string }[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Ignore metadata tags like [ar:Artist], [ti:Title], [offset:0]
    // Only process lines that contain valid time tags
    const timestampMatches = Array.from(trimmed.matchAll(TIMESTAMP_REGEX));
    if (timestampMatches.length === 0) {
      continue;
    }

    // Strip all timestamps from the line to get the clean lyric text
    const text = trimmed.replace(TIMESTAMP_REGEX, '').trim();
    if (!text) {
      continue;
    }

    for (const match of timestampMatches) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      const fractionStr = match[3];

      let fraction = 0;
      if (fractionStr) {
        fraction = parseFloat(`0.${fractionStr}`);
      }

      // Apply the header offset (-offset ms), clamped so lines never start
      // before playback begins.
      const time = Math.max(0, minutes * 60 + seconds + fraction - offsetSec);
      parsedItems.push({ time, text });
    }
  }

  // Sort ascending by time
  parsedItems.sort((a, b) => a.time - b.time);

  return parsedItems.map((item, index) => ({
    id: index,
    time: item.time,
    text: item.text,
  }));
}
