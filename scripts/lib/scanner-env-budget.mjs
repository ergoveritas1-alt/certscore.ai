const US_QUEUE_ALIAS = 'CERTSCORE_V2_DAG_LAMBDA_US_WEST_RESULT_QUEUE_URL';
const SCANNER_QUEUE = 'CERTSCORE_V2_DAG_LAMBDA_RESULT_QUEUE_URL';
export const REVIEWED_WORKER_FLAGS = Object.freeze({
  CERTSCORE_REVIEWED_OPT_OUT_ROLLOUT_ENABLED: '1',
  CERTSCORE_REDHAT_OPT_OUT_RELOAD_ENABLED: '1',
});

export function scannerEnvironmentWithinBudget(region, current, overrides, allowUsQueueDeduplication = false) {
  const next = { ...current, ...overrides };
  const bytes = () => Buffer.byteLength(JSON.stringify({ Variables: next }));
  const originalBytes = bytes();
  // The regional alias is read by ECS consumers only. Lambda uses the generic queue key.
  const deduplicated = originalBytes > 4096 && allowUsQueueDeduplication && region === 'us-west-1' &&
    typeof next[SCANNER_QUEUE] === 'string' && next[SCANNER_QUEUE].length > 0 &&
    next[US_QUEUE_ALIAS] === next[SCANNER_QUEUE];
  if (deduplicated) delete next[US_QUEUE_ALIAS];
  if (bytes() > 4096) throw new Error(`${region} scanner environment would exceed Lambda's 4 KiB limit.`);
  return { next, bytes: bytes(), originalBytes, deduplicated };
}
