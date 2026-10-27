import {acquireJobLock} from '../../src/lock.ts';

await acquireJobLock(process.argv[2]!);
process.stdout.write('ready\n');
setInterval(() => undefined, 1 << 30);
