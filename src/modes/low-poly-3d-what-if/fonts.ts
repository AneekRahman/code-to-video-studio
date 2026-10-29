import {cp} from 'node:fs/promises';
import {basename, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import type {StagedFont} from './rendering/scene.tsx';

const file = (spec: string) => fileURLToPath(import.meta.resolve(spec));

const fonts = [
  {family: 'WhatIfSerif', weight: '400', style: 'normal', path: file('@fontsource/lora/files/lora-latin-400-normal.woff2')},
  {family: 'WhatIfSerif', weight: '600', style: 'normal', path: file('@fontsource/lora/files/lora-latin-600-normal.woff2')},
  {family: 'WhatIfSerif', weight: '400', style: 'italic', path: file('@fontsource/lora/files/lora-latin-400-italic.woff2')},
  {family: 'WhatIfSans', weight: '600', style: 'normal', path: file('@fontsource/inter/files/inter-latin-600-normal.woff2')},
  {family: 'WhatIfSans', weight: '700', style: 'normal', path: file('@fontsource/inter/files/inter-latin-700-normal.woff2')},
  {family: 'WhatIfSans', weight: '800', style: 'normal', path: file('@fontsource/inter/files/inter-latin-800-normal.woff2')},
  {family: 'WhatIfMono', weight: '500', style: 'normal', path: file('@fontsource/jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff2')},
] as const;

/** Copies the pinned font files into `publicDir` and returns how the composition loads them. */
export async function stageWhatIfFonts(publicDir: string): Promise<StagedFont[]> {
  const staged: StagedFont[] = [];
  for (const font of fonts) {
    await cp(font.path, resolve(publicDir, basename(font.path)), {force: true});
    staged.push({file: basename(font.path), family: font.family, weight: font.weight, style: font.style});
  }
  return staged;
}
