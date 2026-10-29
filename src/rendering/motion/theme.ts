import type {CSSProperties} from 'react';

export function parseHex(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = parseHex(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function mixColors(a: string, b: string, amount: number): string {
  const [ar, ag, ab] = parseHex(a);
  const [br, bg, bb] = parseHex(b);
  const channel = (x: number, y: number) => Math.round(x + (y - x) * amount).toString(16).padStart(2, '0');
  return `#${channel(ar, br)}${channel(ag, bg)}${channel(ab, bb)}`;
}

export function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map(v => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function readableOn(hex: string): string {
  return luminance(hex) > 0.35 ? '#0b1020' : '#ffffff';
}

export function rotateHue(hex: string, degrees: number): string {
  const [r, g, b] = parseHex(hex).map(v => v / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d > 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  const hue = (((h + degrees) % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  const [r1, g1, b1] = hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0] : hue < 180 ? [0, c, x] : hue < 240 ? [0, x, c] : hue < 300 ? [x, 0, c] : [c, 0, x];
  return `#${[r1, g1, b1].map(v => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('')}`;
}

export type Look = 'studio' | 'paper';

export type Palette = {look: Look; background: string; foreground: string; accent: string; accent2: string; onAccent: string; muted: string; panel: string; panelEdge: string};

export function paletteFor(brand: {background: string; foreground: string; accent: string; look?: Look | undefined}): Palette {
  return {
    look: brand.look ?? 'studio',
    background: brand.background,
    foreground: brand.foreground,
    accent: brand.accent,
    accent2: rotateHue(brand.accent, 42),
    onAccent: readableOn(brand.accent),
    muted: withAlpha(brand.foreground, 0.62),
    panel: withAlpha(brand.foreground, 0.075),
    panelEdge: withAlpha(brand.foreground, 0.16),
  };
}

export const fontFamilies = {body: 'StudioBrand', display: 'StudioDisplay, StudioBrand', mono: 'StudioMono, monospace'} as const;

/** The card every treatment sits on: soft glass in the studio look, a hard-edged sheet with an offset shadow in the paper look. */
export function surface(palette: Palette, tone: 'plain' | 'accent' = 'plain'): CSSProperties {
  if (palette.look === 'paper') {
    return {
      background: tone === 'accent' ? palette.accent : '#ffffff',
      color: tone === 'accent' ? palette.onAccent : palette.foreground,
      border: `3px solid ${palette.foreground}`,
      borderRadius: 6,
      boxShadow: `9px 9px 0 ${palette.foreground}`,
    };
  }
  if (tone === 'accent') {
    return {background: `linear-gradient(135deg, ${palette.accent}, ${palette.accent2})`, color: palette.onAccent, borderRadius: 30, boxShadow: `0 24px 70px ${withAlpha(palette.accent, 0.4)}`};
  }
  return {
    background: `linear-gradient(135deg, ${withAlpha(palette.foreground, 0.1)}, ${withAlpha(palette.foreground, 0.04)})`,
    border: `1.5px solid ${palette.panelEdge}`,
    borderRadius: 30,
    boxShadow: `0 18px 50px ${withAlpha('#000000', 0.32)}`,
  };
}
