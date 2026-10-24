import type {Brand, CompiledWord} from './contracts.ts';

export type CaptionState = {
  displayed: CompiledWord[];
  activeWordIndex: number;
  phraseOffset: number;
  highlightedIndices: Set<number>;
};

export function resolveCaptionState(
  words: CompiledWord[],
  frame: number,
  captionMode: Brand['caption_mode']
): CaptionState | null {
  if (captionMode === 'none' || words.length === 0) return null;

  const index = words.findLastIndex(word => frame >= word.startFrame);
  if (index < 0) return null;
  const currentWord = words[index];
  if (!currentWord) return null;

  if (captionMode === 'keyword') {
    if (frame >= currentWord.endFrame) return null;
    return {
      displayed: [currentWord],
      activeWordIndex: 0,
      phraseOffset: index,
      highlightedIndices: new Set([0]),
    };
  }

  const offset = Math.floor(index / 5) * 5;
  const phrase = words.slice(offset, offset + 5);
  const lastWord = phrase.at(-1);
  if (!lastWord || frame >= lastWord.endFrame) return null;

  const highlighted = new Set<number>();
  phrase.forEach((word, i) => {
    if (captionMode === 'karaoke') {
      if (frame >= word.startFrame) highlighted.add(i);
    } else if (captionMode === 'word-highlight') {
      if (frame >= word.startFrame && frame < word.endFrame) highlighted.add(i);
    }
  });

  return {
    displayed: phrase,
    activeWordIndex: index - offset,
    phraseOffset: offset,
    highlightedIndices: highlighted,
  };
}

export function getCaptionClearance(captionMode: Brand['caption_mode']): number {
  if (captionMode === 'none') return 0;
  if (captionMode === 'keyword') return 180;
  if (captionMode === 'lower-third') return 120;
  return 160;
}
