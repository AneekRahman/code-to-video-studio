import {z} from 'zod';
import {BrandSchema, JobSchema, MixSchema, ScriptSchema, StoryboardSchema, TimingSchema} from './contracts.ts';

export function schemas() {
  return Object.fromEntries(Object.entries({job: JobSchema, script: ScriptSchema, storyboard: StoryboardSchema, timestamps: TimingSchema, brand: BrandSchema, mix: MixSchema}).map(([name, schema]) => [name, z.toJSONSchema(schema)]));
}
