import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createBackendProviders, localEnvExists, type BackendTransport} from '../src/generation-backend.ts';
import {sha256} from '../src/files.ts';
import type {SourceArtifact} from '../src/generation-source.ts';

const signal = () => AbortSignal.timeout(5000);
const png = Buffer.from([137,80,78,71,13,10,26,10,1]);
const pointer = (bytes: Buffer, content_type = 'image/png'): SourceArtifact => ({bucket:'fixture-bucket',key:'assets/fixture/asset',version_id:'fixture-version',sha256:sha256(bytes),content_type});

test('only absent local.env selects backend; an empty file still selects local', async () => {
  const root = await mkdtemp(join(tmpdir(),'studio-route-'));
  try {
    assert.equal(await localEnvExists(root),false);
    await writeFile(join(root,'local.env'),'');
    assert.equal(await localEnvExists(root),true);
  } finally { await rm(root,{recursive:true,force:true}); }
});

test('backend sends deterministic job/request identities and pins exact S3 pointers', async () => {
  const events: Record<string, unknown>[] = [];
  const downloads: SourceArtifact[] = [];
  let closes = 0;
  const transport: BackendTransport = async event => {
    events.push(event);
    return {receipt:{ok:true,status:'COMPLETE',operation:'image',artifacts:[pointer(png)]},download:async p => {downloads.push(p);return png;},close:async () => {closes++;}};
  };
  const provider = createBackendProviders('same-job',transport).image;
  const request = {prompt:'fixture',width:1024,height:1024,seed:1};
  const first = await provider.generate(request,signal());
  await provider.generate(request,signal());
  assert.deepEqual(events[0],events[1]);
  assert.equal(events[0]!.job_id,'same-job');
  assert.match(String(events[0]!.request_id),/^[a-f0-9]{64}$/);
  assert.equal(downloads[0]!.version_id,'fixture-version');
  assert.deepEqual(first.source_artifacts,[pointer(png)]);
  assert.equal(closes,2);
});

test('backend refuses unsupported requests before any paid operation', async () => {
  let calls = 0;
  const transport: BackendTransport = async () => {calls++;throw Error('must not call');};
  assert.throws(() => createBackendProviders('',transport),/job-id/);
  const p = createBackendProviders('job',transport);
  await assert.rejects(p.image.generate({prompt:'fixture',width:768,height:1344,seed:1},signal()),/1024/);
  await assert.rejects(p.image.generate({prompt:'fixture',width:1024,height:1024,seed:858993460},signal()),/seed/);
  await assert.rejects(p.audio.speak({voice_id:'requestedvoice',model:'eleven_v4',text:'Hi',seed:1},signal()),/backendconfigured/);
  await assert.rejects(p.audio.effect({prompt:'fixture',duration_seconds:3,prompt_influence:0.5,loop:false},signal()),/prompt_influence/);
  await assert.rejects(p.audio.music({prompt:'fixture',duration_seconds:31},signal()),/3–30/);
  assert.equal(calls,0);
});

test('backend errors and unknown outcomes never cause another transport invocation', async () => {
  let calls = 0;
  const transport: BackendTransport = async () => {calls++;return {receipt:{ok:false,code:'OUTCOME_UNCERTAIN'},download:async () => png};};
  const provider = createBackendProviders('job',transport).image;
  await assert.rejects(provider.generate({prompt:'fixture',width:1024,height:1024,seed:1},signal()),{code:'OUTCOME_UNCERTAIN'});
  assert.equal(calls,1);
});

test('modified artifact and null object version are rejected', async () => {
  for (const corruptVersion of [false,true]) {
    const transport: BackendTransport = async () => ({receipt:{ok:true,status:'COMPLETE',operation:'image',artifacts:[{...pointer(png),version_id:corruptVersion?'null':'version'}]},download:async () => Buffer.from('bad')});
    await assert.rejects(createBackendProviders('job',transport).image.generate({prompt:'fixture',width:1024,height:1024,seed:1},signal()));
  }
});

test('speech original alignment converts into the studio contract and retains both S3 sources', async () => {
  const audio = Buffer.from('ID3fixture');
  const timing = Buffer.from(JSON.stringify({characters:['H','i'],character_start_times_seconds:[0,0.1],character_end_times_seconds:[0.1,0.2]}));
  const transport: BackendTransport = async () => ({receipt:{ok:true,status:'COMPLETE',operation:'speech',artifacts:[pointer(audio,'audio/mpeg'),pointer(timing,'application/json')]},download:async p => p.content_type==='audio/mpeg'?audio:timing});
  const speech = await createBackendProviders('job',transport).audio.speak({voice_id:'backendconfigured',model:'eleven_multilingual_v2',text:'Hi',seed:1},signal());
  assert.deepEqual(speech.alignment,{characters:['H','i'],starts:[0,0.1],ends:[0.1,0.2]});
  assert.equal(speech.source_artifacts!.length,2);
});
