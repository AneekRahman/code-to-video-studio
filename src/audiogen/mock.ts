import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {runTool} from '../process.ts';
import type {AudioProvider, CharacterAlignment} from './provider.ts';

const secondsPerCharacter = 0.06;

async function tone(seconds: number, frequency: number): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), 'studio-mock-audio-'));
  try {
    const out = join(dir, 'clip.mp3');
    await runTool('ffmpeg', ['-v', 'error', '-nostdin', '-n', '-f', 'lavfi', '-i', `sine=frequency=${frequency}:sample_rate=44100:duration=${seconds.toFixed(3)}`, '-c:a', 'libmp3lame', '-b:a', '64k', out]);
    return await readFile(out);
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
}

export function mockAlignment(text: string): CharacterAlignment {
  const characters = [...text];
  return {characters, starts: characters.map((_, i) => i * secondsPerCharacter), ends: characters.map((_, i) => (i + 1) * secondsPerCharacter)};
}

export function createMockAudioProvider(): AudioProvider {
  return {
    provider_id: 'mock',
    models: {speech_default: 'ffmpeg-sine', effect: 'ffmpeg-sine', music: 'ffmpeg-sine'},
    async speak(request) {
      const alignment = mockAlignment(request.text);
      return {bytes: await tone(alignment.ends.at(-1)! + 0.1, 220), alignment, provider_request_ms: 0};
    },
    async effect(request) {
      return {bytes: await tone(request.duration_seconds, 660), provider_request_ms: 0};
    },
    async music(request) {
      return {bytes: await tone(request.duration_seconds, 110), provider_request_ms: 0};
    },
  };
}
