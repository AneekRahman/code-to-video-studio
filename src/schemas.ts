import {z} from 'zod';
import {SegmentTimingSchema, StorySchema} from './modes/isometric-art-zombie-apocalypse/story.ts';
import {SoundSchema} from './modes/isometric-art-zombie-apocalypse/sound.ts';
import {ModeCardSchema} from './modes/mode.ts';
import {ModeRequestSchema} from './modes/request.ts';
import {BrandSchema, JobSchema, StoryJobSchema, MixSchema, ScriptSchema, StoryboardSchema, TimingSchema} from './contracts.ts';

export function schemas() {
  return Object.fromEntries(Object.entries({job: JobSchema, story_job: StoryJobSchema, script: ScriptSchema, storyboard: StoryboardSchema, timestamps: TimingSchema, brand: BrandSchema, mix: MixSchema, story: StorySchema, sound: SoundSchema, segment_timing: SegmentTimingSchema, mode_card: ModeCardSchema, mode_request: ModeRequestSchema}).map(([name, schema]) => [name, z.toJSONSchema(schema)]));
}
