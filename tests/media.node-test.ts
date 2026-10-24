import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {inspect, probe} from '../src/media.ts';
import {mixFilter, finishAudio} from '../src/mix.ts';
import {runTool} from '../src/process.ts';
import {StudioError} from '../src/errors.ts';
import type {LoadedJob} from '../src/load.ts';

const hasCode = (code: string) => (error: unknown) => error instanceof Error && 'code' in error && error.code === code;

test('mixFilter normalizes narration and tracks to stereo 48kHz', () => {
  const mockLoaded: Pick<LoadedJob, 'mix' | 'job'> = {
    job: {
      schema_version: '1.0',
      adapter: 'local-fixture',
      job_id: 'test_job',
      status: 'approved_for_visual_production',
      format: {width: 1080, height: 1920, fps: 30, duration_seconds: 5, codec: 'h264', container: 'mp4'},
      inputs: {
        script: {path: 's.json', sha256: 'a'.repeat(64)},
        storyboard: {path: 'sb.json', sha256: 'a'.repeat(64)},
        narration: {path: 'n.wav', sha256: 'a'.repeat(64)},
        timestamps: {path: 't.json', sha256: 'a'.repeat(64)},
        brand: {path: 'b.json', sha256: 'a'.repeat(64)},
        mix: {path: 'm.json', sha256: 'a'.repeat(64)},
      },
      assets: [],
      limits: {max_operation_attempts: 1, max_runtime_seconds: 30, max_input_bytes: 1000, max_output_bytes: 1000, max_frames: 300, concurrency: 1},
    },
    mix: {
      schema_version: '1.0',
      narration_gain_db: -2,
      tracks: [
        {asset_id: 'music', start_seconds: 1, duration_seconds: 3, gain_db: -18, fade_in_seconds: 0.5, fade_out_seconds: 0.5},
      ],
    },
  };
  const filter = mixFilter(mockLoaded);
  assert.match(filter, /\[1:a\]aformat=sample_rates=48000:channel_layouts=stereo/);
  assert.match(filter, /\[2:a\]aformat=sample_rates=48000:channel_layouts=stereo/);
  assert.match(filter, /volume=-2dB/);
  assert.match(filter, /volume=-18dB/);
  assert.match(filter, /amix=inputs=2:duration=longest:normalize=0/);
});

test('inspect rejects truncated or early-ending audio streams', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'media-test-short-audio-'));
  const shortAudioMp4 = resolve(dir, 'short-audio.mp4');
  try {
    await runTool('ffmpeg', [
      '-v', 'error', '-nostdin', '-n',
      '-f', 'lavfi', '-i', 'testsrc=duration=4:size=320x240:rate=30',
      '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=1',
      '-c:v', 'libx264', '-profile:v', 'main', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-ac', '2', '-ar', '48000',
      shortAudioMp4,
    ]);

    await assert.rejects(
      inspect(shortAudioMp4, {width: 320, height: 240, fps: 30, duration_seconds: 4, audio: true}),
      (error: unknown) => {
        assert(error instanceof StudioError);
        assert.equal(error.code, 'TECHNICAL_QA_FAILED');
        const details = error.details as {failed_checks?: string[]};
        assert(Array.isArray(details.failed_checks));
        assert(details.failed_checks.includes('audio_duration'));
        return true;
      },
    );
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
});

test('inspect validates container, sample rate, channels and full decode on valid media', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'media-test-valid-'));
  const validMp4 = resolve(dir, 'valid.mp4');
  const monoMp4 = resolve(dir, 'mono.mp4');
  try {
    await runTool('ffmpeg', [
      '-v', 'error', '-nostdin', '-n',
      '-f', 'lavfi', '-i', 'testsrc=duration=2:size=320x240:rate=30',
      '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=2',
      '-c:v', 'libx264', '-profile:v', 'main', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-ac', '2', '-ar', '48000',
      validMp4,
    ]);

    const report = await inspect(validMp4, {width: 320, height: 240, fps: 30, duration_seconds: 2, audio: true});
    assert.equal(report.technical_validation, 'passed');
    assert.equal(report.checks.full_decode, true);
    assert.equal(report.checks.single_h264_video, true);
    assert.equal(report.checks.container, true);
    assert.equal(report.checks.audio_channels, true);
    assert.equal(report.checks.audio_sample_rate, true);
    assert.equal(report.checks.audio_duration, true);
    assert.equal(report.checks.h264_profile, true);

    await runTool('ffmpeg', [
      '-v', 'error', '-nostdin', '-n',
      '-f', 'lavfi', '-i', 'testsrc=duration=2:size=320x240:rate=30',
      '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=2',
      '-c:v', 'libx264', '-profile:v', 'main', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-ac', '1', '-ar', '48000',
      monoMp4,
    ]);

    await assert.rejects(
      inspect(monoMp4, {width: 320, height: 240, fps: 30, duration_seconds: 2, audio: true}),
      (error: unknown) => {
        assert(error instanceof StudioError);
        assert.equal(error.code, 'TECHNICAL_QA_FAILED');
        const details = error.details as {failed_checks?: string[]};
        assert(details.failed_checks?.includes('audio_channels'));
        return true;
      },
    );

    const monoReport = await inspect(monoMp4, {width: 320, height: 240, fps: 30, duration_seconds: 2, audio: true, channels: 1});
    assert.equal(monoReport.technical_validation, 'passed');
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
});

test('inspect rejects quicktime mov container even with mp4 extension', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'media-test-mov-'));
  const movNamedMp4 = resolve(dir, 'fixture.mp4');
  try {
    await runTool('ffmpeg', [
      '-v', 'error', '-nostdin', '-n',
      '-f', 'lavfi', '-i', 'testsrc=duration=1:size=320x240:rate=30',
      '-c:v', 'libx264', '-profile:v', 'main', '-pix_fmt', 'yuv420p',
      '-f', 'mov',
      movNamedMp4,
    ]);

    await assert.rejects(
      inspect(movNamedMp4, {width: 320, height: 240, fps: 30, duration_seconds: 1, audio: false}),
      (error: unknown) => {
        assert(error instanceof StudioError);
        assert.equal(error.code, 'TECHNICAL_QA_FAILED');
        const details = error.details as {failed_checks?: string[]};
        assert(details.failed_checks?.includes('container'));
        return true;
      },
    );
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
});

test('inspect accepts constrained baseline profile and rejects incompatible profiles', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'media-test-profiles-'));
  const baselineMp4 = resolve(dir, 'baseline.mp4');
  const high444Mp4 = resolve(dir, 'high444.mp4');
  try {
    await runTool('ffmpeg', [
      '-v', 'error', '-nostdin', '-n',
      '-f', 'lavfi', '-i', 'testsrc=duration=1:size=320x240:rate=30',
      '-c:v', 'libx264', '-profile:v', 'baseline', '-pix_fmt', 'yuv420p',
      baselineMp4,
    ]);
    const baselineInfo = await probe(baselineMp4);
    assert.equal(baselineInfo.streams[0]?.profile, 'Constrained Baseline');
    const baselineReport = await inspect(baselineMp4, {width: 320, height: 240, fps: 30, duration_seconds: 1, audio: false});
    assert.equal(baselineReport.technical_validation, 'passed');
    assert.equal(baselineReport.checks.h264_profile, true);

    await runTool('ffmpeg', [
      '-v', 'error', '-nostdin', '-n',
      '-f', 'lavfi', '-i', 'testsrc=duration=1:size=320x240:rate=30',
      '-c:v', 'libx264', '-profile:v', 'high444', '-pix_fmt', 'yuv444p',
      high444Mp4,
    ]);
    await assert.rejects(
      inspect(high444Mp4, {width: 320, height: 240, fps: 30, duration_seconds: 1, audio: false}),
      (error: unknown) => {
        assert(error instanceof StudioError);
        assert.equal(error.code, 'TECHNICAL_QA_FAILED');
        const details = error.details as {failed_checks?: string[]};
        assert(details.failed_checks?.includes('h264_profile'));
        assert(details.failed_checks?.includes('pixel_format'));
        return true;
      },
    );
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
});

test('finishAudio preserves stereo channel layout and signal separation', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'media-test-finish-'));
  try {
    const visual = resolve(dir, 'visual.mp4');
    const narration = resolve(dir, 'narration.wav');
    const music = resolve(dir, 'music.wav');

    await runTool('ffmpeg', [
      '-v', 'error', '-nostdin', '-n',
      '-f', 'lavfi', '-i', 'testsrc=duration=2:size=320x240:rate=30',
      '-c:v', 'libx264', '-profile:v', 'main', '-pix_fmt', 'yuv420p',
      visual,
    ]);
    await runTool('ffmpeg', [
      '-v', 'error', '-nostdin', '-n',
      '-f', 'lavfi', '-i', 'sine=frequency=200:sample_rate=48000:duration=2',
      '-ac', '1',
      narration,
    ]);
    await runTool('ffmpeg', [
      '-v', 'error', '-nostdin', '-n',
      '-f', 'lavfi', '-i', 'sine=frequency=800:sample_rate=48000:duration=2',
      '-filter_complex', '[0:a]pan=stereo|c0=c0|c1=0*c0[a]',
      '-map', '[a]',
      '-c:a', 'pcm_s16le',
      music,
    ]);

    const mockJob: LoadedJob = {
      job: {
        schema_version: '1.0',
        adapter: 'local-fixture',
        job_id: 'finish_job',
        status: 'approved_for_visual_production',
        format: {width: 1080, height: 1920, fps: 30, duration_seconds: 2, codec: 'h264', container: 'mp4'},
        inputs: {
          script: {path: 's.json', sha256: 'a'.repeat(64)},
          storyboard: {path: 'sb.json', sha256: 'a'.repeat(64)},
          narration: {path: 'n.wav', sha256: 'a'.repeat(64)},
          timestamps: {path: 't.json', sha256: 'a'.repeat(64)},
          brand: {path: 'b.json', sha256: 'a'.repeat(64)},
          mix: {path: 'm.json', sha256: 'a'.repeat(64)},
        },
        assets: [],
        limits: {max_operation_attempts: 1, max_runtime_seconds: 30, max_input_bytes: 1000, max_output_bytes: 1000, max_frames: 300, concurrency: 1},
      },
      root: dir,
      manifestPath: resolve(dir, 'job.json'),
      paths: {script: '', storyboard: '', narration, timestamps: '', brand: '', mix: ''},
      assetPaths: {music_asset: music},
      script: {schema_version: '1.0', segments: []},
      storyboard: {schema_version: '1.0', scenes: []},
      timing: {schema_version: '1.0', audio_sha256: 'a'.repeat(64), duration_seconds: 2, words: []},
      brand: {schema_version: '1.0', brand_id: 'b', version: '1', background: '#000000', foreground: '#ffffff', accent: '#00ff00', font_asset_id: 'f', caption_mode: 'word-highlight', safe_area: {top: 0, bottom: 0, left: 0, right: 0}},
      mix: {
        schema_version: '1.0',
        narration_gain_db: 0,
        tracks: [{asset_id: 'music_asset', start_seconds: 0, duration_seconds: 2, gain_db: -12, fade_in_seconds: 0, fade_out_seconds: 0}],
      },
      timeline: {schema_version: '1.0', job_id: 'finish_job', rounding: 'nearest-half-up', fps: 30, width: 1080, height: 1920, durationInFrames: 60, scenes: [], words: []},
      inputHash: 'a'.repeat(64),
      manifestHash: 'b'.repeat(64),
    };

    const finalName = await finishAudio(mockJob, visual, dir, Date.now() + 30_000);
    assert.equal(finalName, 'final.mp4');
    const finalPath = resolve(dir, finalName);
    const finalInfo = await probe(finalPath);
    const audioStream = finalInfo.streams.find(s => s.codec_type === 'audio');
    assert.equal(audioStream?.channels, 2);
    assert.equal(audioStream?.sample_rate, '48000');

    const diffWav = resolve(dir, 'diff.wav');
    await runTool('ffmpeg', ['-v', 'error', '-nostdin', '-n', '-i', finalPath, '-filter_complex', '[0:a]pan=mono|c0=c0-c1[diff]', '-map', '[diff]', '-c:a', 'pcm_s16le', diffWav]);
    const diffBytes = await readFile(diffWav);
    let totalDifference = 0;
    let nonZeroSamples = 0;
    for (let i = 44 + 2048; i < diffBytes.length - 2048; i += 2) {
      const sample = Math.abs(diffBytes.readInt16LE(i));
      if (sample > 100) nonZeroSamples++;
      totalDifference += sample;
    }
    const sampleCount = (diffBytes.length - 44 - 4096) / 2;
    const avgDifference = totalDifference / sampleCount;

    assert(nonZeroSamples > 1000);
    assert(avgDifference > 500);

    const report = await inspect(finalPath, {width: 320, height: 240, fps: 30, duration_seconds: 2, audio: true});
    assert.equal(report.technical_validation, 'passed');
    assert.equal(report.checks.audio_channels, true);
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
});

test('runTool preserves secrecy and handles invalid deadline', async () => {
  await assert.rejects(runTool('ffmpeg', [], 0), hasCode('DEADLINE_EXCEEDED'));
  await assert.rejects(runTool('ffmpeg', [], -5), hasCode('DEADLINE_EXCEEDED'));
  await assert.rejects(
    runTool('ffmpeg', ['-invalid-option-that-fails']),
    (error: unknown) => {
      assert(error instanceof StudioError);
      assert.equal(error.code, 'TOOL_FAILED');
      assert.equal(error.message, 'ffmpeg failed');
      assert(!error.message.includes('-invalid-option-that-fails'));
      return true;
    },
  );
});
