import type {CSSProperties, ReactNode} from 'react';
import {AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame} from 'remotion';
import type {Brand, CompiledWord} from '../contracts.ts';
import {getCaptionClearance, resolveCaptionState} from '../captions.ts';

export function SafeArea({brand, children}: {brand: Brand; children: ReactNode}) {
  const captionReserve = brand.caption_mode === 'none' ? 0 : getCaptionClearance(brand.caption_mode);
  const bottomPadding = brand.caption_mode === 'none'
    ? brand.safe_area.bottom
    : Math.max(brand.safe_area.bottom, 220) + captionReserve;

  return (
    <AbsoluteFill
      style={{
        paddingTop: brand.safe_area.top,
        paddingBottom: bottomPadding,
        paddingLeft: brand.safe_area.left,
        paddingRight: brand.safe_area.right,
        display: 'flex',
        flexDirection: 'column',
        gap: 36,
      }}
    >
      {children}
    </AbsoluteFill>
  );
}

export function HookHeadline({text, accent}: {text: string; accent: string}) {
  const frame = useCurrentFrame();
  const fontSize = text.length > 70 ? 64 : text.length > 40 ? 76 : 92;
  const translateY = interpolate(frame, [0, 14], [28, 0], {
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const opacity = interpolate(frame, [0, 10], [0, 1], {
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.quad),
  });
  return (
    <h1
      style={{
        margin: 0,
        fontSize,
        fontWeight: 700,
        lineHeight: 1.15,
        letterSpacing: -2,
        transform: `translateY(${translateY}px)`,
        opacity,
        borderLeft: `12px solid ${accent}`,
        paddingLeft: 32,
      }}
    >
      {text}
    </h1>
  );
}

export function ImagePanel({src}: {src: string}) {
  const frame = useCurrentFrame();
  return (
    <div style={{height: 360, overflow: 'hidden', borderRadius: 32, isolation: 'isolate'}}>
      <Img
        src={staticFile(src)}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: `scale(${1 + Math.min(frame, 300) / 6000})`,
        }}
      />
    </div>
  );
}

const card: CSSProperties = {
  padding: '24px 32px',
  borderRadius: 24,
  background: '#ffffff12',
  fontSize: 40,
  lineHeight: 1.3,
};

export function ComparisonCard({lines, accent}: {lines: string[]; accent: string}) {
  if (lines.length === 0) return null;
  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: 20}}>
      {lines.map((line, index) => (
        <div key={index} style={{...card, borderLeft: `6px solid ${accent}`}}>
          {line}
        </div>
      ))}
    </div>
  );
}

export function ChecklistCard({lines, accent}: {lines: string[]; accent: string}) {
  if (lines.length === 0) return null;
  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: 20}}>
      {lines.map((line, index) => (
        <div key={index} style={{...card, display: 'flex', gap: 24}}>
          <span style={{color: accent, fontWeight: 700}}>{index + 1}.</span>
          <span>{line}</span>
        </div>
      ))}
    </div>
  );
}

export function NarrativeCard({lines, accent}: {lines: string[]; accent: string}) {
  if (lines.length === 0) return null;
  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: 18}}>
      {lines.map((line, index) => (
        <div key={index} style={{...card, borderLeft: `6px solid ${accent}`}}>
          {line}
        </div>
      ))}
    </div>
  );
}

export function StatCounter({value, suffix, accent}: {value: number; suffix: string; accent: string}) {
  const frame = useCurrentFrame();
  const progress = interpolate(frame, [0, 25], [0, 1], {
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  return (
    <div style={{fontSize: 160, lineHeight: 1, fontWeight: 700, color: accent, fontVariantNumeric: 'tabular-nums'}}>
      <span>{Math.round(value * progress)}</span>
      {suffix ? (
        <span style={{fontSize: '0.55em', marginLeft: 8, opacity: 0.9, fontWeight: 600}}>
          {suffix}
        </span>
      ) : null}
    </div>
  );
}

export function StatSteps({lines, accent}: {lines: string[]; accent: string}) {
  if (lines.length === 0) return null;
  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: 16}}>
      {lines.map((line, index) => (
        <div
          key={index}
          style={{
            ...card,
            padding: '18px 28px',
            fontSize: 34,
            background: '#ffffff0d',
            borderLeft: `4px solid ${accent}`,
          }}
        >
          {line}
        </div>
      ))}
    </div>
  );
}

export function ProgressBar({progress, accent}: {progress: number; accent: string}) {
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        height: 12,
        width: `${Math.min(1, Math.max(0, progress)) * 100}%`,
        background: accent,
      }}
    />
  );
}

export function CaptionTrack({words, frame, brand}: {words: CompiledWord[]; frame: number; brand: Brand}) {
  const state = resolveCaptionState(words, frame, brand.caption_mode);
  if (!state) return null;

  const keyword = brand.caption_mode === 'keyword';
  const lowerThird = brand.caption_mode === 'lower-third';
  const textAlign = lowerThird ? 'left' : 'center';
  const fontSize = keyword ? 68 : lowerThird ? 36 : 46;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: Math.max(brand.safe_area.bottom, 220),
        left: brand.safe_area.left,
        right: brand.safe_area.right,
        textAlign,
        fontSize,
        fontWeight: 700,
        lineHeight: 1.4,
      }}
    >
      <span
        style={{
          background: '#000000dd',
          boxDecorationBreak: 'clone',
          WebkitBoxDecorationBreak: 'clone',
          padding: '12px 20px',
          borderRadius: 18,
        }}
      >
        {state.displayed.map((word, i) => {
          const isHighlighted = state.highlightedIndices.has(i);
          return (
            <span key={i} style={{color: isHighlighted ? brand.accent : brand.foreground}}>
              {word.text}
              {i < state.displayed.length - 1 ? ' ' : ''}
            </span>
          );
        })}
      </span>
    </div>
  );
}

export function SceneNumber({index, total, accent}: {index: number; total: number; accent: string}) {
  return (
    <div style={{fontSize: 28, letterSpacing: 6, textTransform: 'uppercase', color: accent}}>
      STORY {String(index + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
    </div>
  );
}
