import { z } from "zod";

/** Original worker clock, retained before lane merge/path rewriting. Offsets in
 * runtime-owned evidence remain relative to this start; no offsets are rebased. */
export const runtimeEvidenceClockSchema = z.object({
  contractVersion: z.literal("certscore.runtime-evidence-clock.v1"),
  laneId: z.literal("runtime_evidence"),
  scanId: z.string().min(1),
  targetUrl: z.string().url(),
  region: z.string().optional(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime(),
  source: z.object({ sha256: z.string().regex(/^[a-f0-9]{64}$/), sizeBytes: z.number().int().positive() }),
}).strict().refine(value => Date.parse(value.completedAt) >= Date.parse(value.startedAt), {
  message: "Runtime evidence clock ends before its origin.", path: ["completedAt"],
});
export type RuntimeEvidenceClock = z.infer<typeof runtimeEvidenceClockSchema>;

type ClockCarrier = { scanId: string; url: string; region?: string; startedAt: string; completedAt: string;
  runtimeEvidenceClock?: unknown; scanLaneRuns?: readonly { laneId: string; region?: string }[] };

/** A malformed new clock never falls back to the unrelated merged clock.
 * Historical bundles without the field retain their previous interpretation. */
export function resolveRuntimeEvidenceClock(bundle: ClockCarrier): { startMs: number; endMs: number; durationMs: number } | null {
  let startMs = Date.parse(bundle.startedAt), endMs = Date.parse(bundle.completedAt);
  if (bundle.runtimeEvidenceClock !== undefined) {
    const parsed = runtimeEvidenceClockSchema.safeParse(bundle.runtimeEvidenceClock);
    if (!parsed.success) return null;
    const clock = parsed.data, lanes = bundle.scanLaneRuns?.filter(lane => lane.laneId === "runtime_evidence");
    if (clock.scanId !== bundle.scanId || clock.targetUrl !== bundle.url || clock.region !== bundle.region ||
      lanes?.length !== 1 || lanes[0]?.region !== clock.region ||
      !Number.isFinite(endMs) || Date.parse(clock.completedAt) > endMs) return null;
    startMs = Date.parse(clock.startedAt); endMs = Date.parse(clock.completedAt);
  }
  return Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs
    ? { startMs, endMs, durationMs: endMs - startMs } : null;
}
