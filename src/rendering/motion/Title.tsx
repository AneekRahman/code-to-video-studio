import {Img, staticFile} from 'remotion';
import type {Palette} from './theme.ts';
import {fontFamilies, withAlpha} from './theme.ts';
import {easeAt, springAt, useClock} from './clock.tsx';

import {parseTitle, plainTitle, titleSize} from './title-text.ts';

export function SplitTitle({text, palette, compact = false}: {text: string; palette: Palette; compact?: boolean}) {
  const clock = useClock();
  const paper = palette.look === 'paper';
  const tokens = parseTitle(text);
  const size = Math.round(titleSize(plainTitle(text)) * (compact ? 0.62 : 1));
  const distance = clock.feel.distance;
  return (
    <h1 style={{margin: 0, fontFamily: fontFamilies.display, fontSize: size, fontWeight: 800, lineHeight: 1.06, letterSpacing: -size * 0.025, display: 'flex', flexWrap: 'wrap', columnGap: size * 0.26, rowGap: 0, ...(paper ? {textTransform: 'uppercase', background: '#ffffff', border: `3px solid ${palette.foreground}`, boxShadow: `10px 10px 0 ${palette.accent}`, padding: `${size * 0.22}px ${size * 0.3}px ${size * 0.3}px`, borderRadius: 6, fontSize: size * 0.84} : {})}}>
      {tokens.map((token, index) => {
        const p = springAt(clock, index * clock.feel.stagger + 2);
        const underline = easeAt(clock, index * clock.feel.stagger + 14, 14);
        return (
          <span key={index} style={{display: 'inline-block', overflow: 'hidden', paddingBottom: size * 0.14, marginBottom: -size * 0.14, paddingTop: size * 0.04, marginTop: -size * 0.04}}>
            <span
              style={{
                display: 'inline-block',
                position: 'relative',
                color: paper ? (token.accent ? palette.onAccent : palette.foreground) : token.accent ? palette.accent : palette.foreground,
                background: paper && token.accent ? palette.accent : undefined,
                padding: paper && token.accent ? '0 0.18em' : undefined,
                transform: `translateY(${(1 - p) * distance * 2.2}px) rotate(${(1 - p) * 4}deg)`,
                transformOrigin: '0 100%',
                opacity: Math.min(1, p * 2),
                textShadow: token.accent && !paper ? `0 0 ${size * 0.5}px ${withAlpha(palette.accent, 0.45)}` : undefined,
              }}
            >
              {token.text}
              {token.accent && !paper ? <span style={{position: 'absolute', left: 0, bottom: size * 0.02, height: Math.max(5, size * 0.07), width: '100%', borderRadius: 4, background: palette.accent, opacity: 0.85, transform: `scaleX(${underline})`, transformOrigin: '0 50%'}}/> : null}
            </span>
          </span>
        );
      })}
    </h1>
  );
}

export function Kicker({text, index, total, palette}: {text?: string | undefined; index: number; total: number; palette: Palette}) {
  const clock = useClock();
  const p = springAt(clock, 0);
  return (
    <div style={{display: 'flex', alignItems: 'center', gap: 22, opacity: p, transform: `translateX(${(1 - p) * -40}px)`, fontFamily: fontFamilies.display, fontWeight: 700}}>
      <div style={{display: 'flex', gap: palette.look === 'paper' ? 6 : 8}}>
        {Array.from({length: total}, (_, i) => palette.look === 'paper' ? (
          <div key={i} style={{width: total > 8 ? 30 : 44, height: total > 8 ? 36 : 44, border: `2.5px solid ${palette.foreground}`, background: i === index ? palette.accent : '#ffffff', color: i === index ? palette.onAccent : palette.foreground, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: total > 8 ? 18 : 24, fontWeight: 800, boxShadow: i === index ? `3px 3px 0 ${palette.foreground}` : undefined}}>{i + 1}</div>
        ) : (
          <div key={i} style={{width: i === index ? 52 : 18, height: 8, borderRadius: 4, background: i === index ? palette.accent : i < index ? withAlpha(palette.foreground, 0.5) : withAlpha(palette.foreground, 0.2)}}/>
        ))}
      </div>
      <span style={{fontSize: 28, letterSpacing: 5, textTransform: 'uppercase', color: palette.look === 'paper' ? palette.foreground : palette.accent, ...(palette.look === 'paper' ? {background: '#ffffff', border: `2.5px solid ${palette.foreground}`, boxShadow: `3px 3px 0 ${palette.foreground}`, padding: '2px 14px', letterSpacing: 2, fontFamily: fontFamilies.mono, fontWeight: 700} : {})}}>{text ?? `${String(index + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`}</span>
    </div>
  );
}

export type StillMotion = 'push-in' | 'pull-out' | 'pan-left' | 'pan-right';

function stillTransform(motion: StillMotion, t: number, drift: number): string {
  const amount = 0.09 * drift;
  if (motion === 'pull-out') return `scale(${1 + amount * (1 - t) + 0.03})`;
  if (motion === 'pan-left') return `scale(1.16) translateX(${(0.5 - t) * 5 * drift}%)`;
  if (motion === 'pan-right') return `scale(1.16) translateX(${(t - 0.5) * 5 * drift}%)`;
  return `scale(${1.03 + amount * t})`;
}

export function StillPanel({src, palette, motion = 'push-in', height = 440}: {src: string; palette: Palette; motion?: StillMotion; height?: number}) {
  const clock = useClock();
  const reveal = easeAt(clock, 4, 22);
  const t = clock.settled ? 1 : Math.min(1, clock.frame / Math.max(1, clock.duration));
  return (
    <div style={{height, position: 'relative', borderRadius: 36, overflow: 'hidden', isolation: 'isolate', clipPath: `inset(0 ${(1 - reveal) * 100}% 0 0 round 36px)`, boxShadow: `0 30px 80px ${withAlpha('#000000', 0.5)}, 0 0 0 2px ${palette.panelEdge}`}}>
      <Img src={staticFile(src)} style={{width: '100%', height: '100%', objectFit: 'cover', transform: stillTransform(motion, t, clock.feel.drift)}}/>
      {palette.look === 'paper' ? null : <div style={{position: 'absolute', inset: 0, background: `linear-gradient(180deg, ${withAlpha(palette.accent, 0.1)}, ${withAlpha(palette.background, 0.5)})`}}/>}
    </div>
  );
}

export function StillBackground({src, palette, motion = 'push-in'}: {src: string; palette: Palette; motion?: StillMotion}) {
  const clock = useClock();
  const t = clock.settled ? 1 : Math.min(1, clock.frame / Math.max(1, clock.duration));
  const fade = easeAt(clock, 0, 12);
  return (
    <div style={{position: 'absolute', inset: 0, overflow: 'hidden', opacity: fade}}>
      <Img src={staticFile(src)} style={{width: '100%', height: '100%', objectFit: 'cover', transform: stillTransform(motion, t, clock.feel.drift)}}/>
      <div style={{position: 'absolute', inset: 0, background: palette.look === 'paper' ? `linear-gradient(180deg, ${withAlpha(palette.background, 0.5)} 0%, ${withAlpha(palette.background, 0)} 30%, ${withAlpha(palette.background, 0)} 70%, ${withAlpha(palette.background, 0.55)} 100%)` : `linear-gradient(180deg, ${withAlpha(palette.background, 0.78)} 0%, ${withAlpha(palette.background, 0.38)} 38%, ${withAlpha(palette.background, 0.86)} 100%)`}}/>
    </div>
  );
}
