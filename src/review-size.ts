/** Pegasus review, the gate for autonomous completion, accepts an export of at most 16 MiB. */
export const REVIEW_MAX_BYTES = 16 * 1024 * 1024;
/** Encode target with headroom for the audio track, container overhead and rate-control overshoot. */
const TARGET_BYTES = 14.5 * 1024 * 1024;
const AUDIO_KBPS = 192;

/** A capped-CRF rate limit so an export of this length stays under the review limit. */
export function reviewRateCap(durationSeconds: number): {encodingMaxRate: `${number}k`; encodingBufferSize: `${number}k`} {
  const totalKbps = (TARGET_BYTES * 8) / 1000 / Math.max(1, durationSeconds);
  const videoKbps = Math.max(800, Math.floor(totalKbps - AUDIO_KBPS));
  return {encodingMaxRate: `${videoKbps}k` as const, encodingBufferSize: `${videoKbps * 2}k` as const};
}
