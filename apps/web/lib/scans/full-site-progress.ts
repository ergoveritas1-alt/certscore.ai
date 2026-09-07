import { z } from "zod";

export const fullSiteProgressSchema = z.object({
  completed: z.number().int().nonnegative(), partial: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(), active: z.number().int().nonnegative(),
  discovered: z.number().int().nonnegative(), discoveryComplete: z.boolean(),
  averageSeconds: z.number().nonnegative().nullable(),
  elapsedSeconds: z.number().nonnegative(),
  concurrency: z.number().positive(), waitSeconds: z.number().nonnegative(),
});
export type FullSiteProgress = z.infer<typeof fullSiteProgressSchema>;
export const fullSiteProgressResponseSchema = z.object({
  scanId: z.string(), status: z.string(), homepageStatus: z.string(),
  errorMessage: z.string().nullable(), progress: fullSiteProgressSchema,
});
export function fullSiteIsRunning(scan: {status: string; homepageStatus: string}) {
  return scan.homepageStatus !== "failed" && ["waiting_homepage", "running"].includes(scan.status);
}
export function estimateFullSiteProgress(progress: FullSiteProgress, limit: number, terminal: boolean) {
  const done = progress.completed + progress.partial + progress.failed;
  const total = progress.discoveryComplete ? Math.min(limit, Math.max(done, progress.discovered)) : limit;
  const remaining = Math.max(0, total - done);
  const seconds = progress.averageSeconds === null || done === 0 ? null
    : Math.ceil(remaining * Math.max(progress.averageSeconds / progress.concurrency, progress.waitSeconds) + (remaining ? progress.averageSeconds : 0));
  return { total, done, totalSeconds: seconds === null ? null : progress.elapsedSeconds + seconds, percent: terminal ? 100 : Math.min(95, total ? Math.round(done / total * 100) : 0), seconds };
}
