import {readFile, realpath, stat} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {z} from 'zod';
import {AssetSchema, FileRef, FormatSchema, LimitsSchema} from './contracts.ts';
import {readJson, resolveInput, sha256} from './files.ts';
import {requireCondition} from './errors.ts';

const id = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/);

/** The fields every job manifest has, whatever its mode. */
export type JobEnvelope = {
  schema_version: '1.0';
  adapter: 'local-fixture';
  mode?: string | undefined;
  job_id: string;
  status: 'approved_for_visual_production';
  format: z.infer<typeof FormatSchema>;
  inputs: Record<string, z.infer<typeof FileRef>>;
  assets: {asset_id: string; kind: string; file: z.infer<typeof FileRef>; provenance: string; usage_rights: string}[];
  limits: z.infer<typeof LimitsSchema>;
};

/** A job manifest schema for `mode`, whose pinned inputs are `inputs` and whose assets have one of `assetKinds`. */
export function modeJobSchema<const M extends string, const I extends string, const K extends string>(mode: M, inputs: readonly [I, ...I[]], assetKinds: readonly [K, ...K[]]) {
  return z.strictObject({
    schema_version: z.literal('1.0'),
    adapter: z.literal('local-fixture'),
    mode: z.literal(mode),
    job_id: id,
    status: z.literal('approved_for_visual_production'),
    format: FormatSchema,
    inputs: z.strictObject(Object.fromEntries(inputs.map(key => [key, FileRef])) as Record<I, typeof FileRef>),
    assets: z.array(AssetSchema([...assetKinds] as [K, ...K[]])),
    limits: LimitsSchema,
  });
}

/** Reads a job manifest and resolves every pinned input and asset inside its directory, checking hashes and byte limits. */
export async function loadJobFiles<J extends JobEnvelope>(path: string, schema: z.ZodType<J>) {
  const manifestPath = await realpath(resolve(path));
  const root = dirname(manifestPath);
  const job = await readJson(manifestPath, schema);
  const paths = {} as Record<keyof J['inputs'] & string, string>;
  let bytes = 0;
  for (const [key, ref] of Object.entries(job.inputs)) {
    paths[key as keyof J['inputs'] & string] = await resolveInput(root, ref, job.limits.max_input_bytes);
    bytes += (await stat(paths[key as keyof J['inputs'] & string])).size;
  }
  const assetPaths: Record<string, string> = Object.create(null);
  for (const asset of job.assets) {
    requireCondition(!assetPaths[asset.asset_id], 'DUPLICATE_ID', 'Asset ids must be unique');
    assetPaths[asset.asset_id] = await resolveInput(root, asset.file, job.limits.max_input_bytes);
    bytes += (await stat(assetPaths[asset.asset_id]!)).size;
  }
  requireCondition(bytes <= job.limits.max_input_bytes, 'INPUT_LIMIT', 'Combined inputs exceed their byte allowance');
  return {job, root, manifestPath, paths, assetPaths, inputHash: sha256(JSON.stringify(job)), manifestHash: sha256(await readFile(manifestPath))};
}
