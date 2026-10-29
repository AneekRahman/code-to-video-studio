export type TimedWord = {segment_id: string; text: string; start: number; end: number};

/**
 * Real speech aligners report some words (articles, clipped syllables) shorter than a frame. Every word must
 * span at least `minSeconds` and no word may start before the previous ends, so a short word borrows time from
 * the gap after it, or pushes the next word later by the same amount, never beyond the narration's end.
 */
export function normalizeWordTimings(words: TimedWord[], durationSeconds: number, minSeconds = 0.04): TimedWord[] {
  const out: TimedWord[] = [];
  let previousEnd = 0;
  for (const word of words) {
    const start = Math.max(word.start, previousEnd);
    const end = Math.max(word.end, start + minSeconds);
    out.push({...word, start: Number(start.toFixed(3)), end: Number(end.toFixed(3))});
    previousEnd = end;
  }
  for (let i = out.length - 1; i >= 0; i--) {
    const limit = i === out.length - 1 ? durationSeconds : out[i + 1]!.start;
    if (out[i]!.end > limit) {
      out[i] = {...out[i]!, end: Number(limit.toFixed(3)), start: Number(Math.min(out[i]!.start, limit - minSeconds).toFixed(3))};
    }
  }
  return out;
}
