import {mkdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {parseArgs} from 'node:util';
import {resolveSecret} from '../src/imagegen/credentials.ts';
import {createNimFluxProvider} from '../src/imagegen/nim-flux.ts';

const style = 'Bold flat paper-cutout collage meme illustration on a warm cream background, thick black outlines, flat vivid orange (#e8764b) and black accents with a little off-white, chunky soft 3D clay shapes with gentle studio lighting, expressive cartoon characters, big comedic emotion, strong clear silhouette, subject centered with breathing room, no text, no letters, no numbers, no logos, no watermark.';

export const showcaseArt: {id: string; width: number; height: number; seed: number; prompt: string; alt: string}[] = [
  {id: 'hook', width: 768, height: 1344, seed: 11, prompt: `Vertical meme poster. A tiny panicking cartoon video editor with huge sweating eyes sits in a swivel chair in the middle of a tornado of tangled film strips, floating app windows, clock faces and coffee cups. Above the chaos a smug calm orange clay robot hand holds one big glowing green button. ${style}`, alt: `Vertical poster. A wide-eyed overwhelmed cartoon film editor on a rolling chair surrounded by a swirl of film strips, floating windows and coffee mugs, while a calm friendly orange clay robot arm reaches down to press one big green button. ${style}`},
  {id: 'frames', width: 1344, height: 768, seed: 23, prompt: `A hyperactive orange clay film reel character with a goofy confident grin, spinning like a roulette wheel while thirty tiny picture frames fly off it like confetti playing cards, motion lines, joyful chaos. ${style}`, alt: `A cheerful orange clay film reel mascot with a big smile, little picture frames bursting out of it like confetti. ${style}`},
  {id: 'versus', width: 1344, height: 768, seed: 37, prompt: `Two-panel reaction meme. Left panel: an exhausted sweating cartoon editor dragging heavy film clips on a tangled timeline. Right panel: a relaxed smug cartoon character in sunglasses sipping coffee while neat lines of code scroll by on a laptop. Clear vertical divider between the panels. ${style}`, alt: `Two-panel comparison cartoon. Left: a tired cartoon editor surrounded by heavy film reels. Right: a relaxed cartoon character in sunglasses with a coffee beside a laptop showing neat code. ${style}`},
  {id: 'review', width: 1344, height: 768, seed: 41, prompt: `A smug cartoon cat in a tiny white lab coat and goggles stamping a giant green approved checkmark onto a tall stack of paper checklists, ink splatter, confident chin-up pose. ${style}`, alt: `A cheerful cartoon cat in a tiny lab coat holding a big rubber stamp with a green checkmark over a stack of papers. ${style}`},
];

const {values} = parseArgs({options: {out: {type: 'string'}, only: {type: 'string'}}});
const out = resolve(values.out ?? 'work/showcase-art');
await mkdir(out, {recursive: true, mode: 0o700});
const provider = createNimFluxProvider(await resolveSecret('NVIDIA_NIM'));
for (const item of showcaseArt.filter(art => !values.only || values.only.split(',').includes(art.id))) {
  const attempts = [{prompt: item.prompt, seed: item.seed}, {prompt: item.alt, seed: item.seed}, {prompt: item.alt, seed: item.seed + 1000}];
  for (const [index, attempt] of attempts.entries()) {
    try {
      const image = await provider.generate({prompt: attempt.prompt, width: item.width, height: item.height, seed: attempt.seed}, AbortSignal.timeout(240_000));
      await writeFile(resolve(out, `${item.id}.jpg`), image.bytes);
      process.stdout.write(`${JSON.stringify({id: item.id, attempt: index + 1, bytes: image.bytes.length, ms: image.provider_request_ms})}\n`);
      break;
    } catch (error) {
      const filtered = error instanceof Error && 'code' in error && error.code === 'PROVIDER_REFUSED';
      if (!filtered || index === attempts.length - 1) throw error;
      process.stdout.write(`${JSON.stringify({id: item.id, attempt: index + 1, filtered: true})}\n`);
    }
  }
}
