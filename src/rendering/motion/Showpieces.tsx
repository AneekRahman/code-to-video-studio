import type {Palette} from './theme.ts';
import {fontFamilies, surface, withAlpha} from './theme.ts';
import {cueFrames, easeAt, springAt, useClock} from './clock.tsx';

/** `count` chips that light one by one as the narrator reaches them, with a running counter sticker. */
export function ChipGrid({count, label, lines, palette}: {count: number; label: string; lines: string[]; palette: Palette}) {
  const clock = useClock();
  const paper = palette.look === 'paper';
  const cues = cueFrames(clock.spoken, count, clock.duration, 12);
  const lit = clock.settled ? count : cues.filter(cue => clock.frame >= cue).length;
  const pop = springAt(clock, cues[Math.max(0, lit - 1)] ?? 0, {damping: 9, stiffness: 260});
  const columns = count > 12 ? 6 : count > 6 ? 4 : 3;
  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: 28}}>
      <div style={{display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: 16}}>
        {Array.from({length: count}, (_, index) => {
          const on = clock.settled || clock.frame >= cues[index]!;
          const p = springAt(clock, cues[index]!, {damping: 10, stiffness: 240});
          const base = on ? (paper ? {...surface(palette), boxShadow: `5px 5px 0 ${palette.foreground}`} : surface(palette)) : {background: paper ? '#e4e0d5' : withAlpha(palette.foreground, 0.05), border: `2px solid ${paper ? withAlpha(palette.foreground, 0.2) : palette.panelEdge}`, borderRadius: paper ? 6 : 22, color: palette.muted};
          return (
            <div key={index} style={{...base, height: count > 12 ? 100 : 120, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: fontFamilies.display, fontWeight: 800, fontSize: count > 12 ? 40 : 52, transform: on ? `scale(${0.82 + 0.18 * Math.min(1.12, p)})` : undefined}}>{index + 1}</div>
          );
        })}
      </div>
      <div style={{alignSelf: 'flex-start', display: 'flex', alignItems: 'baseline', gap: 16, padding: '18px 34px', transform: `rotate(-3deg) scale(${0.94 + 0.06 * pop})`, ...surface(palette, 'accent'), ...(paper ? {boxShadow: `8px 8px 0 ${palette.foreground}`} : {})}}>
        <span style={{fontFamily: fontFamilies.display, fontWeight: 800, fontSize: 130, lineHeight: 1, fontVariantNumeric: 'tabular-nums'}}>{lit}</span>
        <span style={{fontFamily: fontFamilies.display, fontWeight: 800, fontSize: 40, letterSpacing: 3, textTransform: 'uppercase'}}>{label}</span>
      </div>
      {lines.length > 0 ? <div style={{fontSize: 38, fontWeight: 600, color: palette.muted}}>{lines.join(' · ')}</div> : null}
    </div>
  );
}

/** A half-circle dial that sweeps to `value` (0–100) while its number counts up, ending on a verdict pill. */
export function Gauge({value, label, verdict, palette}: {value: number; label: string; verdict: string | undefined; palette: Palette}) {
  const clock = useClock();
  const paper = palette.look === 'paper';
  const start = Math.min(10, clock.spoken[0] ?? 10);
  const p = clock.settled ? 1 : easeAt(clock, start, 46, t => 1 - (1 - t) ** 3);
  const radius = 230;
  const stroke = 56;
  const circumference = Math.PI * radius;
  const shown = (value * p).toFixed(value % 1 === 0 ? 0 : 1);
  const pill = springAt(clock, start + 46, {damping: 10, stiffness: 240});
  return (
    <div style={{...surface(palette), padding: '44px 40px 36px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6}}>
      <div style={{position: 'relative', width: radius * 2 + stroke, height: radius + stroke}}>
        <svg width={radius * 2 + stroke} height={radius + stroke} viewBox={`0 0 ${radius * 2 + stroke} ${radius + stroke}`}>
          <path d={`M ${stroke / 2} ${radius + stroke / 2} A ${radius} ${radius} 0 0 1 ${radius * 2 + stroke / 2} ${radius + stroke / 2}`} fill="none" stroke={paper ? '#e4e0d5' : withAlpha(palette.foreground, 0.14)} strokeWidth={stroke} strokeLinecap={paper ? 'butt' : 'round'}/>
          <path d={`M ${stroke / 2} ${radius + stroke / 2} A ${radius} ${radius} 0 0 1 ${radius * 2 + stroke / 2} ${radius + stroke / 2}`} fill="none" stroke={palette.accent} strokeWidth={stroke} strokeLinecap={paper ? 'butt' : 'round'} strokeDasharray={circumference} strokeDashoffset={circumference * (1 - (value / 100) * p)}/>
        </svg>
        <div style={{position: 'absolute', left: 0, right: 0, bottom: 4, textAlign: 'center', fontFamily: fontFamilies.display, fontWeight: 800, fontSize: 150, lineHeight: 1, fontVariantNumeric: 'tabular-nums'}}>{shown}</div>
      </div>
      <div style={{display: 'flex', justifyContent: 'space-between', width: radius * 2 + stroke, fontSize: 28, fontWeight: 700, color: palette.muted}}>
        <span>0</span>
        <span>{label}</span>
        <span>100</span>
      </div>
      {verdict ? (
        <div style={{marginTop: 18, padding: '8px 30px', fontFamily: fontFamilies.display, fontWeight: 800, fontSize: 44, letterSpacing: 3, textTransform: 'uppercase', background: paper ? palette.foreground : palette.accent, color: paper ? palette.background : palette.onAccent, borderRadius: paper ? 4 : 40, transform: `scale(${pill})`, opacity: Math.min(1, pill * 2)}}>{verdict}</div>
      ) : null}
    </div>
  );
}
