import { deriveScanStopReason } from "./scan-stop-reason";

type ScanEventReasonRecord = {
  eventType: string;
  message: string;
  metadataJson?: Record<string, unknown> | null;
};

type UnverifiedHomepageReasonInput = {
  canonicalStopReasonDetail?: string | null;
  authWallDetected?: boolean | null;
  blockedFlag?: boolean | null;
  captchaFlag?: boolean | null;
  homepageFetchHttpStatus?: number | null;
  homepageFetchStatus?: string | null;
  pagesScanned?: number | null;
  robotsAllowed?: boolean | null;
  robotsFetchHttpStatus?: number | null;
  robotsFetchStatus?: string | null;
  scanEvents?: ScanEventReasonRecord[];
};

function getRecordString(record: Record<string, unknown> | null | undefined, key: string) {
  const value = record?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function deriveUnverifiedHomepageReason(input: UnverifiedHomepageReasonInput) {
  const canonicalStopReasonDetail =
    typeof input.canonicalStopReasonDetail === "string" && input.canonicalStopReasonDetail.trim().length > 0
      ? input.canonicalStopReasonDetail.trim()
      : null;
  if (canonicalStopReasonDetail) {
    return `Reason: ${canonicalStopReasonDetail}`;
  }

  const scanEvents = input.scanEvents ?? [];
  const shortCircuitEvent = [...scanEvents].reverse().find((event) => event.eventType === "runtime.build_phase_diagnostic" && (
    getRecordString(event.metadataJson, "phase") === "scan_short_circuit" ||
    getRecordString(event.metadataJson, "stepKey") === "scan_short_circuit"
  ));

  if (shortCircuitEvent) {
    const metadata = shortCircuitEvent.metadataJson;
    const reason = getRecordString(metadata, "reason");
    const homepageFetchHttpStatus =
      metadata && typeof metadata === "object" && !Array.isArray(metadata) && typeof metadata.homepageFetchHttpStatus === "number"
        ? Number(metadata.homepageFetchHttpStatus)
        : null;

    if (reason === "robots_disallowed") {
      return "Reason: robots.txt disallowed scanner access to the homepage.";
    }
    if (reason === "homepage_blocked") {
      return homepageFetchHttpStatus
        ? `Reason: homepage request was blocked with HTTP ${homepageFetchHttpStatus}.`
        : "Reason: homepage request was blocked by bot protection, access controls, or a forbidden response.";
    }
    if (reason === "homepage_timeout") {
      return "Reason: homepage navigation timed out before the scanner could verify a usable page surface.";
    }
    if (reason === "homepage_not_found") {
      return homepageFetchHttpStatus
        ? `Reason: homepage returned HTTP ${homepageFetchHttpStatus} Not Found.`
        : "Reason: homepage returned a not-found response.";
    }
    if (reason === "homepage_unreachable") {
      return "Reason: homepage could not be reached reliably because of a connection, DNS, TLS, or other transport failure.";
    }
  }

  const browserDiagnostic = [...scanEvents].reverse().find((event) => event.eventType === "runtime.browser_pass_diagnostic");
  const browserError =
    getRecordString(browserDiagnostic?.metadataJson, "error") ??
    getRecordString(browserDiagnostic?.metadataJson, "navigationError") ??
    browserDiagnostic?.message ??
    null;

  if (browserError) {
    if (/err_name_not_resolved|dns|name not resolved/i.test(browserError)) {
      return "Reason: homepage could not be reached because the domain failed DNS resolution.";
    }
    if (/ssl|tls|certificate|protocol/i.test(browserError)) {
      return "Reason: homepage could not be reached because the connection failed during TLS or SSL setup.";
    }
    if (/timeout|timed out/i.test(browserError)) {
      return "Reason: homepage navigation timed out before the scanner could verify a usable page surface.";
    }
    if (/403|forbidden|access denied|blocked/i.test(browserError)) {
      return /\b403\b/i.test(browserError)
        ? "Reason: homepage request was blocked with HTTP 403."
        : "Reason: homepage request was blocked by bot protection, access controls, or a forbidden response.";
    }
  }

  return (
    deriveScanStopReason({
      authWallDetected: input.authWallDetected ?? null,
      blockedFlag: input.blockedFlag ?? null,
      captchaFlag: input.captchaFlag ?? null,
      homepageFetchHttpStatus: input.homepageFetchHttpStatus ?? null,
      homepageFetchStatus: input.homepageFetchStatus ?? null,
      pagesScanned: input.pagesScanned ?? null,
      robotsAllowed: input.robotsAllowed ?? null,
      robotsFetchHttpStatus: input.robotsFetchHttpStatus ?? null,
      robotsFetchStatus: input.robotsFetchStatus ?? null
    })?.reason ?? "Reason: the scanner could not verify a usable homepage surface."
  );
}
