function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function detectInternalArtifactOnlyReportGap(input: {
  events: Array<{ event_type: string; metadata_json: unknown }>;
  scanStatus: string;
  snapshotPresent: boolean;
}) {
  if (input.scanStatus !== "completed" || input.snapshotPresent) {
    return null;
  }

  const resultEvent = input.events.find((event) => {
    const metadata = isRecord(event.metadata_json) ? event.metadata_json : null;
    return event.event_type === "v2_lambda_result.received" &&
      metadata?.artifactOnly === true &&
      metadata?.productionFindingIntegration === false;
  });

  return resultEvent
    ? {
        code: "internal_v2_artifact_only_no_snapshot",
        message: "Completed internal v2 artifact-only scan has no production snapshot/report materialization.",
        reportMaterializationExpected: false
      }
    : null;
}
