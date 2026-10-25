import type {SourceArtifact} from '../generation-source.ts';
export type ImageRequest = {
  prompt: string;
  width: number;
  height: number;
  seed: number;
};

export type GeneratedImage = {
  bytes: Buffer;
  source_artifacts?: SourceArtifact[];
  format: 'jpeg' | 'png';
  seed: number;
  provider_request_ms: number;
};

/** A still-image backend. Implementations must never log or return credentials. */
export interface ImageProvider {
  readonly provider_id: string;
  readonly model: string;
  readonly max_prompt_chars: number;
  validateSize(width: number, height: number): void;
  generate(request: ImageRequest, signal: AbortSignal): Promise<GeneratedImage>;
}

export function detectRasterFormat(bytes: Buffer): 'jpeg' | 'png' | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  return null;
}
