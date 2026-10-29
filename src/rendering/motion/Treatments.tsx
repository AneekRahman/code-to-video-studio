import type {CSSProperties, ReactNode} from 'react';
import type {Palette} from './theme.ts';
import {fontFamilies, mixColors, surface, withAlpha} from './theme.ts';
import {cueFrames, easeAt, springAt, useClock} from './clock.tsx';

function useCues(count: number): number[] {
  const clock = useClock();
  return cueFrames(clock.spoken, count, clock.duration);
}

function panelStyle(palette: Palette): CSSProperties {
  return surface(palette);
}

function Entering({cue, from = 'right', tilt = 0, children, style}: {cue: number; from?: 'right' | 'up' | 'left'; tilt?: number; children: ReactNode; style?: CSSProperties}) {
  const clock = useClock();
  const p = springAt(clock, cue);
  const d = (1 - p) * clock.feel.distance * 1.6;
  const transform = from === 'right' ? `translateX(${d}px)` : from === 'left' ? `translateX(${-d}px)` : `translateY(${d}px)`;
  return <div style={{...style, opacity: Math.min(1, p * 2.2), transform: tilt ? `${transform} rotate(${tilt * p}deg)` : transform}}>{children}</div>;
}

export function CheckRows({lines, palette}: {lines: string[]; palette: Palette}) {
  const clock = useClock();
  const cues = useCues(lines.length);
  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: 22}}>
      {lines.map((line, index) => {
        const tick = easeAt(clock, cues[index]! + 6, 14);
        return (
          <Entering key={index} cue={cues[index]!} tilt={palette.look === 'paper' ? (index % 2 ? 0.9 : -0.9) : 0} style={{...panelStyle(palette), display: 'flex', alignItems: 'center', gap: 28, padding: '26px 32px'}}>
            <svg width="68" height="68" viewBox="0 0 68 68" style={{flex: 'none'}}>
              {palette.look === 'paper'
                ? <rect x="3" y="3" width="62" height="62" rx="5" fill={palette.accent} stroke={palette.foreground} strokeWidth="4"/>
                : <circle cx="34" cy="34" r="30" fill={withAlpha(palette.accent, 0.16)} stroke={palette.accent} strokeWidth="3"/>}
              <path d="M20 35 L30 45 L49 24" fill="none" stroke={palette.look === 'paper' ? palette.foreground : palette.accent} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="48" strokeDashoffset={48 * (1 - tick)}/>
            </svg>
            <span style={{fontSize: 50, lineHeight: 1.22, fontWeight: 700}}>{line}</span>
          </Entering>
        );
      })}
    </div>
  );
}

export function VersusRows({lines, palette}: {lines: string[]; palette: Palette}) {
  const clock = useClock();
  const cues = useCues(lines.length);
  const versus = lines.length === 2;
  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: versus ? 0 : 20, position: 'relative'}}>
      {lines.map((line, index) => {
        const winner = versus && index === 1;
        const bar = easeAt(clock, cues[index]! + 4, 16);
        const card: CSSProperties = winner
          ? {...surface(palette, 'accent'), padding: '42px 36px 34px'}
          : {...panelStyle(palette), padding: versus ? '34px 36px 52px' : '24px 32px 24px 40px', position: 'relative', overflow: 'hidden', color: versus ? palette.muted : palette.foreground};
        return (
          <Entering key={index} cue={cues[index]!} from={versus ? 'up' : 'right'} style={{...card, fontSize: versus ? 54 : 46, lineHeight: 1.22, fontWeight: 700, marginTop: winner ? -20 : 0, position: 'relative', zIndex: winner ? 2 : 1}}>
            {!versus ? <span style={{position: 'absolute', left: 0, top: 0, bottom: 0, width: 9, background: index % 2 === 0 ? palette.accent : palette.accent2, transform: `scaleY(${bar})`, transformOrigin: '50% 0'}}/> : null}
            {versus ? <div style={{fontSize: 24, letterSpacing: 6, marginBottom: 12, opacity: 0.8, textTransform: 'uppercase'}}>{winner ? 'Better' : 'Instead of'}</div> : null}
            {line}
          </Entering>
        );
      })}
      {versus ? <VersusBadge cue={cues[1]!} palette={palette}/> : null}
    </div>
  );
}

function VersusBadge({cue, palette}: {cue: number; palette: Palette}) {
  const clock = useClock();
  const p = springAt(clock, cue - 2, {damping: 9, stiffness: 220});
  return (
    <div style={{position: 'absolute', right: 40, top: '50%', width: 92, height: 92, marginTop: -62, borderRadius: palette.look === 'paper' ? 6 : 46, background: palette.look === 'paper' ? palette.accent : palette.background, border: `4px solid ${palette.look === 'paper' ? palette.foreground : palette.accent}`, color: palette.look === 'paper' ? palette.foreground : palette.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: fontFamilies.display, fontWeight: 800, fontSize: 34, zIndex: 3, transform: `scale(${p}) rotate(${(1 - p) * -40}deg)`}}>
      VS
    </div>
  );
}

export function PointRows({lines, palette}: {lines: string[]; palette: Palette}) {
  const clock = useClock();
  const paper = palette.look === 'paper';
  const cues = useCues(lines.length);
  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: 24}}>
      {lines.map((line, index) => {
        const bar = easeAt(clock, cues[index]! + 3, 14);
        return (
          <Entering key={index} cue={cues[index]!} from="up" tilt={paper ? (index % 2 ? 0.8 : -0.8) : 0} style={paper ? {...surface(palette), padding: '18px 28px', fontSize: index === 0 ? 58 : 48, fontWeight: 800, lineHeight: 1.2} : {position: 'relative', paddingLeft: 44, fontSize: index === 0 ? 62 : 50, fontWeight: index === 0 ? 800 : 600, lineHeight: 1.25, color: index === 0 ? palette.foreground : palette.muted}}>
            {paper ? null : <span style={{position: 'absolute', left: 0, top: 6, bottom: 6, width: 9, borderRadius: 5, background: palette.accent, transform: `scaleY(${bar})`, transformOrigin: '50% 0'}}/>}
            {line}
          </Entering>
        );
      })}
    </div>
  );
}

function formatCount(value: number, template: number): string {
  const decimals = (String(template).split('.')[1] ?? '').length;
  return value.toLocaleString('en-US', {minimumFractionDigits: decimals, maximumFractionDigits: decimals});
}

export function StatBlock({value, suffix, lines, palette}: {value: number; suffix: string; lines: string[]; palette: Palette}) {
  const clock = useClock();
  const cues = useCues(Math.max(1, lines.length));
  const start = Math.min(8, clock.spoken[0] ?? 8);
  const p = clock.settled ? 1 : easeAt(clock, start, 34, t => 1 - (1 - t) ** 4);
  const pop = springAt(clock, start, {damping: 12, stiffness: 140});
  const text = formatCount(value * p, value);
  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: 30}}>
      <div style={{position: 'relative', alignSelf: 'flex-start', transform: `scale(${0.9 + 0.1 * pop})`, transformOrigin: '0 100%'}}>
        {palette.look === 'paper' ? null : <div style={{position: 'absolute', inset: '-20% 0', background: `radial-gradient(ellipse, ${withAlpha(palette.accent, 0.35)}, ${withAlpha(palette.accent, 0)} 70%)`}}/>}
        <div style={{position: 'relative', fontFamily: fontFamilies.display, fontWeight: 800, fontSize: 250, lineHeight: 1, letterSpacing: 0, fontVariantNumeric: 'tabular-nums', ...(palette.look === 'paper' ? {color: palette.foreground, textShadow: `8px 8px 0 ${palette.accent}`} : {backgroundImage: `linear-gradient(120deg, ${palette.accent}, ${palette.accent2})`, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent'}), whiteSpace: 'nowrap'}}>
          {text}
          {suffix ? <span style={{fontSize: '0.36em', letterSpacing: 0, marginLeft: 14, fontWeight: 700}}>{suffix}</span> : null}
        </div>
      </div>
      <div style={{height: palette.look === 'paper' ? 18 : 8, width: 360, borderRadius: palette.look === 'paper' ? 2 : 4, background: palette.look === 'paper' ? '#ffffff' : withAlpha(palette.foreground, 0.14), border: palette.look === 'paper' ? `3px solid ${palette.foreground}` : undefined, overflow: 'hidden'}}>
        <div style={{height: '100%', width: `${p * 100}%`, background: `linear-gradient(90deg, ${palette.accent}, ${palette.accent2})`}}/>
      </div>
      {lines.length > 0 ? (
        <div style={{display: 'flex', flexDirection: 'column', gap: 16}}>
          {lines.map((line, index) => (
            <Entering key={index} cue={cues[index]!} from="up" style={{...panelStyle(palette), padding: '20px 30px', fontSize: 42, fontWeight: 700, display: 'flex', gap: 20, alignItems: 'center'}}>
              <span style={{width: 14, height: 14, borderRadius: 7, background: palette.accent, flex: 'none'}}/>
              {line}
            </Entering>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function QuoteBlock({lines, palette}: {lines: string[]; palette: Palette}) {
  const clock = useClock();
  const [quote = '', ...rest] = lines;
  const words = quote.split(/\s+/).filter(Boolean);
  const cues = cueFrames(clock.spoken, words.length, clock.duration, 10, 40);
  const mark = springAt(clock, 0, {damping: 10, stiffness: 120});
  const author = rest.join(' ');
  const authorIn = springAt(clock, (cues.at(-1) ?? 20) + 4);
  return (
    <div style={{...panelStyle(palette), padding: '70px 52px 52px', position: 'relative', overflow: 'hidden'}}>
      <svg width="150" height="120" viewBox="0 0 150 120" style={{position: 'absolute', left: 36, top: -4, transform: `scale(${mark}) rotate(${(1 - mark) * -12}deg)`, transformOrigin: '0 0'}}>
        <path d="M0 120V64C0 26 22 4 62 0v26C40 31 30 44 30 62h30v58H0zm80 0V64c0-38 22-60 62-64v26c-22 5-32 18-32 36h30v58H80z" fill={palette.accent} opacity="0.9"/>
      </svg>
      <p style={{margin: '36px 0 0', fontSize: words.length > 18 ? 52 : 62, lineHeight: 1.22, fontWeight: 700, fontFamily: fontFamilies.display, display: 'flex', flexWrap: 'wrap', columnGap: '0.28em'}}>
        {words.map((word, index) => {
          const p = springAt(clock, cues[index]!, {damping: 20, stiffness: 160});
          return <span key={index} style={{display: 'inline-block', opacity: p, filter: clock.settled ? undefined : `blur(${(1 - p) * 10}px)`, transform: `translateY(${(1 - p) * 26}px)`}}>{word}</span>;
        })}
      </p>
      {author ? (
        <div style={{marginTop: 36, display: 'flex', alignItems: 'center', gap: 20, opacity: authorIn, fontSize: 34, fontWeight: 600, color: palette.accent}}>
          <span style={{width: 56, height: 4, borderRadius: 2, background: palette.accent}}/>
          {author}
        </div>
      ) : null}
    </div>
  );
}

export function StepsRail({lines, palette}: {lines: string[]; palette: Palette}) {
  const clock = useClock();
  const cues = useCues(lines.length);
  const rowHeight = 150;
  const rail = clock.settled ? 1 : Math.min(1, Math.max(0, (clock.frame - cues[0]!) / Math.max(1, (cues.at(-1) ?? 0) - cues[0]! + 8)));
  return (
    <div style={{position: 'relative', paddingLeft: 0}}>
      <div style={{position: 'absolute', left: 41, top: 41, width: 6, height: rowHeight * (lines.length - 1), borderRadius: 3, background: withAlpha(palette.foreground, 0.14)}}/>
      <div style={{position: 'absolute', left: 41, top: 41, width: 6, height: rowHeight * (lines.length - 1) * rail, borderRadius: 3, background: palette.look === 'paper' ? palette.foreground : `linear-gradient(180deg, ${palette.accent}, ${palette.accent2})`, boxShadow: palette.look === 'paper' ? undefined : `0 0 24px ${withAlpha(palette.accent, 0.6)}`}}/>
      {lines.map((line, index) => {
        const p = springAt(clock, cues[index]!, {damping: 12, stiffness: 190});
        const lit = clock.settled || clock.frame >= cues[index]!;
        return (
          <div key={index} style={{height: rowHeight, display: 'flex', alignItems: 'flex-start', gap: 36}}>
            <div style={{width: 88, height: 88, flex: 'none', borderRadius: palette.look === 'paper' ? 6 : 44, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: fontFamilies.display, fontWeight: 800, fontSize: 40, background: palette.look === 'paper' ? (lit ? palette.accent : '#ffffff') : lit ? `linear-gradient(135deg, ${palette.accent}, ${palette.accent2})` : palette.background, color: palette.look === 'paper' ? palette.foreground : lit ? palette.onAccent : palette.muted, border: `3px solid ${palette.look === 'paper' ? palette.foreground : lit ? palette.accent : palette.panelEdge}`, transform: `scale(${0.6 + 0.4 * p})`, boxShadow: palette.look === 'paper' ? `5px 5px 0 ${palette.foreground}` : lit ? `0 0 40px ${withAlpha(palette.accent, 0.55)}` : undefined}}>
              {index + 1}
            </div>
            <div style={{paddingTop: 12, fontSize: 52, lineHeight: 1.18, fontWeight: 700, opacity: Math.min(1, p * 2), transform: `translateX(${(1 - p) * 40}px)`}}>{line}</div>
          </div>
        );
      })}
    </div>
  );
}

export function BarChart({data, unit, palette}: {data: {label: string; value: number}[]; unit: string; palette: Palette}) {
  const clock = useClock();
  const cues = useCues(data.length);
  const max = Math.max(...data.map(item => item.value), 1e-9);
  const paper = palette.look === 'paper';
  const top = data.reduce((best, item, index) => (item.value > data[best]!.value ? index : best), 0);
  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: 30}}>
      {data.map((item, index) => {
        const grow = clock.settled ? 1 : springAt(clock, cues[index]!, {damping: 18, stiffness: 90});
        const shown = formatCount(item.value * Math.min(1, grow), item.value);
        const lead = index === top;
        return (
          <div key={index} style={{display: 'flex', flexDirection: 'column', gap: 10, opacity: Math.min(1, grow * 3)}}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 42, fontWeight: 700}}>
              <span style={{color: lead ? palette.foreground : palette.muted}}>{item.label}</span>
              <span style={{fontFamily: fontFamilies.display, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: lead ? palette.accent : palette.foreground, fontSize: 44}}>{shown}{unit}</span>
            </div>
            <div style={{height: 46, borderRadius: paper ? 4 : 23, background: paper ? '#ffffff' : withAlpha(palette.foreground, 0.1), border: paper ? `3px solid ${palette.foreground}` : undefined, boxShadow: paper ? `5px 5px 0 ${palette.foreground}` : undefined, overflow: 'hidden'}}>
              <div style={{height: '100%', width: `${(item.value / max) * Math.max(0, grow) * 100}%`, borderRadius: paper ? 0 : 23, background: paper ? (lead ? palette.accent : mixColors(palette.accent, '#ffffff', 0.6)) : lead ? `linear-gradient(90deg, ${palette.accent}, ${palette.accent2})` : mixColors(palette.accent, palette.background, 0.5), borderRight: paper ? `3px solid ${palette.foreground}` : undefined, boxShadow: !paper && lead ? `0 0 34px ${withAlpha(palette.accent, 0.55)}` : undefined}}/>
            </div>
          </div>
        );
      })}
    </div>
  );
}
