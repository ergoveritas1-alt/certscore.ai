type ScanStopReasonInput = {
  authWallDetected?: boolean | null;
  blockedFlag?: boolean | null;
  captchaFlag?: boolean | null;
  fallbackSourceLabel?: string | null;
  fallbackSourceReason?: string | null;
  homepageFetchHttpStatus?: number | null;
  homepageFetchStatus?: string | null;
  pagesScanned?: number | null;
  robotsAllowed?: boolean | null;
  robotsFetchHttpStatus?: number | null;
  robotsFetchStatus?: string | null;
};

export type ScanOutcomeKind =
  | "reachability_blocked"
  | "transport_failure"
  | "domain_inactive_or_unstable"
  | "fallback_source_confirmed"
  | "verification_incomplete";

export type ScanStopReason = {
  kind:
    | "robots_blocked"
    | "homepage_blocked"
    | "captcha"
    | "auth_wall"
    | "homepage_unreachable"
    | "inactive_or_unstable"
    | "fallback_source_confirmed"
    | "no_pages_scanned";
  outcome: ScanOutcomeKind;
  outcomeTitle: string;
  previewFindingTitle: string;
  reason: string;
  reviewMessage: string;
  reviewTitle: string;
  whatThisMeans: string[];
};

function normalizeStatus(value: string | null | undefined) {
  return typeof value === "string" ? value.trim().toLowerCase() : null;
}

function getFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function buildOutcome(input: Omit<ScanStopReason, "whatThisMeans"> & { whatThisMeans?: string[] }): ScanStopReason {
  return {
    ...input,
    whatThisMeans:
      input.whatThisMeans ??
      [
        "The scanner did not verify a trustworthy public homepage surface for this run.",
        "Ordinary finding counts and section summaries should be read as incomplete rather than clean.",
        "Use the exact stop reason and scan diagnostics before drawing compliance conclusions."
      ]
  };
}

export function deriveScanStopReason(input: ScanStopReasonInput): ScanStopReason | null {
  const fallbackSourceLabel = typeof input.fallbackSourceLabel === "string" ? input.fallbackSourceLabel.trim() : "";
  const fallbackSourceReason = typeof input.fallbackSourceReason === "string" ? input.fallbackSourceReason.trim() : "";
  const homepageFetchStatus = normalizeStatus(input.homepageFetchStatus);
  const homepageFetchHttpStatus = getFiniteNumber(input.homepageFetchHttpStatus);
  const pagesScanned = getFiniteNumber(input.pagesScanned);
  const robotsAllowed = input.robotsAllowed === true ? true : input.robotsAllowed === false ? false : null;
  const robotsFetchStatus = normalizeStatus(input.robotsFetchStatus);
  const robotsFetchHttpStatus = getFiniteNumber(input.robotsFetchHttpStatus);

  if (fallbackSourceLabel && fallbackSourceReason) {
    return buildOutcome({
      kind: "fallback_source_confirmed",
      outcome: "fallback_source_confirmed",
      outcomeTitle: "Fallback source confirmed",
      previewFindingTitle: "Authoritative fallback source confirmed",
      reason: `Reason: ${fallbackSourceReason}`,
      reviewMessage: `Primary homepage verification did not complete, but ${fallbackSourceLabel} confirms the property or content through an authoritative alternate source.`,
      reviewTitle: "Fallback source confirmed",
      whatThisMeans: [
        "The primary site path did not verify cleanly during this run.",
        "An authoritative alternate source confirms the property or content still exists.",
        "Treat the fallback confirmation as source-specific context, not as proof that the primary domain was fully reachable."
      ]
    });
  }

  if (robotsAllowed === false) {
    const robotsReason =
      robotsFetchStatus === "ok"
        ? "Reason: robots.txt disallowed scanner access to the homepage."
        : robotsFetchHttpStatus
          ? `Reason: crawler access was blocked by robots handling with HTTP ${robotsFetchHttpStatus} before homepage verification.`
          : "Reason: crawler access was disallowed by robots policy before homepage verification.";
    return buildOutcome({
      kind: "robots_blocked",
      outcome: "reachability_blocked",
      outcomeTitle: "Reachability blocked",
      previewFindingTitle: "Robots policy blocked live scan access",
      reason: robotsReason,
      reviewMessage:
        "Homepage verification was blocked for this scan path by crawler policy, so the run did not produce a trustworthy public-site review.",
      reviewTitle: "Reachability blocked"
    });
  }

  if (homepageFetchHttpStatus === 429) {
    return buildOutcome({
      kind: "homepage_blocked",
      outcome: "reachability_blocked",
      outcomeTitle: "Reachability blocked",
      previewFindingTitle: "Homepage blocked during live scan",
      reason: "Reason: homepage request was rate-limited with HTTP 429 before the scanner could verify a usable page surface.",
      reviewMessage:
        "Homepage fetch was blocked for this scan path. The site may still be publicly reachable, but this run hit rate-limiting or anti-automation controls before the scanner could verify the public surface.",
      reviewTitle: "Reachability blocked"
    });
  }

  if (homepageFetchHttpStatus === 403 || homepageFetchStatus === "forbidden" || homepageFetchStatus === "blocked" || input.blockedFlag === true) {
    return buildOutcome({
      kind: "homepage_blocked",
      outcome: "reachability_blocked",
      outcomeTitle: "Reachability blocked",
      previewFindingTitle: "Homepage blocked during live scan",
      reason: homepageFetchHttpStatus
        ? `Reason: homepage request was blocked with HTTP ${homepageFetchHttpStatus}.`
        : "Reason: homepage request was blocked by bot protection, access controls, or a forbidden response.",
      reviewMessage:
        "Homepage fetch was blocked for this scan path. The site may still be publicly reachable, but this run hit anti-automation or access-control behavior before the scanner could verify the public surface.",
      reviewTitle: "Reachability blocked"
    });
  }

  if (input.captchaFlag === true) {
    return buildOutcome({
      kind: "captcha",
      outcome: "reachability_blocked",
      outcomeTitle: "Reachability blocked",
      previewFindingTitle: "Bot challenge blocked homepage verification",
      reason: "Reason: the homepage triggered a captcha or bot challenge before the scanner could verify a usable public page surface.",
      reviewMessage:
        "Homepage fetch was blocked for this scan path by a bot challenge, so the run did not verify a trustworthy public site surface.",
      reviewTitle: "Reachability blocked"
    });
  }

  if (input.authWallDetected === true) {
    return buildOutcome({
      kind: "auth_wall",
      outcome: "reachability_blocked",
      outcomeTitle: "Reachability blocked",
      previewFindingTitle: "Authentication wall blocked homepage verification",
      reason: "Reason: the homepage presented an authentication wall before the scanner could verify a usable public page surface.",
      reviewMessage:
        "Homepage fetch was blocked for this scan path by an authentication wall, so the run did not verify a trustworthy public site surface.",
      reviewTitle: "Reachability blocked"
    });
  }

  if (homepageFetchStatus === "not_found") {
    return buildOutcome({
      kind: "inactive_or_unstable",
      outcome: "domain_inactive_or_unstable",
      outcomeTitle: "Domain inactive or unstable",
      previewFindingTitle: "Homepage may be inactive or unstable",
      reason: homepageFetchHttpStatus
        ? `Reason: homepage returned HTTP ${homepageFetchHttpStatus} Not Found.`
        : "Reason: homepage returned a not-found response.",
      reviewMessage:
        "Homepage fetch did not resolve to a usable public page, which can indicate domain inactivity, shutdown, or unstable site state rather than a simple scan miss.",
      reviewTitle: "Domain inactive or unstable",
      whatThisMeans: [
        "The primary domain did not resolve to a usable public homepage during this run.",
        "This can reflect shutdown, abandonment, domain decay, or unstable hosting.",
        "Treat the result as site-state risk, not as evidence that the scanner reviewed the full public surface."
      ]
    });
  }

  if (homepageFetchStatus === "timeout") {
    return buildOutcome({
      kind: "homepage_unreachable",
      outcome: "transport_failure",
      outcomeTitle: "Transport failure",
      previewFindingTitle: "Homepage could not be reached reliably",
      reason: "Reason: homepage navigation timed out before the scanner could verify a usable page surface.",
      reviewMessage:
        "Homepage fetch failed for this scan path because the site could not be reached reliably over the network, so this run does not support ordinary compliance conclusions.",
      reviewTitle: "Transport failure"
    });
  }

  if (homepageFetchStatus === "error") {
    return buildOutcome({
      kind: "homepage_unreachable",
      outcome: "transport_failure",
      outcomeTitle: "Transport failure",
      previewFindingTitle: "Homepage could not be reached reliably",
      reason: "Reason: homepage could not be reached reliably because of a connection, DNS, TLS, or other transport failure.",
      reviewMessage:
        "Homepage fetch failed for this scan path because the site could not be reached reliably over the network, so this run does not support ordinary compliance conclusions.",
      reviewTitle: "Transport failure"
    });
  }

  if (pagesScanned === 0) {
    return buildOutcome({
      kind: "no_pages_scanned",
      outcome: "verification_incomplete",
      outcomeTitle: "Verification incomplete",
      previewFindingTitle: "No verified public pages were captured",
      reason: "Reason: the scanner did not capture any verified public pages during the live pass.",
      reviewMessage:
        "The live scan did not capture any verified public pages, so the run cannot support ordinary compliance conclusions for the target domain.",
      reviewTitle: "Verification incomplete"
    });
  }

  return null;
}
