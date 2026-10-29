import type {CompiledScene, CompiledWord} from '../../contracts.ts';

/** Local frames, relative to the scene start, at which the scene's spoken words begin. */
export function spokenFrames(scene: CompiledScene, words: CompiledWord[]): number[] {
  return words
    .filter(word => scene.narration_segment_ids.includes(word.segment_id) && word.startFrame >= scene.startFrame - 2 && word.startFrame < scene.endFrame)
    .map(word => Math.max(0, word.startFrame - scene.startFrame));
}

/**
 * Frames at which `count` items enter: item i lands on the spoken word i·w/count, so a list builds as the
 * narrator reaches each point. Always strictly increasing and inside the scene.
 */
export function cueFrames(spoken: number[], count: number, duration: number, first = 14, tail = 20): number[] {
  const last = Math.max(first, duration - tail);
  const even = (i: number) => Math.round(first + (i * (last - first)) / Math.max(1, count));
  const raw = Array.from({length: count}, (_, i) => spoken.length > 0 ? spoken[Math.min(spoken.length - 1, Math.floor((i * spoken.length) / count))]! : even(i));
  const cues: number[] = [];
  for (const [i, value] of raw.entries()) {
    cues.push(Math.max(i === 0 ? first : cues[i - 1]! + 5, value));
  }
  return cues.every(cue => cue <= last) ? cues : raw.map((_, i) => even(i));
}
