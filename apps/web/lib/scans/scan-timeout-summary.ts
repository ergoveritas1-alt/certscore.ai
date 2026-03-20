type ScanTimeoutSummaryInput = {
  accessibilityRuleCountTotal?: number | null;
  consentAuditCompleted?: boolean | null;
  consentPreconsentViolationCount?: number | null;
  errorMessage?: string | null;
  events?: Array<{
    eventType: string;
    message: string;
    metadataJson?: unknown;
  }> | null;
  pagesRequested?: number | null;
  pagesScanned?: number | null;
  keyPageDiscoverySummary?: unknown | null;
  preconsentTrackingDetected?: boolean | null;
  renderModeUsed?: string | null;
  status?: string | null;
  timeoutFlag?: boolean | null;
  trackingBeforeConsentDetected?: boolean | null;
  trackerEvidenceUrlCount?: number | null;
  wcagErrorCountTotal?: number | null;
};

export type ScanTimeoutSummary = {
  details: string[];
  title: string;
};

export type ScanExecutionSummary = ScanTimeoutSummary & {
  tone: "danger" | "success" | "warning";
};

function getFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function deriveScanTimeoutSummary(input: ScanTimeoutSummaryInput): ScanTimeoutSummary | null {
  const timedOut = input.timeoutFlag === true;
  const httpOnlyFallback = input.renderModeUsed === "http_only";

  if (!timedOut && !httpOnlyFallback) {
    return null;
  }

  const details: string[] = [];
  if (httpOnlyFallback) {
    details.push(
      "The browser runtime pass did not complete cleanly, so this result fell back to the HTTP/static path for the final snapshot."
    );
  } else if (timedOut) {
    details.push("The browser runtime pass timed out before all dynamic checks could finish.");
  }

  const accessibilityRuleCountTotal = getFiniteNumber(input.accessibilityRuleCountTotal);
  const wcagErrorCountTotal = getFiniteNumber(input.wcagErrorCountTotal);
  if ((accessibilityRuleCountTotal ?? 0) === 0 || (wcagErrorCountTotal ?? 0) === 0) {
    details.push(
      "Automated accessibility rule rows were not retained for this run, so WCAG issue counts and rule-level examples may be understated or missing."
    );
  }

  if (input.consentAuditCompleted === false) {
    details.push(
      "The consent interaction audit did not complete, so reject/accept enforcement behavior and post-choice tracker suppression evidence may be missing."
    );
  }

  const preconsentObserved = input.preconsentTrackingDetected === true || input.trackingBeforeConsentDetected === true;
  const preconsentViolationCount = getFiniteNumber(input.consentPreconsentViolationCount) ?? 0;
  const trackerEvidenceUrlCount = getFiniteNumber(input.trackerEvidenceUrlCount) ?? 0;
  if (preconsentObserved && preconsentViolationCount === 0 && trackerEvidenceUrlCount === 0) {
    details.push(
      "Pre-consent tracking was still detected, but request-level evidence URLs and vendor-level pre-consent violation rows were not retained in the final result."
    );
  }

  return {
    details,
    title: httpOnlyFallback ? "Scan timed out and fell back to HTTP-only evidence" : "Scan timed out during browser analysis"
  };
}

function getEventString(metadata: unknown, key: string) {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }

  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function getEventBoolean(metadata: unknown, key: string) {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }

  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "boolean" ? value : null;
}

function getEventNumber(metadata: unknown, key: string) {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }

  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function humanizeDiagnosticName(value: string | null) {
  if (!value) {
    return "A scan stage";
  }

  return value.replaceAll(/[_-]+/g, " ");
}

function formatPageLabel(pageType: string | null, targetUrl: string | null) {
  const label = pageType ? humanizeDiagnosticName(pageType) : "target page";
  if (!targetUrl) {
    return label;
  }

  return `${label} (${targetUrl})`;
}

function describeDiscoverySource(source: string | null) {
  switch (source) {
    case "rendered_link":
      return "via rendered links";
    case "sitemap":
      return "via sitemap discovery";
    case "second_hop_legal_hub":
      return "via a legal hub follow-up page";
    case "same_brand_subdomain":
      return "via same-brand subdomain discovery";
    case "guessed_slug":
      return "from fallback guessed slugs";
    default:
      return "during bounded discovery";
  }
}

function toIssueFamilyLabel(pageType: string) {
  switch (pageType) {
    case "privacy_policy":
      return "privacy-policy";
    case "terms_of_service":
      return "terms";
    case "cookie_policy":
      return "cookie-policy";
    case "accessibility_statement":
      return "accessibility";
    case "contact":
      return "contact-page";
    default:
      return humanizeDiagnosticName(pageType);
  }
}

function getKeyPageDiscoverySummaries(summary: unknown) {
  if (!summary || typeof summary !== "object") {
    return [] as Array<{
      attemptedUrls: string[];
      bestDiscoverySource: string | null;
      guessedOnly: boolean;
      pageType: string;
      stopReason: string | null;
      successfulUrl: string | null;
      successfulHostRelation: "same_brand_subdomain" | null;
      surfaceDetected: boolean;
    }>;
  }

  const pageSummaries = (summary as { pageSummaries?: unknown }).pageSummaries;
  if (!Array.isArray(pageSummaries)) {
    return [];
  }

  return pageSummaries
    .filter((pageSummary): pageSummary is Record<string, unknown> => Boolean(pageSummary) && typeof pageSummary === "object")
    .map((pageSummary) => ({
      attemptedUrls: Array.isArray(pageSummary.attemptedUrls)
        ? pageSummary.attemptedUrls.filter((value): value is string => typeof value === "string")
        : [],
      bestDiscoverySource: typeof pageSummary.bestDiscoverySource === "string" ? pageSummary.bestDiscoverySource : null,
      guessedOnly: pageSummary.guessedOnly === true,
      pageType: typeof pageSummary.pageType === "string" ? pageSummary.pageType : "unknown",
      stopReason: typeof pageSummary.stopReason === "string" ? pageSummary.stopReason : null,
      successfulUrl: typeof pageSummary.successfulUrl === "string" ? pageSummary.successfulUrl : null,
      successfulHostRelation:
        pageSummary.successfulHostRelation === "same_brand_subdomain" ? "same_brand_subdomain" : null,
      surfaceDetected: pageSummary.surfaceDetected === true
    }));
}

export function deriveScanExecutionSummary(input: ScanTimeoutSummaryInput): ScanExecutionSummary {
  const timeoutSummary = deriveScanTimeoutSummary(input);
  const details = new Set<string>(timeoutSummary?.details ?? []);
  const events = input.events ?? [];
  const missingTargetPages: Array<{ label: string; pageType: string | null }> = [];
  const keyPageSummaries = getKeyPageDiscoverySummaries(input.keyPageDiscoverySummary);
  const resolvedPageTypes = new Set(
    keyPageSummaries.filter((summary) => Boolean(summary.successfulUrl)).map((summary) => summary.pageType)
  );
  let partialScanDetected = false;
  let partialScanPageCounts: { requested: number | null; scanned: number | null } = {
    requested: getFiniteNumber(input.pagesRequested),
    scanned: getFiniteNumber(input.pagesScanned)
  };

  for (const event of events) {
    if (event.eventType === "crawl.access_limitations_detected") {
      details.add(event.message);
      continue;
    }

    if (event.eventType === "crawl.page_discovery_completed" && getEventBoolean(event.metadataJson, "partialScan") === true) {
      partialScanDetected = true;
      partialScanPageCounts = {
        requested: partialScanPageCounts.requested ?? getEventNumber(event.metadataJson, "prefetchTargetCount"),
        scanned: partialScanPageCounts.scanned ?? getEventNumber(event.metadataJson, "pagesScanned")
      };
      continue;
    }

    if (
      event.eventType === "runtime.build_phase_diagnostic" &&
      ["prefetch_fetch_target", "expansion_fetch_target", "key_page_coverage_fetch_target"].includes(
        getEventString(event.metadataJson, "phase") ?? ""
      ) &&
      getEventString(event.metadataJson, "fetchStatus") === "not_found"
    ) {
      const pageType = getEventString(event.metadataJson, "pageType");
      if (!pageType || !resolvedPageTypes.has(pageType)) {
        missingTargetPages.push({
          label: formatPageLabel(pageType, getEventString(event.metadataJson, "targetUrl") ?? getEventString(event.metadataJson, "finalUrl")),
          pageType
        });
      }
      continue;
    }

    if (
      (event.eventType === "runtime.build_phase_diagnostic" || event.eventType === "runtime.browser_pass_diagnostic") &&
      getEventString(event.metadataJson, "status") === "timeout"
    ) {
      const phase = humanizeDiagnosticName(getEventString(event.metadataJson, "phase") ?? getEventString(event.metadataJson, "stage"));
      details.add(`${phase.charAt(0).toUpperCase() + phase.slice(1)} timed out before finishing.`);
      continue;
    }

    if (
      (event.eventType === "runtime.build_phase_diagnostic" || event.eventType === "runtime.browser_pass_diagnostic") &&
      getEventString(event.metadataJson, "status") === "error"
    ) {
      details.add(event.message);
      continue;
    }
  }

  if (
    !partialScanDetected &&
    partialScanPageCounts.scanned !== null &&
    partialScanPageCounts.requested !== null &&
    partialScanPageCounts.scanned < partialScanPageCounts.requested
  ) {
    partialScanDetected = true;
  }

  if (input.errorMessage) {
    details.add(`The scan recorded a terminal error: ${input.errorMessage}`);
  }

  if (partialScanDetected) {
    const scanned = partialScanPageCounts.scanned;
    const requested = partialScanPageCounts.requested;
    if (scanned !== null && requested !== null) {
      details.add(`The scan completed with only ${scanned} of ${requested} planned pages captured, so coverage is incomplete.`);
    } else {
      details.add("The scan completed as a partial pass, so coverage is incomplete.");
    }

    if (missingTargetPages.length > 0) {
      const uniqueMissingPages = [...new Set(missingTargetPages.map((page) => page.label))];
      const unresolvedIssueFamilies = [
        ...new Set(
          missingTargetPages
            .map((page) => (page.pageType ? toIssueFamilyLabel(page.pageType) : null))
            .filter((value): value is string => Boolean(value))
        )
      ];
      details.add(`These expected target pages returned 404 during bounded key-page fetch: ${uniqueMissingPages.join("; ")}.`);
      if (unresolvedIssueFamilies.length > 0) {
        details.add(
          `That means issue detection may understate ${unresolvedIssueFamilies.join(", ")} findings because those target pages were unavailable at their discovered URLs.`
        );
      } else {
        details.add(
          "That means some issue families may be understated because not all planned follow-up pages were successfully fetched and analyzed."
        );
      }
    } else {
      details.add(
        "That means some issue families may be understated because not all planned follow-up pages were successfully fetched and analyzed."
      );
    }
  }

  for (const pageSummary of keyPageSummaries) {
    if (pageSummary.successfulUrl) {
      if (pageSummary.successfulHostRelation === "same_brand_subdomain") {
        const pageLabel = humanizeDiagnosticName(pageSummary.pageType);
        details.add(
          `${pageLabel.charAt(0).toUpperCase() + pageLabel.slice(1)} coverage was resolved on a same-brand subdomain (${pageSummary.successfulUrl}).`
        );
      }
      continue;
    }

    const pageLabel = humanizeDiagnosticName(pageSummary.pageType);
    if (pageSummary.guessedOnly) {
      details.add(`Only guessed-slug candidates were available for ${pageLabel}, so confidence in page absence is lower.`);
      continue;
    }

    if (!pageSummary.surfaceDetected || pageSummary.stopReason === "no_surface") {
      details.add(`No ${pageLabel} surface was detected during bounded discovery.`);
      continue;
    }

    if (pageSummary.stopReason === "all_attempts_failed" || pageSummary.stopReason === "repeated_failures") {
      details.add(
        `${pageLabel.charAt(0).toUpperCase() + pageLabel.slice(1)} candidates were found ${describeDiscoverySource(pageSummary.bestDiscoverySource)}, but all bounded fetch attempts failed.`
      );
      continue;
    }

    if (pageSummary.stopReason === "budget_exhausted") {
      details.add(
        `${pageLabel.charAt(0).toUpperCase() + pageLabel.slice(1)} candidates were found ${describeDiscoverySource(pageSummary.bestDiscoverySource)}, but the bounded discovery budget was exhausted before a successful fetch.`
      );
    }
  }

  if (details.size === 0) {
    if (input.status === "completed") {
      return {
        details: ["All recorded scan stages completed without persisted warnings or failures."],
        title: "Scan pass completed as planned",
        tone: "success"
      };
    }

    return {
      details: ["The scan is still in progress and has not recorded any persisted warnings yet."],
      title: "Scan pass is still running",
      tone: "warning"
    };
  }

  const tone = input.status === "failed" || input.errorMessage ? "danger" : "warning";

  return {
    details: [...details],
    title:
      tone === "danger"
        ? "Scan pass encountered errors"
        : input.status === "completed"
          ? "Scan pass completed with warnings"
          : "Scan pass has recorded warnings",
    tone
  };
}
