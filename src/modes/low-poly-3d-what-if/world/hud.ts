export const hudFonts = {serif: 'WhatIfSerif', serifItalic: 'WhatIfSerif', sans: 'WhatIfSans', mono: 'WhatIfMono'} as const;

/** The reference layout is measured on a 720 x 1280 frame; the HUD scales from it to any 9:16 size. */
export const hudDesign = {width: 720, height: 1280} as const;

export type NewsOverlay = {headline: string; ticker: string; channel: string; tag: string};

export type HudState = {
  title?: {lines: readonly string[]; alpha: number};
  kicker: string;
  value: string;
  valueColor: string;
  unit: string;
  aux?: {text: string; kind: 'clock' | 'detail'};
  pill: string;
  hudAlpha: number;
  caption?: {text: string; alpha: number};
  news?: (NewsOverlay & {alpha: number}) | undefined;
  flash: number;
  /** Black over the whole frame, 0 to 1. */
  cover: number;
  final?: {kicker: string; lines: readonly string[]; line: string; alpha: number};
};

const css = `
.wi{position:absolute;left:0;top:0;width:720px;height:1280px;transform-origin:0 0;font-family:${hudFonts.sans},system-ui,sans-serif;color:#fff;overflow:hidden}
.wi *{box-sizing:border-box}
.wi-title{position:absolute;left:0;right:0;top:395px;text-align:center;font:400 54px/1.18 ${hudFonts.serif},serif;text-shadow:0 2px 18px rgba(0,0,0,.35);white-space:pre}
.wi-hud{position:absolute;left:50px;top:196px;width:560px}
.wi-kicker{font:600 16px/1 ${hudFonts.sans},sans-serif;letter-spacing:.24em;text-transform:uppercase;opacity:.88;text-shadow:0 1px 8px rgba(0,0,0,.45)}
.wi-value{margin-top:4px;font:600 72px/1.12 ${hudFonts.serif},serif;letter-spacing:-.01em;text-shadow:0 2px 14px rgba(0,0,0,.4);white-space:nowrap}
.wi-unit{margin-top:6px;height:18px;font:600 14px/18px ${hudFonts.sans},sans-serif;letter-spacing:.2em;text-transform:uppercase;opacity:.92;text-shadow:0 1px 8px rgba(0,0,0,.5);white-space:nowrap}
.wi-aux{margin-top:0;height:18px;font:500 13px/18px ${hudFonts.mono},monospace;letter-spacing:.06em;opacity:.85;text-shadow:0 1px 8px rgba(0,0,0,.5);white-space:nowrap}
.wi-aux.detail{font:600 12px/18px ${hudFonts.sans},sans-serif;letter-spacing:.14em;text-transform:uppercase;opacity:.75}
.wi-pill{display:inline-block;margin-top:8px;padding:6px 11px 5px;background:#d9264a;font:700 11px/1 ${hudFonts.sans},sans-serif;letter-spacing:.18em;text-transform:uppercase;border-radius:2px;box-shadow:0 2px 10px rgba(0,0,0,.25)}
.wi-caption{position:absolute;left:50px;right:70px;top:470px;font:italic 400 38px/1.2 ${hudFonts.serifItalic},serif;text-shadow:0 2px 14px rgba(0,0,0,.55)}
.wi-news{position:absolute;left:0;right:0;bottom:120px}
.wi-news-tag{display:inline-block;margin-left:0;background:#c8102e;padding:8px 14px;font:800 22px/1 ${hudFonts.sans},sans-serif;letter-spacing:.06em;text-transform:uppercase}
.wi-news-head{background:#fff;color:#111;padding:14px 20px 12px;font:800 32px/1.1 ${hudFonts.sans},sans-serif;text-transform:uppercase}
.wi-news-tick{background:#10131a;color:#fff;padding:8px 0;height:34px;overflow:hidden;font:700 19px/1 ${hudFonts.sans},sans-serif;text-transform:uppercase;white-space:nowrap}
.wi-news-chan{position:absolute;right:20px;top:-34px;font:700 18px/1 ${hudFonts.sans},sans-serif;text-transform:uppercase;text-shadow:0 1px 6px rgba(0,0,0,.6)}
.wi-live{position:absolute;right:20px;top:-1120px;background:#c8102e;padding:7px 12px;font:800 18px/1 ${hudFonts.sans},sans-serif;letter-spacing:.08em}
.wi-flash{position:absolute;inset:0;background:#fff;opacity:0}
.wi-cover{position:absolute;inset:0;background:#000;opacity:0}
.wi-final{position:absolute;left:0;right:0;top:560px;text-align:center;padding:0 40px}
.wi-final-kicker{font:700 17px/1 ${hudFonts.sans},sans-serif;letter-spacing:.24em;text-transform:uppercase;color:#e6d37a}
.wi-final-value{margin-top:18px;font:600 40px/1.25 ${hudFonts.serif},serif;color:#fff}
.wi-final-line{margin-top:22px;font:italic 400 30px/1.2 ${hudFonts.serifItalic},serif;color:#fff;opacity:.9}
`;

export type Hud = {element: HTMLDivElement; update(state: HudState): void; fit(width: number): void};

function div(className: string, parent: HTMLElement): HTMLDivElement {
  const el = document.createElement('div');
  el.className = className;
  parent.appendChild(el);
  return el;
}

/** Builds the overlay once; `update` only changes text, colour and opacity, so a frame's HUD is a pure function of its state. */
export function createHud(): Hud {
  const style = document.createElement('style');
  style.textContent = css;
  const root = document.createElement('div');
  root.className = 'wi';
  root.appendChild(style);
  const title = div('wi-title', root);
  const hud = div('wi-hud', root);
  const kicker = div('wi-kicker', hud);
  const value = div('wi-value', hud);
  const unit = div('wi-unit', hud);
  const aux = div('wi-aux', hud);
  const pill = div('wi-pill', hud);
  const caption = div('wi-caption', root);
  const news = div('wi-news', root);
  const newsChannel = div('wi-news-chan', news);
  const tag = div('wi-news-tag', news);
  const head = div('wi-news-head', news);
  const tick = div('wi-news-tick', news);
  const live = div('wi-live', root);
  const flash = div('wi-flash', root);
  const finalBox = div('wi-final', root);
  const finalKicker = div('wi-final-kicker', finalBox);
  const finalValue = div('wi-final-value', finalBox);
  const finalLine = div('wi-final-line', finalBox);
  const cover = div('wi-cover', root);

  return {
    element: root,
    fit(width) {
      root.style.transform = `scale(${width / hudDesign.width})`;
    },
    update(state) {
      title.style.opacity = String(state.title?.alpha ?? 0);
      title.textContent = state.title ? state.title.lines.join('\n') : '';
      hud.style.opacity = String(state.hudAlpha);
      kicker.textContent = state.kicker;
      value.textContent = state.value;
      value.style.color = state.valueColor;
      unit.textContent = state.unit;
      aux.textContent = state.aux?.text ?? '';
      aux.className = `wi-aux ${state.aux?.kind ?? ''}`;
      pill.textContent = state.pill;
      caption.textContent = state.caption?.text ?? '';
      caption.style.opacity = String(state.caption?.alpha ?? 0);
      const n = state.news;
      news.style.display = n ? 'block' : 'none';
      live.style.display = n ? 'block' : 'none';
      if (n) {
        news.style.opacity = String(n.alpha);
        live.style.opacity = String(n.alpha);
        newsChannel.textContent = n.channel;
        tag.textContent = n.tag;
        head.textContent = n.headline;
        tick.textContent = n.ticker;
        live.textContent = 'LIVE';
      }
      flash.style.opacity = String(state.flash);
      cover.style.opacity = String(state.cover);
      finalBox.style.display = state.final ? 'block' : 'none';
      if (state.final) {
        finalBox.style.opacity = String(state.final.alpha);
        finalKicker.textContent = state.final.kicker;
        finalValue.textContent = state.final.lines.join('\n');
        finalValue.style.whiteSpace = 'pre-wrap';
        finalLine.textContent = state.final.line;
      }
    },
  };
}
