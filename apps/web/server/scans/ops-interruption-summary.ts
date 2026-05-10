import {
  deriveAccessLimitationOutcome,
  type AccessPostureClass,
  type BlockPageClassification
} from "@website-signal-risk-scanner/shared";

export type OpsInterruptionScanInput = {
  error_message: string | null;
  pages_scanned: number;
  status: string;
};

export type OpsInterruptionEventInput = {
  event_type: string;
  message: string;
};

export type OpsInterruptionSnapshotInput = {
  access_posture_class?: string | null;
  auth_wall_detected?: boolean | null;
  auth_wall_suspected?: boolean | null;
  blocked_flag?: boolean | null;
  block_page_classification?: string | null;
  captcha_flag?: boolean | null;
  challenge_suspected?: boolean | null;
  fingerprint_block_suspected?: boolean | null;
  geo_block_suspected?: boolean | null;
  homepage_fetch_http_status?: number | null;
  homepage_fetch_status?: string | null;
  rate_limit_suspected?: boolean | null;
  robots_allowed?: boolean | null;
  robots_fetch_http_status?: number | null;
  robots_fetch_status?: string | null;
  stop_reason_code?: string | null;
  stop_reason_detail?: string | null;
  stop_reason_http_status?: number | null;
  stop_reason_label?: string | null;
};

const OPS_INTERRUPTION_CATEGORIES = [
  "scans_with_any_interruption",
  "captcha_or_security_challenge",
  "authentication_wall",
  "paywall_or_subscription_wall",
  "geo_or_regional_block",
  "bot_block_or_forbidden",
  "dns_or_connection_failure",
  "tls_or_certificate_failure",
  "timeout_or_navigation_failure",
  "robots_or_policy_block",
  "unsupported_content_or_non_html",
  "scanner_runtime_interruption",
  "task_stop_or_scale_in_interruption",
  "other_access_limitation"
] as const;

export type OpsInterruptionCategory = (typeof OPS_INTERRUPTION_CATEGORIES)[number];

export type OpsInterruptionSummary = {
  accessPostureClass: AccessPostureClass | null;
  categories: OpsInterruptionCategory[];
  hasInterruption: boolean;
  reason: string | null;
  source: "snapshot" | "scan_event" | "scan_error" | "none";
  stopReasonCode: string | null;
  stopReasonDetail: string | null;
  stopReasonHttpStatus: number | null;
  stopReasonLabel: string | null;
};

export function asAccessPostureClass(value: string | null | undefined): AccessPostureClass | null {
  if (
    value === "tolerant" ||
    value === "degraded_but_useful" ||
    value === "early_loss" ||
    value === "robots_limited" ||
    value === "unknown"
  ) {
    return value;
  }

  return null;
}

function asBlockPageClassification(value: string | null | undefined): BlockPageClassification | null {
  if (
    value === "vendor_interstitial_probable" ||
    value === "plain_origin_403" ||
    value === "login_wall_probable" ||
    value === "captcha_probable" ||
    value === "empty_or_thin_block_page" ||
    value === "unknown_block_page"
  ) {
    return value;
  }

  return null;
}

function normalizeForMatching(...values: Array<string | null | undefined>) {
  return values
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ")
    .toLowerCase();
}

function addCategory(categories: Set<OpsInterruptionCategory>, category: OpsInterruptionCategory) {
  categories.add(category);
  categories.add("scans_with_any_interruption");
}

export function buildOpsInterruptionSummary(input: {
  events?: OpsInterruptionEventInput[];
  scan: OpsInterruptionScanInput;
  snapshot: OpsInterruptionSnapshotInput | null;
}): OpsInterruptionSummary {
  const snapshot = input.snapshot;
  const accessPostureClass = asAccessPostureClass(snapshot?.access_posture_class);
  const stopReasonCode = snapshot?.stop_reason_code ?? null;
  const stopReasonDetail = snapshot?.stop_reason_detail ?? null;
  const stopReasonHttpStatus = snapshot?.stop_reason_http_status ?? null;
  const stopReasonLabel = snapshot?.stop_reason_label ?? null;
  const blockPageClassification = asBlockPageClassification(snapshot?.block_page_classification);
  const derivedOutcome = deriveAccessLimitationOutcome({
    accessPostureClass,
    authWallDetected: snapshot?.auth_wall_detected ?? null,
    authWallSuspected: snapshot?.auth_wall_suspected ?? null,
    blockedFlag: snapshot?.blocked_flag ?? null,
    blockPageClassification,
    captchaFlag: snapshot?.captcha_flag ?? null,
    challengeSuspected: snapshot?.challenge_suspected ?? null,
    fingerprintBlockSuspected: snapshot?.fingerprint_block_suspected ?? null,
    geoBlockSuspected: snapshot?.geo_block_suspected ?? null,
    homepageFetchHttpStatus: snapshot?.homepage_fetch_http_status ?? null,
    homepageFetchStatus: snapshot?.homepage_fetch_status ?? null,
    pagesScanned: input.scan.pages_scanned,
    rateLimitSuspected: snapshot?.rate_limit_suspected ?? null,
    robotsAllowed: snapshot?.robots_allowed ?? null,
    robotsFetchHttpStatus: snapshot?.robots_fetch_http_status ?? null,
    robotsFetchStatus: snapshot?.robots_fetch_status ?? null
  });
  const categories = new Set<OpsInterruptionCategory>();
  const haystack = normalizeForMatching(
    stopReasonCode,
    stopReasonDetail,
    stopReasonLabel,
    input.scan.error_message,
    ...(input.events ?? []).flatMap((event) => [event.event_type, event.message])
  );
  const httpStatus = stopReasonHttpStatus ?? snapshot?.homepage_fetch_http_status ?? null;

  if (derivedOutcome) {
    addCategory(categories, "other_access_limitation");
  }
  if (snapshot?.captcha_flag === true || snapshot?.challenge_suspected === true || blockPageClassification === "captcha_probable" || /captcha|challenge|security/.test(haystack)) {
    addCategory(categories, "captcha_or_security_challenge");
  }
  if (snapshot?.auth_wall_detected === true || snapshot?.auth_wall_suspected === true || blockPageClassification === "login_wall_probable" || /auth|login|sign.?in/.test(haystack)) {
    addCategory(categories, "authentication_wall");
  }
  if (/paywall|subscription/.test(haystack)) {
    addCategory(categories, "paywall_or_subscription_wall");
  }
  if (snapshot?.geo_block_suspected === true || /geo|regional|country|location|reputation|fingerprint/.test(haystack)) {
    addCategory(categories, "geo_or_regional_block");
  }
  if (snapshot?.blocked_flag === true || snapshot?.rate_limit_suspected === true || httpStatus === 401 || httpStatus === 403 || httpStatus === 429 || /forbidden|\bbot\b|blocked|rate.?limit|403|401|429/.test(haystack)) {
    addCategory(categories, "bot_block_or_forbidden");
  }
  if (/dns|enotfound|connection|econn|transport/.test(haystack)) {
    addCategory(categories, "dns_or_connection_failure");
  }
  if (/tls|certificate|ssl/.test(haystack)) {
    addCategory(categories, "tls_or_certificate_failure");
  }
  if (snapshot?.homepage_fetch_status === "timeout" || /timeout|navigation/.test(haystack)) {
    addCategory(categories, "timeout_or_navigation_failure");
  }
  if (snapshot?.robots_allowed === false || /robots/.test(haystack)) {
    addCategory(categories, "robots_or_policy_block");
  }
  if (/non.?html|unsupported|content.?type/.test(haystack)) {
    addCategory(categories, "unsupported_content_or_non_html");
  }
  if (/scale.?in|task.?stop|stopped task|ecs/.test(haystack)) {
    addCategory(categories, "task_stop_or_scale_in_interruption");
  }
  if (input.scan.status === "failed" || input.scan.status === "error" || /runtime|exception|crash|failed|error/.test(haystack)) {
    addCategory(categories, "scanner_runtime_interruption");
  }

  if (derivedOutcome && categories.size === 2 && categories.has("scans_with_any_interruption") && categories.has("other_access_limitation")) {
    const kind = derivedOutcome.kind;
    if (kind === "robots_restricted") {
      addCategory(categories, "robots_or_policy_block");
    } else if (kind === "transport_failure") {
      addCategory(categories, "dns_or_connection_failure");
    } else if (kind === "timeout_navigation") {
      addCategory(categories, "timeout_or_navigation_failure");
    } else if (kind === "reachability_blocked_geo_or_reputation") {
      addCategory(categories, "geo_or_regional_block");
    } else if (kind === "reachability_blocked_captcha" || kind === "reachability_blocked_challenge_suspected") {
      addCategory(categories, "captcha_or_security_challenge");
    } else if (kind === "reachability_blocked_auth_wall") {
      addCategory(categories, "authentication_wall");
    } else if (kind === "reachability_blocked_homepage_401" || kind === "reachability_blocked_homepage_403" || kind === "homepage_rate_limited_429") {
      addCategory(categories, "bot_block_or_forbidden");
    }
  }

  if (categories.size > 1) {
    categories.delete("other_access_limitation");
  }

  const orderedCategories = OPS_INTERRUPTION_CATEGORIES.filter((category) => categories.has(category));

  return {
    accessPostureClass,
    categories: orderedCategories,
    hasInterruption: orderedCategories.includes("scans_with_any_interruption"),
    reason: stopReasonDetail ?? derivedOutcome?.reason.replace(/^Reason:\s*/i, "") ?? input.scan.error_message ?? null,
    source: snapshot
      ? "snapshot"
      : input.events && input.events.length > 0
        ? "scan_event"
        : input.scan.error_message
          ? "scan_error"
          : "none",
    stopReasonCode,
    stopReasonDetail,
    stopReasonHttpStatus,
    stopReasonLabel
  };
}
