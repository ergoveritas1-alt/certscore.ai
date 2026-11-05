export type ReleaseTask = {
  key: string;
  dependencies: string[];
  memoryMb: number;
  exclusive: boolean;
  run: () => Promise<void>;
};
export type TaskTiming = { key: string; startedAt: string; completedAt: string; durationMs: number; exitStatus: number };

/** Fail closed, drain in-flight work, and never overlap an exclusive browser/build task. */
export async function scheduleReleaseTasks(tasks: ReleaseTask[], options: { lanes: number; memoryMb: number }) {
  if (!Number.isInteger(options.lanes) || options.lanes < 1 || options.lanes > 2 || !Number.isFinite(options.memoryMb) || options.memoryMb < 1) throw new Error('Invalid release resource limits.');
  const keys = new Set(tasks.map(task => task.key));
  if (keys.size !== tasks.length) throw new Error('Duplicate release task key.');
  for (const task of tasks) {
    if (task.memoryMb < 1 || task.memoryMb > options.memoryMb || !Number.isFinite(task.memoryMb)) throw new Error(`Insufficient memory for ${task.key}.`);
    if (task.dependencies.some(key => !keys.has(key) || key === task.key)) throw new Error(`Invalid dependencies for ${task.key}.`);
  }
  // Check the complete graph before running even its first side effect.
  const visited = new Set<string>();
  while (visited.size < tasks.length) {
    const ready = tasks.filter(task => !visited.has(task.key) && task.dependencies.every(key => visited.has(key)));
    if (!ready.length) throw new Error('Cyclic release dependencies.');
    ready.forEach(task => visited.add(task.key));
  }
  const pending = [...tasks], done = new Set<string>();
  const active = new Map<string, { task: ReleaseTask; work: Promise<void> }>();
  const timings: TaskTiming[] = [], failures: unknown[] = [];
  while (pending.length || active.size) {
    if (!failures.length) {
      for (let index = 0; index < pending.length && active.size < options.lanes;) {
        const task = pending[index]!;
        const used = [...active.values()].reduce((sum, value) => sum + value.task.memoryMb, 0);
        if (!task.dependencies.every(key => done.has(key)) ||
          [...active.values()].some(value => value.task.exclusive) ||
          (task.exclusive && active.size > 0) || used + task.memoryMb > options.memoryMb) { index++; continue; }
        pending.splice(index, 1);
        const startedAt = new Date().toISOString(), start = performance.now();
        const work = Promise.resolve().then(task.run).then(() => { done.add(task.key); }, error => { failures.push(error); }).finally(() => {
          timings.push({ key: task.key, startedAt, completedAt: new Date().toISOString(), durationMs: performance.now() - start, exitStatus: done.has(task.key) ? 0 : 1 });
          active.delete(task.key);
        });
        active.set(task.key, { task, work });
      }
    }
    if (!active.size) break;
    await Promise.race([...active.values()].map(value => value.work));
  }
  if (failures.length) throw new AggregateError(failures, 'Release checks failed; remaining checks were not started.');
  return timings;
}

export function releaseResourceLimits(input: { availableMb: number; cpus: number; requestedLanes?: number; requestedMemoryMb?: number }) {
  const memoryMb = Math.min(8192, Math.floor(input.availableMb - 512), input.requestedMemoryMb ?? 8192);
  const lanes = Math.min(input.requestedLanes ?? 2, input.cpus, memoryMb >= 4096 ? 2 : 1);
  if (!Number.isInteger(lanes) || lanes < 1 || lanes > 2 || !Number.isFinite(memoryMb) || memoryMb < 8192) throw new Error('Release checks require 8 GiB available memory plus 512 MiB reserve; stop other work or retry when memory is available.');
  return { lanes, memoryMb };
}
