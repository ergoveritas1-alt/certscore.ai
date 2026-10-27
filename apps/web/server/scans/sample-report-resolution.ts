import type { SampleScanFrom } from "../../lib/marketing/homepage-location";

export const SAMPLE_REPORT_WINDOW_MS = 24 * 60 * 60 * 1_000;

export type SampleReportAttempt = { id: string; status: string; createdAt: string };
export type SampleReportResolution =
  | { kind: "recent" | "in_progress" | "fresh"; scanId: string }
  | { kind: "busy" | "cooldown"; retryAfterSeconds: number };

export type SampleReportDependencies = {
  withRegionLock: <T>(scanFrom: SampleScanFrom, run: () => Promise<T>) => Promise<
    { acquired: false } | { acquired: true; value: T }
  >;
  findRecent: (scanFrom: SampleScanFrom, now: Date) => Promise<{ id: string } | null>;
  findAttempt: (scanFrom: SampleScanFrom, now: Date) => Promise<SampleReportAttempt | null>;
  createFresh: (scanFrom: SampleScanFrom) => Promise<{ id: string }>;
};

function attemptResolution(attempt: SampleReportAttempt | null, now: Date): SampleReportResolution | null {
  if (!attempt) return null;
  const observedAge = now.getTime() - new Date(attempt.createdAt).getTime();
  // The writer can be slightly ahead of an ECS clock. A future/unknown age
  // must never turn an already accepted attempt into another paid scan.
  const age = Number.isFinite(observedAge) ? Math.max(0, observedAge) : 0;
  if (age >= SAMPLE_REPORT_WINDOW_MS) return null;
  if (["queued", "running", "processing"].includes(attempt.status)) {
    return { kind: "in_progress", scanId: attempt.id };
  }
  // A failed or unusable sample attempt still consumes the daily refresh budget.
  return { kind: "cooldown", retryAfterSeconds: Math.max(1, Math.ceil((SAMPLE_REPORT_WINDOW_MS - age) / 1_000)) };
}

export async function resolveSampleReportScan(
  scanFrom: SampleScanFrom,
  dependencies: SampleReportDependencies,
  now = new Date(),
): Promise<SampleReportResolution> {
  const locked = await dependencies.withRegionLock(scanFrom, async () => {
    const recent = await dependencies.findRecent(scanFrom, now);
    if (recent) return { kind: "recent", scanId: recent.id } as const;
    const previous = attemptResolution(await dependencies.findAttempt(scanFrom, now), now);
    if (previous) return previous;
    return { kind: "fresh", scanId: (await dependencies.createFresh(scanFrom)).id } as const;
  });
  if (locked.acquired) return locked.value;
  // A competing request may already have persisted the shared scan.
  const current = attemptResolution(await dependencies.findAttempt(scanFrom, now), now);
  return current ?? { kind: "busy", retryAfterSeconds: 1 };
}
