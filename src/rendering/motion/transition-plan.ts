import type {CompiledScene} from '../../contracts.ts';

export type TransitionKind = 'cut' | 'wipe' | 'push' | 'iris' | 'zoom';

const rotation: TransitionKind[] = ['wipe', 'iris', 'push', 'zoom'];
export const COVER_FRAMES = 9;
export const REVEAL_FRAMES = 11;

/** The transition into scene `index`: its own choice, else a rotation that never repeats back to back. */
export function transitionInto(scenes: CompiledScene[], index: number): TransitionKind {
  if (index <= 0) return 'cut';
  const chosen = scenes[index]!.transition ?? 'auto';
  if (chosen !== 'auto') return chosen;
  return rotation[(index - 1) % rotation.length]!;
}
