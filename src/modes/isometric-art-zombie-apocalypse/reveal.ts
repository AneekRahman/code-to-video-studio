import type {TimedWord} from './story.ts';

export const normalizeWord = (word: string) => word.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

/** Reveal frame for each displayed word, matched in order against spoken words; unmatched words interpolate. */
export function revealFrames(display: string[], spoken: TimedWord[], fallbackStart: number, fallbackEnd: number): number[] {
  const frames: (number | null)[] = [];
  let cursor = 0;
  for (const word of display) {
    const target = normalizeWord(word);
    let found: number | null = null;
    for (let i = cursor; i < spoken.length; i++) {
      if (normalizeWord(spoken[i]!.text) === target) {
        found = spoken[i]!.startFrame;
        cursor = i + 1;
        break;
      }
    }
    frames.push(found);
  }
  return frames.map((frame, i) => {
    if (frame !== null) return frame;
    const before = frames.slice(0, i).reverse().find((f): f is number => f !== null) ?? fallbackStart;
    const after = frames.slice(i + 1).find((f): f is number => f !== null) ?? fallbackEnd;
    return Math.round(before + (after - before) * 0.5);
  });
}
