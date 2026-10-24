import {z} from 'zod';
import {StudioError, requireCondition} from '../errors.ts';
import {isMp3, type AudioProvider, type GeneratedAudio} from './provider.ts';

/**
 * ElevenLabs REST API, observed 2026-10: `/v1/text-to-speech/{voice}/with-timestamps`
 * returns base64 MP3 plus per-character alignment of the original text;
 * `/v1/sound-generation` accepts 0.5-30 s; `/v1/music` accepts 10 s-5 min.
 */
const base = 'https://api.elevenlabs.io';

const SpeechResponseSchema = z.object({
  audio_base64: z.string().min(1),
  alignment: z.object({characters: z.array(z.string()), character_start_times_seconds: z.array(z.number()), character_end_times_seconds: z.array(z.number())}),
});

export function createElevenLabsProvider(apiKey: string): AudioProvider {
  async function post(path: string, body: unknown, signal: AbortSignal): Promise<Response> {
    let response: Response;
    try {
      response = await fetch(`${base}${path}`, {method: 'POST', headers: {'xi-api-key': apiKey, 'Content-Type': 'application/json'}, body: JSON.stringify(body), signal});
    } catch {
      throw new StudioError(signal.aborted ? 'DEADLINE_EXCEEDED' : 'PROVIDER_UNAVAILABLE', 'Audio provider request did not complete');
    }
    if (response.status === 400 || response.status === 422) throw new StudioError('PROVIDER_REFUSED', `Audio provider rejected the request with HTTP ${response.status}`, {http_status: response.status});
    if (!response.ok) throw new StudioError('PROVIDER_REJECTED', `Audio provider returned HTTP ${response.status}`, {http_status: response.status});
    return response;
  }
  async function mp3(path: string, body: unknown, signal: AbortSignal): Promise<GeneratedAudio> {
    const started = Date.now();
    const bytes = Buffer.from(await (await post(path, body, signal)).arrayBuffer());
    requireCondition(isMp3(bytes), 'PROVIDER_PROTOCOL', 'Audio provider returned bytes that are not MP3');
    return {bytes, provider_request_ms: Date.now() - started};
  }
  return {
    provider_id: 'elevenlabs',
    models: {speech_default: 'eleven_v4', effect: 'eleven_text_to_sound_v2', music: 'music_v1'},
    async speak(request, signal) {
      const started = Date.now();
      const body = {text: request.text, model_id: request.model, seed: request.seed, ...(request.settings ? {voice_settings: request.settings} : {})};
      const response = await post(`/v1/text-to-speech/${encodeURIComponent(request.voice_id)}/with-timestamps?output_format=mp3_44100_128`, body, signal);
      const parsed = SpeechResponseSchema.safeParse(await response.json());
      requireCondition(parsed.success, 'PROVIDER_PROTOCOL', 'Speech response has an unexpected shape');
      const bytes = Buffer.from(parsed.data.audio_base64, 'base64');
      requireCondition(isMp3(bytes), 'PROVIDER_PROTOCOL', 'Speech provider returned bytes that are not MP3');
      const a = parsed.data.alignment;
      return {bytes, alignment: {characters: a.characters, starts: a.character_start_times_seconds, ends: a.character_end_times_seconds}, provider_request_ms: Date.now() - started};
    },
    effect(request, signal) {
      return mp3('/v1/sound-generation?output_format=mp3_44100_128', {text: request.prompt, duration_seconds: request.duration_seconds, prompt_influence: request.prompt_influence, loop: request.loop, model_id: this.models.effect}, signal);
    },
    music(request, signal) {
      return mp3('/v1/music?output_format=mp3_44100_128', {prompt: request.prompt, music_length_ms: Math.round(request.duration_seconds * 1000), model_id: this.models.music, force_instrumental: true}, signal);
    },
  };
}
