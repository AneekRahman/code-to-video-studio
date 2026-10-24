import type {CSSProperties} from 'react';
import {AbsoluteFill, interpolate, random} from 'remotion';
import type {TimedSegment, TimedWord} from '../story.ts';
import {revealFrames} from '../reveal.ts';

/** Instagram Reels chrome: top bar, bottom caption/username block and right-hand action buttons. */
export const reelsSafe = {top: 230, bottom: 1520, left: 80, right: 940};

export const palette = {hero: '#f5c330', alarm: '#e3262f', paper: '#f4f1ea', ink: '#05070a'};

const display: CSSProperties = {fontFamily: 'StoryDisplay', textTransform: 'uppercase', letterSpacing: 1, lineHeight: 0.95};

export function RuleCard({number, text, segment, frame, endFrame}: {number: number; text: string; segment: TimedSegment; frame: number; endFrame: number}) {
  const enter = segment.startFrame - 3;
  if (frame < enter || frame >= endFrame) return null;
  const local = frame - enter;
  const words = text.split(/\s+/);
  const reveal = revealFrames(words, segment.words, segment.startFrame, segment.endFrame);
  const exit = interpolate(frame, [endFrame - 5, endFrame], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const jitter = local < 6 ? (random(`rule-${number}-${frame}`) - 0.5) * 26 : 0;
  const scale = interpolate(local, [0, 8], [1.08, 1], {extrapolateRight: 'clamp'});
  return (
    <AbsoluteFill style={{opacity: exit}}>
      <div style={{position: 'absolute', left: 0, right: 0, top: reelsSafe.top + 30, height: 620, background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.62) 22%, rgba(0,0,0,0.62) 78%, rgba(0,0,0,0) 100%)'}}/>
      <div style={{position: 'absolute', left: reelsSafe.left + 20, width: reelsSafe.right - reelsSafe.left - 20, top: reelsSafe.top + 110, transform: `translateX(${jitter}px) scale(${scale})`, transformOrigin: '0 50%'}}>
        <div style={{...display, fontSize: 96, color: palette.alarm, letterSpacing: 10, textShadow: local < 6 ? `4px 0 rgba(0,255,230,0.6), -4px 0 rgba(255,0,60,0.6)` : '0 4px 24px rgba(227,38,47,0.45)'}}>
          Rule {String(number).padStart(2, '0')}
        </div>
        <div style={{...display, fontSize: 108, marginTop: 18, color: palette.paper, textShadow: '0 6px 28px rgba(0,0,0,0.85)'}}>
          {words.map((word, i) => {
            const shown = frame >= reveal[i]!;
            const current = shown && (i === words.length - 1 ? frame < reveal[i]! + 10 : frame < reveal[i + 1]!);
            return (
              <span key={i} style={{color: current ? palette.hero : palette.paper, opacity: shown ? 1 : 0.16}}>
                {word}{i < words.length - 1 ? ' ' : ''}
              </span>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
}

export function TitleCard({lines, frame, startFrame, endFrame}: {lines: {text: string; accent: boolean}[]; frame: number; startFrame: number; endFrame: number}) {
  if (frame < startFrame || frame >= endFrame) return null;
  const local = frame - startFrame;
  const exit = interpolate(frame, [endFrame - 6, endFrame], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <AbsoluteFill style={{opacity: exit}}>
      <div style={{position: 'absolute', left: reelsSafe.left, right: 1080 - reelsSafe.right + 40, top: reelsSafe.top + 40, textAlign: 'left'}}>
        {lines.map((line, li) => (
          <div key={li} style={{...display, fontSize: 150, color: line.accent ? palette.alarm : palette.paper, textShadow: '0 8px 30px rgba(0,0,0,0.9)'}}>
            {[...line.text].map((ch, ci) => {
              const appear = li * 5 + ci * 1.2;
              const flicker = local < appear ? 0 : local < appear + 6 ? (random(`title-${li}-${ci}-${frame}`) > 0.35 ? 1 : 0.2) : 1;
              return <span key={ci} style={{opacity: flicker}}>{ch}</span>;
            })}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
}

export function Scanlines({strength}: {strength: number}) {
  return <AbsoluteFill style={{pointerEvents: 'none', opacity: strength, background: 'repeating-linear-gradient(180deg, rgba(0,0,0,0.55) 0px, rgba(0,0,0,0.55) 2px, rgba(0,0,0,0) 2px, rgba(0,0,0,0) 5px)', mixBlendMode: 'multiply'}}/>;
}

export function BroadcastChrome({label, frame, startFrame, endFrame, intro}: {label: string; frame: number; startFrame: number; endFrame: number; intro: TimedSegment | null}) {
  if (frame < startFrame || frame >= endFrame) return null;
  const local = frame - startFrame;
  const mono: CSSProperties = {fontFamily: 'StoryMono', textTransform: 'uppercase'};
  const live = Math.floor(frame / 15) % 2 === 0;
  const barIn = interpolate(local, [0, 6], [0, 1], {extrapolateRight: 'clamp'});
  const typed = intro && frame >= intro.startFrame && frame < intro.endFrame + 20 ? intro : null;
  const typedText = typed ? (() => {
    const total = typed.text.length;
    const progress = interpolate(frame, [typed.startFrame, typed.endFrame], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
    return typed.text.slice(0, Math.ceil(total * progress));
  })() : null;
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      <Scanlines strength={0.35}/>
      <div style={{position: 'absolute', top: reelsSafe.top - 40, left: reelsSafe.left, right: 1080 - reelsSafe.right, opacity: barIn}}>
        <div style={{...mono, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: palette.alarm, color: palette.paper, fontSize: 50, padding: '6px 22px', letterSpacing: 3}}>
          <span>⚠ {label}</span>
          <span style={{opacity: live ? 1 : 0.25}}>● LIVE</span>
        </div>
      </div>
      {typedText !== null ? (
        <div style={{...mono, position: 'absolute', left: reelsSafe.left, width: reelsSafe.right - reelsSafe.left, top: reelsSafe.top + 140, fontSize: 76, lineHeight: 1.05, color: '#d8fff0', textShadow: '0 0 18px rgba(120,255,210,0.55), 3px 0 rgba(255,0,60,0.35)', background: 'rgba(0,10,8,0.55)', padding: '20px 26px'}}>
          {typedText}<span style={{opacity: live ? 1 : 0}}>█</span>
        </div>
      ) : null}
    </AbsoluteFill>
  );
}

function phrases(words: TimedWord[], size = 3): TimedWord[][] {
  const groups: TimedWord[][] = [];
  let current: TimedWord[] = [];
  for (const word of words) {
    current.push(word);
    if (current.length >= size || /[.,…!?]$/.test(word.text)) {
      groups.push(current);
      current = [];
    }
  }
  if (current.length) groups.push(current);
  return groups;
}

export function CaptionBand({segments, frame}: {segments: TimedSegment[]; frame: number}) {
  const segment = segments.find(s => frame >= s.startFrame && frame < s.endFrame + 8);
  if (!segment) return null;
  const groups = phrases(segment.words);
  const group = groups.find((g, i) => frame < (groups[i + 1]?.[0]?.startFrame ?? segment.endFrame + 8) && frame >= g[0]!.startFrame - 2);
  if (!group) return null;
  const uncanny = segment.voice === 'double';
  const shake = uncanny ? (random(`cap-${frame}`) - 0.5) * 5 : 0;
  return (
    <div style={{position: 'absolute', left: reelsSafe.left, width: reelsSafe.right - reelsSafe.left, top: 1300, textAlign: 'center', transform: `translate(${shake}px, ${shake * 0.6}px)`}}>
      <span style={{fontFamily: 'StoryCaption', fontWeight: 800, fontSize: 66, lineHeight: 1.15, fontStyle: uncanny ? 'italic' : 'normal', textTransform: 'uppercase', paintOrder: 'stroke', WebkitTextStroke: '10px rgba(0,0,0,0.92)', letterSpacing: 1}}>
        {group.map((word, i) => {
          const active = frame >= word.startFrame && frame < word.endFrame + 3;
          const color = uncanny ? (active ? '#ffffff' : '#9ea3a6') : active ? palette.hero : palette.paper;
          return <span key={i} style={{color}}>{word.text}{i < group.length - 1 ? ' ' : ''}</span>;
        })}
      </span>
    </div>
  );
}

export function LightsOut({frame, at}: {frame: number; at: number}) {
  if (frame < at) return null;
  const local = frame - at;
  const flicker = local < 8 ? (random(`lights-${frame}`) > 0.5 ? 0.15 : 0.6) : 0.62;
  return <AbsoluteFill style={{background: '#02040a', opacity: flicker, pointerEvents: 'none'}}/>;
}

export function WindowShadows({left, top, width, height, frame, count, seed}: {left: number; top: number; width: number; height: number; frame: number; count: number; seed: string}) {
  return (
    <div style={{position: 'absolute', left, top, width, height, overflow: 'hidden', pointerEvents: 'none'}}>
      <div style={{position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 70% 70% at 50% 45%, rgba(170,205,255,0.85), rgba(110,150,230,0.35) 70%, rgba(80,120,200,0) 100%)', mixBlendMode: 'screen'}}/>
      {Array.from({length: count}, (_, i) => {
        const period = 70 + random(`${seed}-p-${i}`) * 40;
        const offset = random(`${seed}-o-${i}`) * period;
        const t = ((frame + offset) % period) / period;
        const x = -0.6 * width + t * 2.2 * width;
        const bob = Math.sin((frame + offset) / 6) * height * 0.03;
        return (
          <div key={i} style={{position: 'absolute', left: x, top: height * 0.18 + bob, width: width * 0.55, height: height * 1.1, filter: 'blur(2px)', opacity: 0.88}}>
            <div style={{position: 'absolute', left: '32%', top: 0, width: '36%', height: '30%', borderRadius: '50%', background: palette.ink}}/>
            <div style={{position: 'absolute', left: 0, top: '26%', width: '100%', height: '80%', borderRadius: '45% 45% 0 0', background: palette.ink}}/>
          </div>
        );
      })}
    </div>
  );
}
