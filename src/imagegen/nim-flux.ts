import {z} from 'zod';
import {StudioError, requireCondition} from '../errors.ts';
import {detectRasterFormat, type GeneratedImage, type ImageProvider, type ImageRequest} from './provider.ts';

/**
 * Hosted NVIDIA NIM FLUX 3 Image Klein, observed 2026-10: generation only (no
 * reference images), sides 512-1568 in steps of 16, at most 1,062,400 pixels,
 * prompt <= 2000 characters, steps 1-50, guidance > 1, JPEG output.
 */
const endpoint = 'https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux-3-image-klein';

const ResponseSchema = z.object({
  artifacts: z.array(z.object({base64: z.string().optional(), finishReason: z.string(), seed: z.number().optional()})).min(1),
});

export function createNimFluxProvider(apiKey: string, options: {steps?: number; cfg_scale?: number} = {}): ImageProvider {
  const steps = options.steps ?? 50;
  const cfgScale = options.cfg_scale ?? 3.5;
  return {
    provider_id: 'nvidia-nim-hosted',
    model: 'black-forest-labs/flux-3-image-klein',
    max_prompt_chars: 2000,
    validateSize(width, height) {
      const onGrid = (side: number) => Number.isInteger(side) && side >= 512 && side <= 1568 && side % 16 === 0;
      requireCondition(onGrid(width) && onGrid(height) && width * height <= 1_062_400, 'UNSUPPORTED_SIZE', 'FLUX 3 Klein accepts 512-1568 px sides in steps of 16 and at most 1,062,400 pixels');
    },
    async generate(request: ImageRequest, signal: AbortSignal): Promise<GeneratedImage> {
      this.validateSize(request.width, request.height);
      requireCondition(request.prompt.length <= this.max_prompt_chars, 'PROMPT_TOO_LONG', 'Prompt exceeds the provider limit');
      const started = Date.now();
      let response: Response;
      try {
        response = await fetch(endpoint, {
          method: 'POST',
          headers: {Authorization: `Bearer ${apiKey}`, Accept: 'application/json', 'Content-Type': 'application/json'},
          body: JSON.stringify({prompt: request.prompt, width: request.width, height: request.height, seed: request.seed, steps, cfg_scale: cfgScale}),
          signal,
        });
      } catch {
        throw new StudioError(signal.aborted ? 'DEADLINE_EXCEEDED' : 'PROVIDER_UNAVAILABLE', 'Image provider request did not complete');
      }
      if (!response.ok) throw new StudioError('PROVIDER_REJECTED', `Image provider returned HTTP ${response.status}`, {http_status: response.status});
      const parsed = ResponseSchema.safeParse(await response.json());
      requireCondition(parsed.success, 'PROVIDER_PROTOCOL', 'Image provider response has an unexpected shape');
      const artifact = parsed.data.artifacts[0]!;
      requireCondition(artifact.finishReason === 'SUCCESS' && artifact.base64, 'PROVIDER_REFUSED', `Image provider finished with ${artifact.finishReason}`);
      const bytes = Buffer.from(artifact.base64, 'base64');
      const format = detectRasterFormat(bytes);
      requireCondition(format, 'PROVIDER_PROTOCOL', 'Image provider returned bytes that are not JPEG or PNG');
      return {bytes, format, seed: artifact.seed ?? request.seed, provider_request_ms: Date.now() - started};
    },
  };
}
