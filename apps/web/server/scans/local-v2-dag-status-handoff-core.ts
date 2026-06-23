export function asLocalV2DagStatusHandoffRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function getLocalV2DagResultQueueUrl(scanConfigJson: Record<string, unknown> | null | undefined) {
  const resultQueueUrl = asLocalV2DagStatusHandoffRecord(
    asLocalV2DagStatusHandoffRecord(
      asLocalV2DagStatusHandoffRecord(scanConfigJson).execution
    ).v2DagLambda
  ).resultQueueUrl;
  return typeof resultQueueUrl === "string" && resultQueueUrl.trim().length > 0 ? resultQueueUrl.trim() : null;
}
