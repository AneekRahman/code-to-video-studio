import {AbsoluteFill, useCurrentFrame} from 'remotion';
import type {Palette} from './theme.ts';
import {withAlpha} from './theme.ts';
import type {Intensity} from './clock.tsx';
import {feels} from './clock.tsx';

/** Drifting accent light, a parallax dot grid, a vignette and deterministic film grain, all functions of the frame. */
export function Backdrop({palette, intensity, width, height, sceneIndex}: {palette: Palette; intensity: Intensity; width: number; height: number; sceneIndex: number}) {
  const frame = useCurrentFrame();
  const drift = feels[intensity].drift;
  const t = (frame / 30) * drift;
  const phase = sceneIndex * 1.7;
  const paper = palette.look === 'paper';
  const paperGridShift = (frame * 0.2) % 36;
  const blobs = [
    {color: palette.accent, x: 0.22 + 0.14 * Math.sin(t * 0.55 + phase), y: 0.16 + 0.08 * Math.cos(t * 0.4 + phase), size: 1.15, alpha: 0.34},
    {color: palette.accent2, x: 0.82 + 0.1 * Math.cos(t * 0.45 + phase), y: 0.55 + 0.1 * Math.sin(t * 0.5 + phase), size: 1.0, alpha: 0.24},
    {color: palette.accent, x: 0.3 + 0.12 * Math.sin(t * 0.35 + 2 + phase), y: 0.92 + 0.05 * Math.cos(t * 0.6), size: 0.95, alpha: 0.2},
  ];
  const gridShift = (frame * 0.35 * drift) % 64;
  if (paper) {
    return (
      <AbsoluteFill style={{background: palette.background, overflow: 'hidden'}}>
        <div style={{position: 'absolute', inset: -36, backgroundImage: `radial-gradient(${withAlpha(palette.foreground, 0.17)} 2px, transparent 2.4px)`, backgroundSize: '36px 36px', transform: `translateY(${paperGridShift}px)`}}/>
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill style={{background: palette.background, overflow: 'hidden'}}>
      {blobs.map((blob, index) => (
        <div
          key={index}
          style={{
            position: 'absolute',
            width: width * blob.size,
            height: width * blob.size,
            left: blob.x * width - (width * blob.size) / 2,
            top: blob.y * height - (width * blob.size) / 2,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${withAlpha(blob.color, blob.alpha)} 0%, ${withAlpha(blob.color, blob.alpha * 0.45)} 38%, ${withAlpha(blob.color, 0)} 70%)`,
          }}
        />
      ))}
      <div
        style={{
          position: 'absolute',
          inset: -64,
          backgroundImage: `radial-gradient(${withAlpha(palette.foreground, 0.16)} 1.6px, transparent 1.8px)`,
          backgroundSize: '64px 64px',
          transform: `translateY(${gridShift}px)`,
          maskImage: 'linear-gradient(180deg, rgba(0,0,0,0.85), rgba(0,0,0,0.12) 55%, rgba(0,0,0,0.55))',
          WebkitMaskImage: 'linear-gradient(180deg, rgba(0,0,0,0.85), rgba(0,0,0,0.12) 55%, rgba(0,0,0,0.55))',
        }}
      />
      <div style={{position: 'absolute', inset: 0, background: `radial-gradient(ellipse at 50% 45%, ${withAlpha(palette.background, 0)} 40%, ${withAlpha(palette.background, 0.72)} 100%)`}}/>
    </AbsoluteFill>
  );
}

const GRAIN_SCALE = 3;

export function FilmGrain({width, height}: {width: number; height: number}) {
  const frame = useCurrentFrame();
  const w = Math.round(width / GRAIN_SCALE);
  const h = Math.round(height / GRAIN_SCALE);
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      style={{position: 'absolute', inset: 0, mixBlendMode: 'overlay', opacity: 0.2, pointerEvents: 'none'}}
    >
      <filter id="grain" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={frame % 6} stitchTiles="stitch"/>
        <feColorMatrix type="saturate" values="0"/>
      </filter>
      <rect width={w} height={h} filter="url(#grain)"/>
    </svg>
  );
}
