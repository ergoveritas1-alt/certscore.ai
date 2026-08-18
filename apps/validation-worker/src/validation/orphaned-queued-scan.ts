export const ORPHANED_QUEUED_SCAN_DISPATCH_DEADLINE_MS = 10 * 60_000;

function getRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function hasExecutableLambdaDispatch(scanConfigJson: unknown) {
  const config = getRecord(scanConfigJson);
  const execution = getRecord(config?.execution);
  const lambda = getRecord(execution?.v2DagLambda);

  return Boolean(
    lambda &&
      lambda.dispatchState === "pending_dispatch" &&
      typeof lambda.functionName === "string" &&
      lambda.functionName.trim().length > 0 &&
      typeof lambda.resultQueueUrl === "string" &&
      lambda.resultQueueUrl.trim().length > 0
  );
}

export function shouldFailQueuedScanWithoutExecutableDispatch(input: {
  createdAt: string | null | undefined;
  deadlineMs?: number;
  nowMs?: number;
  scanConfigJson: unknown;
  status: string | null | undefined;
}) {
  if (input.status !== "queued" || hasExecutableLambdaDispatch(input.scanConfigJson)) {
    return false;
  }

  const createdAtMs = input.createdAt ? new Date(input.createdAt).getTime() : Number.NaN;
  if (!Number.isFinite(createdAtMs)) {
    return false;
  }

  const deadlineMs = input.deadlineMs ?? ORPHANED_QUEUED_SCAN_DISPATCH_DEADLINE_MS;
  return (input.nowMs ?? Date.now()) - createdAtMs >= Math.max(1, deadlineMs);
}
