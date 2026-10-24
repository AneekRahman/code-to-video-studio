import {AbsoluteFill, interpolate, random} from 'remotion';
import type {Grade} from '../grades.ts';
import type {Shot} from '../shots.ts';
import {smoothNoise} from '../motion.ts';

export function GroundFog({amount, color, frame, width, height, seed}: {amount: number; color: string; frame: number; width: number; height: number; seed: number}) {
  if (amount <= 0) return null;
  const layers = [
    {speed: 0.35, freq: '0.0022 0.006', opacity: 0.55, top: 0.38, seedOffset: 0},
    {speed: -0.55, freq: '0.0035 0.009', opacity: 0.4, top: 0.5, seedOffset: 7},
  ];
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      {layers.map((layer, i) => {
        const id = `fog-${seed}-${i}`;
        const shift = ((frame * layer.speed) % width + width) % width;
        return (
          <svg key={i} width={width * 2} height={height} style={{position: 'absolute', left: -shift, top: 0, opacity: amount * layer.opacity}}>
            <defs>
              <filter id={id} x="0" y="0" width="100%" height="100%">
                <feTurbulence type="fractalNoise" baseFrequency={layer.freq} numOctaves={3} seed={seed + layer.seedOffset} stitchTiles="stitch" result="noise"/>
                <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1.9 0 0 0 -0.62" result="density"/>
                <feFlood floodColor={color} result="tint"/>
                <feComposite in="tint" in2="density" operator="in"/>
              </filter>
              <linearGradient id={`${id}-mask-g`} x1="0" y1="0" x2="0" y2="1">
                <stop offset={layer.top - 0.2} stopColor="#000"/>
                <stop offset={layer.top + 0.1} stopColor="#fff"/>
                <stop offset="0.92" stopColor="#fff"/>
                <stop offset="1" stopColor="#000"/>
              </linearGradient>
              <mask id={`${id}-mask`}><rect width="100%" height="100%" fill={`url(#${id}-mask-g)`}/></mask>
            </defs>
            <g mask={`url(#${id}-mask)`}>
              <rect width="100%" height="100%" filter={`url(#${id})`}/>
            </g>
          </svg>
        );
      })}
    </AbsoluteFill>
  );
}

export function Particles({kind, frame, width, height, seed}: {kind: Shot['atmosphere']['particles']; frame: number; width: number; height: number; seed: number}) {
  if (kind === 'none') return null;
  const count = kind === 'rain' ? 90 : 42;
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      {Array.from({length: count}, (_, i) => {
        const r = (k: string) => random(`${seed}-${kind}-${i}-${k}`);
        if (kind === 'rain') {
          const speed = 38 + r('s') * 22;
          const y = ((r('y') * height + frame * speed) % (height + 200)) - 100;
          const x = (r('x') * (width + 300) - frame * speed * 0.18) % (width + 300);
          return <div key={i} style={{position: 'absolute', left: (x + width + 300) % (width + 300) - 150, top: y, width: 2, height: 46 + r('l') * 30, background: '#b8c8e0', opacity: 0.18 + r('o') * 0.18, transform: 'rotate(10deg)'}}/>;
        }
        const size = (kind === 'ash' ? 3 : 2) + r('z') * (kind === 'ash' ? 5 : 3);
        const rise = kind === 'ash' ? -0.6 : -0.25;
        const x = (r('x') * width + smoothNoise(frame / 30 + i, seed) * 40 + frame * 0.4) % width;
        const y = (((r('y') * height + frame * rise * (1 + r('s'))) % height) + height) % height;
        const flickerOpacity = 0.25 + 0.5 * (0.5 + 0.5 * Math.sin(frame / 9 + i));
        return <div key={i} style={{position: 'absolute', left: x, top: y, width: size, height: size, borderRadius: size, background: kind === 'ash' ? '#cfc6bb' : '#ffe2b0', opacity: flickerOpacity * (kind === 'ash' ? 0.55 : 0.4), filter: 'blur(0.6px)'}}/>;
      })}
    </AbsoluteFill>
  );
}

export function Vignette({strength, pulse}: {strength: number; pulse: number}) {
  const inner = 38 - pulse * 10;
  return <AbsoluteFill style={{pointerEvents: 'none', background: `radial-gradient(ellipse 75% 60% at 50% 48%, transparent ${inner}%, rgba(0,0,0,${Math.min(0.95, strength + pulse * 0.2)}) 100%)`}}/>;
}

export function Grain({amount, frame, width, height}: {amount: number; frame: number; width: number; height: number}) {
  const seed = frame % 24;
  const w = Math.round(width / 2);
  const h = Math.round(height / 2);
  return (
    <svg width={w} height={h} style={{position: 'absolute', left: 0, top: 0, width, height, opacity: amount, mixBlendMode: 'overlay', pointerEvents: 'none'}}>
      <filter id={`grain-${seed}`}>
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} seed={seed} stitchTiles="stitch"/>
        <feColorMatrix type="saturate" values="0"/>
      </filter>
      <rect width="100%" height="100%" filter={`url(#grain-${seed})`}/>
    </svg>
  );
}

export function Tint({grade}: {grade: Grade}) {
  return <AbsoluteFill style={{background: grade.tint, mixBlendMode: grade.tintBlend, opacity: grade.tintOpacity, pointerEvents: 'none'}}/>;
}

/** Brightness multiplier for practical-light flicker; mostly steady with short dropouts. */
export function flickerLevel(amount: number, frame: number, seed: number): number {
  if (amount <= 0) return 1;
  const burst = random(`flicker-${seed}-${Math.floor(frame / 3)}`);
  const dip = burst > 1 - amount * 0.35 ? 0.45 + random(`flicker-depth-${seed}-${frame}`) * 0.3 : 1;
  return dip * (1 - amount * 0.04 * (0.5 + 0.5 * Math.sin(frame * 1.9)));
}

export function heartbeat(amount: number, frame: number, fps: number): number {
  if (amount <= 0) return 0;
  const period = fps * 0.82;
  const t = (frame % period) / period;
  const lub = Math.exp(-Math.pow((t - 0.08) / 0.045, 2));
  const dub = Math.exp(-Math.pow((t - 0.28) / 0.05, 2)) * 0.7;
  return amount * (lub + dub);
}

export function TransitionIn({kind, frame}: {kind: Shot['transition_in']; frame: number}) {
  if (kind === 'cut') return null;
  if (kind === 'fade-black') {
    const opacity = interpolate(frame, [0, 10], [1, 0], {extrapolateRight: 'clamp'});
    return opacity > 0 ? <AbsoluteFill style={{background: '#000', opacity}}/> : null;
  }
  if (kind === 'flash') {
    const opacity = interpolate(frame, [0, 5], [0.9, 0], {extrapolateRight: 'clamp'});
    return opacity > 0 ? <AbsoluteFill style={{background: '#fff8ee', opacity, mixBlendMode: 'screen'}}/> : null;
  }
  if (frame > 7) return null;
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      {Array.from({length: 7}, (_, i) => {
        const top = random(`glitch-top-${frame}-${i}`) * 100;
        const h = 1 + random(`glitch-h-${frame}-${i}`) * 6;
        const shift = (random(`glitch-x-${frame}-${i}`) - 0.5) * 120;
        return <div key={i} style={{position: 'absolute', left: shift, right: -shift, top: `${top}%`, height: `${h}%`, background: i % 2 ? 'rgba(255,40,60,0.28)' : 'rgba(40,255,220,0.22)', mixBlendMode: 'screen'}}/>;
      })}
    </AbsoluteFill>
  );
}
