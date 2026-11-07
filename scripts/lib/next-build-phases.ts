import { open } from 'node:fs/promises';

const phases = {
  'next-build': 'nextBuildMs',
  'worker-main-server': 'serverCompileMs',
  'worker-main-edge-server': 'edgeCompileMs',
  'worker-main-client': 'clientCompileMs',
  'verify-typescript-setup': 'typeValidationMs',
  'static-generation': 'staticGenerationMs',
  'node-file-trace-plugin': 'fileTracePluginMs',
  'collect-traced-files': 'collectTracedFilesMs',
  'write-standalone-directory': 'standaloneOutputMs',
} as const;
const maxTraceBytes = 32 * 1024 * 1024;

export async function nextBuildPhases(tracePath: string) {
  const file = await open(tracePath, 'r');
  try {
    const { size } = await file.stat();
    if (size === 0 || size > maxTraceBytes) throw new Error('Next build trace exceeds its expected size.');
    const bytes = Buffer.alloc(size + 1);
    const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
    if (bytesRead !== size) throw new Error('Next build trace changed while being read.');
    const measurements: Partial<Record<typeof phases[keyof typeof phases], number>> = {};
    for (const line of bytes.subarray(0, size).toString('utf8').split('\n')) {
      if (!line) continue;
      for (const event of JSON.parse(line)) {
        if (!Object.hasOwn(phases, event.name)) continue;
        const label = phases[event.name as keyof typeof phases];
        if (Object.hasOwn(measurements, label) || !Number.isFinite(event.duration) || event.duration < 0) {
          throw new Error('Next build trace contains an ambiguous phase.');
        }
        measurements[label] = Math.round(event.duration / 1000);
      }
    }
    if (measurements.nextBuildMs === undefined) throw new Error('Next build trace has no completed build.');
    return measurements;
  } finally {
    await file.close();
  }
}
