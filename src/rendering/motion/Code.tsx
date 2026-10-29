import type {Palette} from './theme.ts';
import {fontFamilies, mixColors, withAlpha} from './theme.ts';
import {easeAt, useClock} from './clock.tsx';

import {tokenizeLine, type CodeToken} from './lex.ts';

export function CodeWindow({language, text, highlight = [], palette}: {language: string; text: string; highlight?: number[]; palette: Palette}) {
  const clock = useClock();
  const rows = text.split('\n');
  const total = rows.reduce((sum, row) => sum + row.length + 1, 0);
  const start = 14;
  const typingFrames = Math.max(20, Math.min(clock.duration * 0.55, total * 1.4));
  const progress = clock.settled ? 1 : easeAt(clock, start, typingFrames, t => t);
  let remaining = Math.floor(progress * total);
  const paper = palette.look === 'paper';
  const colors: Record<CodeToken['kind'], string> = paper ? {plain: palette.foreground, keyword: '#c2410c', string: '#2f7d4f', number: '#7a3fb0', comment: withAlpha(palette.foreground, 0.45), call: '#1f5fbf', punct: withAlpha(palette.foreground, 0.7)} : {
    plain: palette.foreground,
    keyword: palette.accent,
    string: mixColors('#f6c177', palette.foreground, 0.1),
    number: palette.accent2,
    comment: withAlpha(palette.foreground, 0.45),
    call: mixColors('#7dcfff', palette.foreground, 0.1),
    punct: withAlpha(palette.foreground, 0.7),
  };
  const open = easeAt(clock, 0, 16);
  const done = progress >= 1;
  const glow = easeAt(clock, start + typingFrames, 12);
  const caretOn = clock.settled ? false : done ? Math.floor(clock.frame / 15) % 2 === 0 : true;
  return (
    <div style={{overflow: 'hidden', ...(paper ? {borderRadius: 6, background: '#ffffff', border: `3px solid ${palette.foreground}`, boxShadow: `10px 10px 0 ${palette.foreground}`} : {borderRadius: 30, background: mixColors(palette.background, '#000000', 0.45), border: `1.5px solid ${palette.panelEdge}`, boxShadow: `0 30px 80px ${withAlpha('#000000', 0.55)}, 0 0 60px ${withAlpha(palette.accent, 0.12)}`}), transform: `translateY(${(1 - open) * 50}px) scale(${0.96 + open * 0.04})`, opacity: open}}>
      <div style={{display: 'flex', alignItems: 'center', gap: 12, padding: '22px 28px', background: paper ? palette.accent : withAlpha(palette.foreground, 0.06), borderBottom: paper ? `3px solid ${palette.foreground}` : undefined}}>
        {['#ff5f57', '#febc2e', '#28c840'].map(color => <span key={color} style={{width: 18, height: 18, borderRadius: 9, background: color}}/>)}
        <span style={{marginLeft: 16, fontFamily: fontFamilies.mono, fontSize: 26, fontWeight: paper ? 700 : 400, color: paper ? palette.onAccent : palette.muted, letterSpacing: 1, textTransform: paper ? 'uppercase' : undefined}}>{language}</span>
      </div>
      <div style={{padding: '26px 0 30px', fontFamily: fontFamilies.mono, fontSize: 34, lineHeight: 1.6}}>
        {rows.map((row, index) => {
          const take = Math.max(0, Math.min(row.length, remaining));
          const began = remaining > 0 || clock.settled;
          remaining -= row.length + 1;
          const lit = highlight.includes(index + 1);
          let budget = take;
          const tokens = tokenizeLine(row).map(token => {
            const shown = token.text.slice(0, Math.max(0, budget));
            budget -= token.text.length;
            return {...token, text: shown};
          });
          const typingHere = !done && began && remaining < 0 && remaining >= -row.length - 1;
          return (
            <div key={index} style={{display: 'flex', whiteSpace: 'pre', paddingRight: 28, background: lit ? withAlpha(palette.accent, 0.12 * glow) : undefined, boxShadow: lit ? `inset 6px 0 0 ${withAlpha(palette.accent, glow)}` : undefined, minHeight: '1.62em'}}>
              <span style={{width: 76, flex: 'none', textAlign: 'right', paddingRight: 24, color: withAlpha(palette.foreground, 0.28)}}>{index + 1}</span>
              <span>
                {tokens.map((token, i) => <span key={i} style={{color: colors[token.kind]}}>{token.text}</span>)}
                {typingHere && caretOn ? <span style={{display: 'inline-block', width: 14, height: '1.1em', verticalAlign: 'text-bottom', background: palette.accent, marginLeft: 2}}/> : null}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
