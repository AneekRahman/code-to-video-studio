import {acquireJobLock} from '../../src/lock.ts';

const lock = await acquireJobLock(process.argv[2]!);
await lock.release();
process.stdout.write('released\n');
