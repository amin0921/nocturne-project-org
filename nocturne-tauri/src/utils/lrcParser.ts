export interface LyricWord {
  text: string;
  time: number;
}

export interface LyricLine {
  id: number;
  time: number;
  text: string;
  words?: LyricWord[];
}

interface ParsedLrcItem {
  time: number;
  text: string;
  words?: LyricWord[];
}

const TIMESTAMP_REGEX = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
const WORD_TIMESTAMP_REGEX = /<(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?>/g;
const OFFSET_REGEX = /\[offset:([+-]?\d+)\]/i;

function timestampToSeconds(match: RegExpExecArray, offsetSec: number): number {
  const minutes = parseInt(match[1], 10);
  const seconds = parseInt(match[2], 10);
  const fraction = match[3] ? parseFloat(`0.${match[3]}`) : 0;
  return Math.max(0, minutes * 60 + seconds + fraction - offsetSec);
}

function parseWordTimings(content: string, offsetSec: number): LyricWord[] | undefined {
  const matches = Array.from(content.matchAll(WORD_TIMESTAMP_REGEX));
  if (matches.length === 0) return undefined;

  const words: LyricWord[] = [];
  for (let index = 0; index < matches.length; index++) {
    const match = matches[index];
    const nextMatch = matches[index + 1];
    const start = (match.index ?? 0) + match[0].length;
    const end = nextMatch?.index ?? content.length;
    const text = content.slice(start, end);
    if (!text) continue;
    words.push({ text, time: timestampToSeconds(match, offsetSec) });
  }

  return words.length > 0 ? words : undefined;
}

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
  const parsedItems: ParsedLrcItem[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Ignore metadata tags like [ar:Artist], [ti:Title], [offset:0]
    // Only process lines that contain valid time tags
    const timestampMatches = Array.from(trimmed.matchAll(TIMESTAMP_REGEX));
    if (timestampMatches.length === 0) {
      continue;
    }

    const content = trimmed.replace(TIMESTAMP_REGEX, '');
    const text = content.replace(WORD_TIMESTAMP_REGEX, '').trim();
    if (!text) {
      continue;
    }
    const words = parseWordTimings(content, offsetSec);

    for (const match of timestampMatches) {
      parsedItems.push({ time: timestampToSeconds(match, offsetSec), text, words });
    }
  }

  // Sort ascending by time
  parsedItems.sort((a, b) => a.time - b.time);

  return parsedItems.map((item, index) => ({
    id: index,
    time: item.time,
    text: item.text,
    words: item.words,
  }));
}
