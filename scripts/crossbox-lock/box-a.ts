import {acquireJobLock} from '../../src/lock.ts';
await acquireJobLock('/work/out/work/outputs/.studio-lock');
console.log('A_READY');
setInterval(() => undefined, 1 << 30);
