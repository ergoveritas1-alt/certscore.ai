import assert from 'node:assert/strict';
import test from 'node:test';
import { scheduleReleaseTasks, releaseResourceLimits, type ReleaseTask } from './release-scheduler';
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; };
const task = (key: string, run: () => Promise<void>, extra: Partial<ReleaseTask> = {}): ReleaseTask => ({ key, run, memoryMb: 2, exclusive: false, dependencies: [], ...extra });
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

test('bootstrap dependency, two-lane bound and exclusive browser work are enforced', async () => {
  const boot = deferred(), a = deferred(), b = deferred(), browser = deferred(), events: string[] = [];
  const work = scheduleReleaseTasks([
    task('bootstrap', async () => { events.push('bootstrap'); await boot.promise; }, { exclusive: true }),
    task('a', async () => { events.push('a'); await a.promise; }, { dependencies: ['bootstrap'] }),
    task('b', async () => { events.push('b'); await b.promise; }, { dependencies: ['bootstrap'] }),
    task('browser', async () => { events.push('browser'); await browser.promise; }, { exclusive: true, dependencies: ['bootstrap'] }),
    task('last', async () => { events.push('last'); }, { dependencies: ['browser'] }),
  ], { lanes: 2, memoryMb: 4 });
  await flush(); assert.deepEqual(events, ['bootstrap']);
  boot.resolve(); await flush(); assert.deepEqual(events, ['bootstrap', 'a', 'b']);
  a.resolve(); await flush(); assert.equal(events.includes('browser'), false);
  b.resolve(); await flush(); assert.equal(events.at(-1), 'browser');
  browser.resolve(); assert.equal((await work).length, 5); assert.equal(events.at(-1), 'last');
});

test('memory cap prevents overlap and invalid graphs/resources fail before side effects', async () => {
  const held = deferred(), events: string[] = [];
  const work = scheduleReleaseTasks([task('a', async () => { events.push('a'); await held.promise; }), task('b', async () => { events.push('b'); })], { lanes: 2, memoryMb: 3 });
  await flush(); assert.deepEqual(events, ['a']); held.resolve(); await work; assert.deepEqual(events, ['a', 'b']);
  let ran = false;
  for (const tasks of [[task('a', async () => { ran = true; }, { dependencies: ['missing'] })],
    [task('a', async () => {}, { dependencies: ['b'] }), task('b', async () => {}, { dependencies: ['a'] })],
    [task('a', async () => {}, { memoryMb: 5 })], [task('a', async () => {}), task('a', async () => {})]]) {
    await assert.rejects(scheduleReleaseTasks(tasks, { lanes: 2, memoryMb: 4 }));
  }
  assert.equal(ran, false);
  assert.throws(() => releaseResourceLimits({ availableMb: 8500, cpus: 4 }), /memory/);
  assert.deepEqual(releaseResourceLimits({ availableMb: 16384, cpus: 8 }), { lanes: 2, memoryMb: 8192 });
  assert.throws(() => releaseResourceLimits({ availableMb: 16384, cpus: 8, requestedLanes: 0 }));
});

test('failure drains active tasks and does not start dependent or queued work', async () => {
  const b = deferred(); let queued = false, ended = false;
  const work = scheduleReleaseTasks([task('a', async () => { throw Error('failure'); }),
    task('b', async () => { await b.promise; ended = true; }), task('c', async () => { queued = true; })], { lanes: 2, memoryMb: 4 });
  await flush(); assert.equal(ended, false); assert.equal(queued, false); b.resolve();
  await assert.rejects(work, /Release checks failed/); assert.equal(ended, true); assert.equal(queued, false);
});
