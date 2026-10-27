import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {generateAudio} from '../src/audio.ts';
import {createMockAudioProvider} from '../src/audiogen/mock.ts';
import {REVIEW_MAX_BYTES, reviewRateCap} from '../src/review-size.ts';
import {composePlatePrompt} from '../src/modes/isometric-art-zombie-apocalypse/style.ts';

const mode = (name: string) => fileURLToPath(new URL(`../src/modes/isometric-art-zombie-apocalypse/${name}`, import.meta.url));

test('the backend speaks with backend_voice_id; direct providers keep the designed voice', async () => {
  for (const backend of [true, false]) {
    const out = await mkdtemp(join(tmpdir(), 'studio-backend-voice-'));
    try {
      const mock = createMockAudioProvider();
      const voices: string[] = [];
      const provider = {...mock, backend, speak: (request: Parameters<typeof mock.speak>[0], signal: AbortSignal) => { voices.push(request.voice_id); return mock.speak(request, signal); }};
      await generateAudio({story: mode('story.template.json'), sound: mode('sound.template.json'), out, provider});
      assert.equal(voices.includes('backendconfigured'), backend);
      assert.ok(voices.includes('39VEjjybOLlt9SowNQxJ') === !backend);
    } finally {
      await rm(out, {recursive: true, force: true});
    }
  }
});

test('the review rate cap keeps a 30-60 s export under the review limit', () => {
  for (const seconds of [30, 48.7, 60]) {
    const kbps = Number(reviewRateCap(seconds).encodingMaxRate.replace('k', ''));
    const bytes = ((kbps + 192) * 1000 / 8) * seconds;
    assert.ok(bytes < REVIEW_MAX_BYTES * 0.92, `${seconds}s → ${bytes}`);
  }
});

test('every template plate prompt fits the backend 1000-character limit', async () => {
  const plates = JSON.parse(await readFile(mode('plates.template.json'), 'utf8')) as {plates: Parameters<typeof composePlatePrompt>[0][]};
  for (const plate of plates.plates) assert.ok(composePlatePrompt(plate).length <= 1000, plate.plate_id);
});
