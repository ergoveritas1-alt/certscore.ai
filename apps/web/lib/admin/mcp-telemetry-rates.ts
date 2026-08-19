function rate(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : null;
}

export function calculateMcpTelemetryRates(input: {
  bundles: number;
  errors: number;
  invocations: number;
  newScans: number;
  quotaLimited: number;
  reusedScans: number;
  scans: number;
  statusPolls: number;
}) {
  return {
    bundlePerScanRatio: rate(input.bundles, input.scans),
    errorRate: rate(input.errors, input.invocations),
    quotaHitRate: rate(input.quotaLimited, input.invocations),
    scanReuseRate: rate(input.reusedScans, input.reusedScans + input.newScans),
    statusPollsPerScanRatio: rate(input.statusPolls, input.scans),
  };
}
