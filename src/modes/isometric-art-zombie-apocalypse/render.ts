import {cp} from 'node:fs/promises';
import {basename, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {requireCondition} from '../../errors.ts';
import type {CompiledShot, PlateRef} from './shots.ts';
import type {StoryProps} from './story.ts';

export const storyFonts = {
  display: fileURLToPath(import.meta.resolve('@fontsource/bebas-neue/files/bebas-neue-latin-400-normal.woff2')),
  mono: fileURLToPath(import.meta.resolve('@fontsource/vt323/files/vt323-latin-400-normal.woff2')),
  caption: fileURLToPath(import.meta.resolve('@fontsource/inter/files/inter-latin-800-normal.woff2')),
};

export type StagedPlate = PlateRef & {file: string};

export async function stagePlates(shots: CompiledShot[], plates: Record<string, StagedPlate>, publicDir: string): Promise<Record<string, PlateRef>> {
  const staged: Record<string, PlateRef> = {};
  for (const id of new Set(shots.map(s => s.plate_id))) {
    const plate = plates[id];
    requireCondition(plate, 'MISSING_PLATE', `A shot references unknown plate ${id}`);
    await cp(plate.file, resolve(publicDir, plate.src), {errorOnExist: true, force: false});
    staged[id] = {src: plate.src, width: plate.width, height: plate.height};
  }
  return staged;
}

export async function stageFonts(publicDir: string): Promise<StoryProps['fonts']> {
  const fonts = {} as StoryProps['fonts'];
  for (const [key, path] of Object.entries(storyFonts) as [keyof typeof storyFonts, string][]) {
    await cp(path, resolve(publicDir, basename(path)), {errorOnExist: true, force: false});
    fonts[key] = basename(path);
  }
  return fonts;
}
