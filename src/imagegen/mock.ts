import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {runTool} from '../process.ts';
import type {GeneratedImage, ImageProvider, ImageRequest} from './provider.ts';

export function createMockImageProvider(): ImageProvider {
  return {
    provider_id: 'mock',
    model: 'ffmpeg-gradient',
    max_prompt_chars: 2000,
    validateSize() {},
    async generate(request: ImageRequest): Promise<GeneratedImage> {
      const digest = createHash('sha256').update(`${request.seed}:${request.prompt}`).digest('hex');
      const dir = await mkdtemp(join(tmpdir(), 'studio-mock-image-'));
      try {
        const out = join(dir, 'plate.png');
        await runTool('ffmpeg', ['-v', 'error', '-nostdin', '-n', '-f', 'lavfi', '-i', `gradients=s=${request.width}x${request.height}:c0=0x${digest.slice(0, 6)}:c1=0x${digest.slice(6, 12)}:seed=${request.seed}:duration=1:rate=1`, '-frames:v', '1', out]);
        return {bytes: await readFile(out), format: 'png', seed: request.seed, provider_request_ms: 0};
      } finally {
        await rm(dir, {recursive: true, force: true});
      }
    },
  };
}
