/**
 * The public contract for modes in `local-modes/`. A local mode imports studio code only from this file and from
 * `src/rendering/mode-api.tsx`; everything else in `src/` may change in any release.
 */
export {defineMode, modeApiVersion, type LoadedJobBase, type ModeCard, type ModeRuntime, type StudioMode} from './modes/mode.ts';
export {loadJobFiles, modeJobSchema, type JobEnvelope} from './job-files.ts';
export {readJson, sha256, writeJson} from './files.ts';
export {StudioError, requireCondition} from './errors.ts';
export {inspect, probe, type ExpectedProfile} from './media.ts';
export {runTool, runToolCapture} from './process.ts';
export {renderComposition, writeContactSheet, type CompositionRequest, type StillRequest} from './composition.ts';
export {resolveSecret} from './imagegen/credentials.ts';
export type {GeneratedImage, ImageProvider, ImageRequest} from './imagegen/provider.ts';
export {createMockImageProvider} from './imagegen/mock.ts';
export {createNimFluxProvider} from './imagegen/nim-flux.ts';
export type {AudioProvider, EffectRequest, GeneratedAudio, GeneratedSpeech, MusicRequest, SpeechRequest} from './audiogen/provider.ts';
export {createMockAudioProvider} from './audiogen/mock.ts';
export {createElevenLabsProvider} from './audiogen/elevenlabs.ts';
