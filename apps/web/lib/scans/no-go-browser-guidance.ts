import { isScanNoGoSnapshotOutcome, normalizeUrl, resolveScanNoGoPresentation } from "@website-signal-risk-scanner/shared";
import { projectScanReportNoGo, type ScanReportAccessContext } from "./scan-report-disposition";

export type NoGoBrowserGuidance = "robots" | "challenge" | "capture";
type Input = ScanReportAccessContext & {
  scan?: { status?: string; pageUrl?: string | null; domainHostname?: string | null; scanType?: string | null; scanFromValue?: string | null; pagesScanned?: number | null };
  events?: readonly { eventType: string; metadataJson?: unknown }[];
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/** Navigation advice for a finished hosted scan. This never changes the retained disposition. */
export function noGoBrowserGuidance(input: Input, projected = projectScanReportNoGo(input)): NoGoBrowserGuidance | undefined {
  const { scan, snapshot, runtimeArtifacts } = input;
  if (!["failed", "completed"].includes(scan?.status ?? "") || scan?.scanType === "browser_extension" ||
      scan?.scanFromValue === "local_extension" || snapshot?.report_projection_status === "failed") return;
  const assessment = record(runtimeArtifacts?.scan_no_go_assessment ?? runtimeArtifacts?.scanNoGoAssessment ?? snapshot?.scan_no_go_assessment);
  if (assessment.decision && assessment.decision !== "no_go") return;
  const codes = [snapshot?.stop_reason_code, snapshot?.scan_outcome,
    ...[assessment.reasonCodes, assessment.reason_codes].flatMap(rows => Array.isArray(rows) ? rows : [])];
  const shortCircuit = input.events?.slice().reverse().find(e => {
    if (e.eventType !== "runtime.build_phase_diagnostic") return false;
    const metadata = record(e.metadataJson);
    return metadata.phase === "scan_short_circuit" || metadata.stepKey === "scan_short_circuit";
  });
  const legacyStop = codes.find((code): code is string => typeof code === "string" && isScanNoGoSnapshotOutcome(code));
  // An excluded secondary page or an incidental challenge on a usable report is not a homepage no-go.
  const explicitRobotsStop = codes.some(code => code === "robots_restricted" || code === "robots_disallowed" || code === "robots_blocked") ||
    record(shortCircuit?.metadataJson).reason === "robots_disallowed";
  const robotsRestricted = snapshot?.robots_allowed === false || explicitRobotsStop;
  if (!projected && !(scan?.pagesScanned === 0 && (legacyStop || shortCircuit || robotsRestricted || scan.status === "failed"))) return;
  if (codes.some(code => code === "robots_unavailable_or_blocked" || code === "robots_delay_exceeds_crawl_budget")) return;
  if (robotsRestricted) {
    const fetchStatus = snapshot?.robots_fetch_status;
    if (!explicitRobotsStop && fetchStatus && fetchStatus !== "ok" && fetchStatus !== "redirected") return;
    return "robots";
  }
  try { normalizeUrl(scan?.pageUrl || scan?.domainHostname || ""); } catch { return; }
  const signals = record(assessment.supportingSignals ?? assessment.supporting_signals);
  const codesWithStatus = [snapshot?.homepage_fetch_http_status, signals.mainDocumentStatus];
  const blockedReasons = ["authentication_required", "rate_limited_429", "unsupported_region", "tls_or_certificate_error",
    "not_found_404", "server_error_5xx", "maintenance_or_unavailable", "configuration_error", "parked_or_placeholder",
    "site_not_ready", "target_unreachable_or_unsuitable", "navigation_transport_failure", "redirect_only_page", "retained_visual_error_shell"];
  if (snapshot?.auth_wall_detected === true || snapshot?.auth_wall_suspected === true ||
      snapshot?.block_page_classification === "login_wall_probable" ||
      codesWithStatus.some(s => typeof s === "number" && (s === 401 || s === 404 || s === 429 || s === 451 || s >= 500)) ||
      codes.some(code => typeof code === "string" && (["reachability_blocked_homepage_401", "reachability_blocked_auth_wall", "auth_wall"].includes(code) ||
        blockedReasons.includes(resolveScanNoGoPresentation(code).code)))) return;
  const legacy = legacyStop ? resolveScanNoGoPresentation(legacyStop) : undefined;
  const reason = projected?.noGo.reasonCode ?? (legacy?.isUnknown ? undefined : legacy?.code);
  const visual = record(runtimeArtifacts?.visual_access_review ?? runtimeArtifacts?.visualAccessReview ?? snapshot?.visual_access_review);
  const visualChallenge = (visual.go_no_go ?? visual.goNoGo) === "NO_GO" &&
    ["captcha_or_challenge", "challenge_or_robot_page"].includes(String(visual.page_state ?? visual.pageState));
  const challenge = visualChallenge || snapshot?.captcha_flag === true || snapshot?.block_page_classification === "captcha_probable" ||
    snapshot?.block_page_classification === "security_challenge" ||
    (snapshot?.block_page_classification === "vendor_interstitial_probable" && snapshot.challenge_suspected === true) || signals.blockingFrameChallengeObserved === true ||
    signals.visualPageState === "captcha_or_challenge";
  if (reason === "captcha_or_challenge" || (reason === "access_denied_or_forbidden_page" && challenge) ||
      (!projected && !reason && challenge)) return "challenge";
  if (codesWithStatus.includes(403) || reason === "access_denied_or_forbidden_page" ||
      codes.some(code => typeof code === "string" && resolveScanNoGoPresentation(code).code === "access_denied_or_forbidden_page")) return;
  if (reason && ["blank_or_unusable_page", "loading_or_stalled", "runtime_capture_unverified", "visual_capture_failed_or_placeholder"].includes(reason)) return "capture";
}
