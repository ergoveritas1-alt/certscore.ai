import assert from "node:assert/strict";
import test from "node:test";
import { createReportFinalizationScheduler } from "./report-finalization-scheduler";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

test("two slow trailing writes do not hold publication capacity", async () => {
  const scheduler = createReportFinalizationScheduler(2);
  const trailingRelease = deferred();
  const trailingStarted = [deferred(), deferred()];
  const trailing = trailingStarted.map((started) => scheduler.run("finalize", async () => {
    started.resolve();
    await trailingRelease.promise;
  }));
  await Promise.all(trailingStarted.map((started) => started.promise));

  let published = 0;
  await Promise.all([1, 2, 3].map(() => scheduler.run("publish_report", async () => {
    published += 1;
  })));
  assert.equal(published, 3);
  trailingRelease.resolve();
  await Promise.all(trailing);
});

for (const mode of ["publish_report", "finalize"] as const) {
  test(`${mode} stays bounded and preserves FIFO order after failure`, async () => {
    const scheduler = createReportFinalizationScheduler(2);
    const firstRelease = deferred();
    const secondRelease = deferred();
    const firstStarted = deferred();
    const secondStarted = deferred();
    const starts: number[] = [];
    let active = 0;
    let maximumActive = 0;
    const run = (id: number, blocker?: ReturnType<typeof deferred>, started?: ReturnType<typeof deferred>) =>
      scheduler.run(mode, async () => {
        starts.push(id);
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        started?.resolve();
        try {
          await blocker?.promise;
          if (id === 1) throw new Error("retained request failed");
        } finally {
          active -= 1;
        }
      });
    const failed = assert.rejects(run(1, firstRelease, firstStarted), /retained request failed/);
    const second = run(2, secondRelease, secondStarted);
    await Promise.all([firstStarted.promise, secondStarted.promise]);
    const third = run(3);
    const fourth = run(4);
    firstRelease.resolve();
    await failed;
    const fifth = run(5);
    await Promise.all([third, fourth, fifth]);
    secondRelease.resolve();
    await second;
    assert.deepEqual(starts, [1, 2, 3, 4, 5]);
    assert.equal(maximumActive, 2);
    await scheduler.run(mode, async () => assert.equal(active, 0));
  });
}

test("invalid concurrency cannot create a permanently blocked scheduler", () => {
  for (const concurrency of [0, -1, 1.5, NaN]) {
    assert.throws(() => createReportFinalizationScheduler(concurrency), /positive integer/);
  }
});
