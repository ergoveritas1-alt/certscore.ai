export type ScanProof = {
  consentInspection: "complete_surface_observed" | "complete_no_surface_observed" | "incomplete";
  finalUrl: string | null;
  networkActivity: {
    count: number | null;
    status: "observed" | "not_verified";
  };
  runtimeCoverage: "usable" | "limited" | "not_verified";
  screenshot: {
    captureMethod: string | null;
    status: "retained" | "unavailable" | "not_confirmed";
  };
  scriptActivity: "observed" | "not_verified";
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function stringValue(record: Record<string, unknown> | null, keys: string[]) {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return null;
}

function numberValue(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function buildScanProof(input: {
  executiveThirdPartyRequestCount: number;
  finalHost?: string | null;
  runtimeArtifacts: Record<string, unknown> | null | undefined;
  runtimeMetricsReliable: boolean;
}): ScanProof {
  const runtimeArtifacts = input.runtimeArtifacts ?? null;
  const inspection = asRecord(runtimeArtifacts?.consent_surface_inspection ?? runtimeArtifacts?.consentSurfaceInspection);
  const visualArtifacts = Array.isArray(runtimeArtifacts?.visual_evidence_artifacts)
    ? runtimeArtifacts.visual_evidence_artifacts.map(asRecord).filter((value): value is Record<string, unknown> => Boolean(value))
    : [];
  const retainedScreenshot = visualArtifacts.find((artifact) => artifact.status === "available");
  const visualCaptureStatus = stringValue(runtimeArtifacts, ["visual_capture_status"]);
  const visualCaptureMethod = stringValue(runtimeArtifacts, ["visual_capture_method"]);
  const coverage = stringValue(runtimeArtifacts, ["runtime_coverage_status", "runtimeCoverageStatus"]);
  const requestCount = numberValue(runtimeArtifacts, "third_party_request_count") ?? input.executiveThirdPartyRequestCount;
  const inspectionComplete = inspection?.inspectionCompleted === true && inspection?.coverageStatus === "complete";

  return {
    consentInspection: !inspectionComplete
      ? "incomplete"
      : inspection?.consentSurfaceObserved === true
        ? "complete_surface_observed"
        : "complete_no_surface_observed",
    finalUrl: stringValue(runtimeArtifacts, ["final_effective_url"]) ?? input.finalHost ?? null,
    networkActivity: {
      count: requestCount,
      status: input.runtimeMetricsReliable ? "observed" : "not_verified"
    },
    runtimeCoverage: coverage === "usable"
      ? "usable"
      : input.runtimeMetricsReliable
        ? "limited"
        : "not_verified",
    screenshot: {
      captureMethod: stringValue(retainedScreenshot ?? null, ["capture_method"]) ?? visualCaptureMethod,
      status: retainedScreenshot
        ? "retained"
        : visualCaptureStatus === "failed" || visualCaptureStatus === "unavailable"
          ? "unavailable"
          : "not_confirmed"
    },
    scriptActivity: input.runtimeMetricsReliable || input.executiveThirdPartyRequestCount > 0 ? "observed" : "not_verified"
  };
}
