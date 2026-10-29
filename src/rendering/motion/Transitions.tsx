import type {CSSProperties, ReactNode} from 'react';
import {AbsoluteFill, Easing, interpolate, useCurrentFrame} from 'remotion';
import type {CompiledScene} from '../../contracts.ts';
import type {Palette} from './theme.ts';
import {mixColors, withAlpha} from './theme.ts';

import {COVER_FRAMES, REVEAL_FRAMES, transitionInto, type TransitionKind} from './transition-plan.ts';

export {transitionInto, type TransitionKind};

const out = Easing.bezier(0.7, 0, 0.84, 0);
const into = Easing.bezier(0.16, 1, 0.3, 1);

/** Shell around one scene's content: exits before the boundary and enters after it, per the kinds on each side. */
export function SceneShell({enter, exit, frames, children}: {enter: TransitionKind; exit: TransitionKind; frames: number; children: ReactNode}) {
  const frame = useCurrentFrame();
  const enterT = interpolate(frame, [0, REVEAL_FRAMES + 4], [0, 1], {extrapolateRight: 'clamp', easing: into});
  const exitT = interpolate(frame, [frames - COVER_FRAMES - 2, frames], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: out});
  const style: CSSProperties = {};
  if (enter === 'push') {
    style.transform = `translateY(${(1 - enterT) * 220}px)`;
    style.opacity = enterT;
  } else if (enter === 'zoom') {
    style.transform = `scale(${0.9 + enterT * 0.1})`;
    style.opacity = Math.min(1, enterT * 1.6);
  }
  if (exit === 'push') {
    style.transform = `translateY(${-exitT * 220}px)`;
    style.opacity = (style.opacity as number | undefined ?? 1) * (1 - exitT);
  } else if (exit === 'zoom') {
    style.transform = `scale(${1 + exitT * 0.12})`;
    style.opacity = (style.opacity as number | undefined ?? 1) * (1 - exitT);
  } else if (exit === 'wipe' || exit === 'iris') {
    style.transform = `scale(${1 - exitT * 0.03})`;
  }
  return <AbsoluteFill style={style}>{children}</AbsoluteFill>;
}

/** Full-frame cover that is fully opaque on `boundary`, so the scene swap underneath is never seen. */
export function TransitionLayer({scenes, palette, width, height}: {scenes: CompiledScene[]; palette: Palette; width: number; height: number}) {
  const frame = useCurrentFrame();
  for (let i = 1; i < scenes.length; i++) {
    const boundary = scenes[i]!.startFrame;
    const kind = transitionInto(scenes, i);
    if (kind === 'cut') continue;
    if (frame < boundary - COVER_FRAMES || frame >= boundary + REVEAL_FRAMES) continue;
    const cover = interpolate(frame, [boundary - COVER_FRAMES, boundary], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.6, 0, 0.4, 1)});
    const reveal = interpolate(frame, [boundary, boundary + REVEAL_FRAMES], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.6, 0, 0.4, 1)});
    return <Cover kind={kind} cover={cover} reveal={reveal} palette={palette} width={width} height={height}/>;
  }
  return null;
}

function Cover({kind, cover, reveal, palette, width, height}: {kind: TransitionKind; cover: number; reveal: number; palette: Palette; width: number; height: number}) {
  const paper = palette.look === 'paper';
  const deep = paper ? palette.foreground : mixColors(palette.accent, palette.background, 0.55);
  if (kind === 'iris') {
    const radius = (Math.hypot(width, height) / 2) * 1.05;
    const mask = reveal > 0
      ? `radial-gradient(circle at 50% 50%, transparent ${reveal * radius}px, #000 ${reveal * radius + 1}px)`
      : `radial-gradient(circle at 50% 50%, #000 ${cover * radius}px, transparent ${cover * radius + 1}px)`;
    return <AbsoluteFill style={{background: `radial-gradient(circle at 50% 50%, ${palette.accent2}, ${palette.accent})`, maskImage: mask, WebkitMaskImage: mask}}/>;
  }
  const slab = (background: string, x: number): CSSProperties => ({
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '-30%',
    width: '160%',
    background,
    transform: `translateX(${x}%) skewX(-14deg)`,
    boxShadow: paper ? undefined : `0 0 90px ${withAlpha(palette.accent, 0.55)}`,
  });
  const lead = reveal > 0 ? reveal * 170 : -160 + cover * 160;
  const back = reveal > 0 ? reveal * 160 : -160 + cover * 160 - 18 * (1 - cover);
  return (
    <AbsoluteFill style={{overflow: 'hidden'}}>
      <div style={slab(deep, back)}/>
      <div style={slab(paper ? palette.accent : `linear-gradient(100deg, ${palette.accent2}, ${palette.accent})`, lead)}/>
    </AbsoluteFill>
  );
}
