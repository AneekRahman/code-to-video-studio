import type {CompiledScene} from '../../contracts.ts';

export type TransitionKind = 'cut' | 'wipe' | 'push' | 'iris' | 'zoom';

const accents: TransitionKind[] = ['wipe', 'iris', 'zoom'];
export const COVER_FRAMES = 9;
export const REVEAL_FRAMES = 11;

/**
 * The transition into scene `index`: its own choice, else a full-screen accent on every third boundary and a cut between the rest.
 * A shutter reads as two cuts (cover, reveal); firing one at every boundary made the showcase cut 1.5 times as fast as the
 * reference it was measured against. The scene's own staggered entrance still moves at a cut.
 */
export function transitionInto(scenes: CompiledScene[], index: number): TransitionKind {
  if (index <= 0) return 'cut';
  const chosen = scenes[index]!.transition ?? 'auto';
  if (chosen !== 'auto') return chosen;
  const slot = (index - 1) % 3;
  return slot === 0 ? accents[Math.floor((index - 1) / 3) % accents.length]! : 'cut';
}
