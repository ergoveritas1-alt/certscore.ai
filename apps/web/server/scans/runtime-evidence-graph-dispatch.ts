import { selectRuntimeGraphDispatch } from "@certscore/contracts";

/** Called at scan-row creation, after the server has allocated the scan identity.
 * Overwrite supplied decisions (including when disabled), then commit the choice
 * with the outbox intent so retries and later rollout changes cannot rewrite it.
 */
export function bindRuntimeGraphDispatchToScan(input: {
  scanId: string;
  scanConfig: Record<string, unknown>;
  environment: Record<string, string | undefined>;
}): Record<string, unknown> {
  const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const execution = record(input.scanConfig.execution);
  const intent = record(execution.v2DagLambda);
  if (!Object.keys(intent).length) return input.scanConfig;
  const selected = intent.orchestrationMode === "sharded" ? selectRuntimeGraphDispatch(input.scanId, input.environment, typeof input.scanConfig.normalizedUrl === "string" ? input.scanConfig.normalizedUrl : undefined) : undefined;
  return { ...input.scanConfig, execution: { ...execution, v2DagLambda: { ...intent,
    runtimeGraphSelection: { contractVersion: "certscore.runtime-graph-selection.v1", scanId: input.scanId, dispatch: selected ?? null },
  } } };
}
