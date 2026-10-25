import type {SourceArtifact} from '../generation-source.ts';
export type SpeechRequest = {
  voice_id: string;
  model: string;
  text: string;
  seed: number;
  settings?: Record<string, number | boolean>;
};

/** Per-character timing of the synthesised clip; `characters` joined equals the request text. */
export type CharacterAlignment = {characters: string[]; starts: number[]; ends: number[]};

export type GeneratedSpeech = {source_artifacts?: SourceArtifact[]; bytes: Buffer; alignment: CharacterAlignment; provider_request_ms: number};

export type EffectRequest = {prompt: string; duration_seconds: number; prompt_influence: number; loop: boolean};

export type MusicRequest = {prompt: string; duration_seconds: number};

export type GeneratedAudio = {source_artifacts?: SourceArtifact[]; bytes: Buffer; provider_request_ms: number};

/** A speech, sound-effect and music backend returning MP3 bytes. Implementations must never log or return credentials. */
export interface AudioProvider {
  readonly provider_id: string;
  readonly models: {speech_default: string; effect: string; music: string};
  speak(request: SpeechRequest, signal: AbortSignal): Promise<GeneratedSpeech>;
  effect(request: EffectRequest, signal: AbortSignal): Promise<GeneratedAudio>;
  music(request: MusicRequest, signal: AbortSignal): Promise<GeneratedAudio>;
}

export function isMp3(bytes: Buffer): boolean {
  if (bytes.length < 3) return false;
  if (bytes.subarray(0, 3).toString('latin1') === 'ID3') return true;
  return bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0;
}
