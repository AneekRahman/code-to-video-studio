import {interpolate, spring, useVideoConfig} from 'remotion';
import type {Brand, CompiledWord} from '../../contracts.ts';
import {resolveCaptionState} from '../../captions.ts';
import type {Palette} from './theme.ts';
import {fontFamilies, withAlpha} from './theme.ts';

/** Word-synced captions: the phrase rises in, the spoken word sits in an accent box that pops when it starts. */
export function MotionCaptions({words, frame, brand, palette, emphasis = []}: {words: CompiledWord[]; frame: number; brand: Brand; palette: Palette; emphasis?: string[]}) {
  const marked = new Set(emphasis.map(word => word.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')));
  const {fps} = useVideoConfig();
  const state = resolveCaptionState(words, frame, brand.caption_mode);
  if (!state) return null;
  const mode = brand.caption_mode;
  const keyword = mode === 'keyword';
  const lower = mode === 'lower-third';
  const paper = palette.look === 'paper';
  const phraseStart = state.displayed[0]!.startFrame;
  const rise = spring({frame: frame - phraseStart, fps, config: {damping: 18, stiffness: 200}});
  const fontSize = keyword ? 84 : lower ? 40 : 54;
  return (
    <div style={{position: 'absolute', bottom: Math.max(brand.safe_area.bottom, 220), left: brand.safe_area.left, right: brand.safe_area.right, display: 'flex', justifyContent: lower ? 'flex-start' : 'center', opacity: Math.min(1, rise * 2), transform: `translateY(${(1 - rise) * 26}px)`}}>
      <div style={{display: 'flex', flexWrap: 'wrap', justifyContent: lower ? 'flex-start' : 'center', alignItems: 'center', gap: '6px 4px', fontFamily: fontFamilies.display, fontWeight: 800, fontSize, lineHeight: 1.18, ...(paper ? {background: '#ffffff', border: `3px solid ${palette.foreground}`, boxShadow: `9px 9px 0 ${palette.accent}`, padding: '16px 26px', borderRadius: 6} : {})}}>
        {state.displayed.map((word, index) => {
          const spoken = frame >= word.startFrame;
          const key = marked.has(word.text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, ''));
          const active = paper ? key && spoken : state.highlightedIndices.has(index);
          const pop = spring({frame: frame - word.startFrame, fps, config: {damping: 10, stiffness: 260}});
          const color = paper ? (active ? palette.onAccent : spoken ? palette.foreground : withAlpha(palette.foreground, 0.38)) : active ? palette.onAccent : key && spoken ? palette.accent : spoken ? palette.foreground : withAlpha(palette.foreground, 0.55);
          return (
            <span
              key={index}
              style={{
                display: 'inline-block',
                padding: '0 14px',
                borderRadius: paper ? 4 : 14,
                color,
                background: active ? palette.accent : 'transparent',
                transform: `scale(${active ? 0.94 + 0.12 * Math.min(1, pop) : 1}) rotate(${active ? interpolate(pop, [0, 1], [-3, 0], {extrapolateRight: 'clamp'}) : 0}deg)`,
                textShadow: paper || active ? undefined : `0 3px 16px ${withAlpha('#000000', 0.75)}, 0 0 3px ${withAlpha('#000000', 0.7)}`,
                textTransform: paper ? 'uppercase' : undefined,
              }}
            >
              {word.text}
            </span>
          );
        })}
      </div>
    </div>
  );
}
