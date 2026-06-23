export function asLocalV2DagStatusHandoffRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function getLocalV2DagResultQueueUrl(scanConfigJson: Record<string, unknown> | null | undefined) {
  const resultQueueUrl = getLocalV2DagLambdaConfig(scanConfigJson).resultQueueUrl;
  return typeof resultQueueUrl === "string" && resultQueueUrl.trim().length > 0 ? resultQueueUrl.trim() : null;
}

export function getLocalV2DagLambdaTargetEnvironment(scanConfigJson: Record<string, unknown> | null | undefined) {
  return getLocalV2DagLambdaConfig(scanConfigJson).targetEnvironment === "production" ? "production" : "local";
}

function getLocalV2DagLambdaConfig(scanConfigJson: Record<string, unknown> | null | undefined) {
  return asLocalV2DagStatusHandoffRecord(
    asLocalV2DagStatusHandoffRecord(
      asLocalV2DagStatusHandoffRecord(scanConfigJson).execution
    ).v2DagLambda
  );
}
