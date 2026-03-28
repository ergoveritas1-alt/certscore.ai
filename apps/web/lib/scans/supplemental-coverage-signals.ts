export type SupplementalCoverageEvent = {
  eventType: string;
  metadataJson: unknown;
};

export type SupplementalCoverageExistingSignal = {
  key: string;
};

export type SupplementalCoverageSignal = {
  key: string;
  label: string;
  snapshotField: string;
  value: boolean | number | string | string[];
};

export function deriveSupplementalCoverageSignals(input: {
  events: SupplementalCoverageEvent[];
  existingSignals: SupplementalCoverageExistingSignal[];
}) {
  const seenKeys = new Set(input.existingSignals.map((signal) => signal.key));
  const supplementalSignals = new Map<string, SupplementalCoverageSignal>();
  const snapshotOverrides: Record<string, unknown> = {};

  const coverageMap = new Map<
    string,
    {
      key: string;
      label: string;
      snapshotField: string;
    }
  >([
    [
      "privacy_policy",
      {
        key: "disclosure.privacy_policy_fetch_failed",
        label: "Privacy policy page unavailable",
        snapshotField: "privacy_policy_present"
      }
    ],
    [
      "terms_of_service",
      {
        key: "disclosure.terms_of_service_fetch_failed",
        label: "Terms page unavailable",
        snapshotField: "terms_of_service_present"
      }
    ],
    [
      "cookie_policy",
      {
        key: "disclosure.cookie_policy_fetch_failed",
        label: "Cookie policy unavailable",
        snapshotField: "cookie_policy_present"
      }
    ],
    [
      "accessibility_statement",
      {
        key: "disclosure.accessibility_statement_fetch_failed",
        label: "Accessibility statement unavailable",
        snapshotField: "accessibility_statement_present"
      }
    ],
    [
      "contact",
      {
        key: "disclosure.contact_page_fetch_failed",
        label: "Contact page unavailable",
        snapshotField: "contact_page_present"
      }
    ]
  ]);

  let boundedDiscoveryUnresolved = false;

  for (const event of input.events) {
    if (event.eventType !== "runtime.build_phase_diagnostic" || !event.metadataJson || typeof event.metadataJson !== "object") {
      continue;
    }

    const metadata = event.metadataJson as Record<string, unknown>;
    const phase = String(metadata.phase ?? "");

    if (phase === "surface_recovery_summary") {
      const unresolvedSurfaceTypes = Array.isArray(metadata.unresolvedSurfaceTypes)
        ? metadata.unresolvedSurfaceTypes.filter((value): value is string => typeof value === "string")
        : [];
      const relevantUnresolvedSurfaceTypes = unresolvedSurfaceTypes.filter((value) =>
        [
          "privacy_policy",
          "terms_of_service",
          "privacy_choices",
          "privacy_rights_dsar",
          "accessibility_support"
        ].includes(value)
      );

      if (relevantUnresolvedSurfaceTypes.length > 0) {
        boundedDiscoveryUnresolved = true;
      }
    }

    if (phase === "policy_enrichment") {
      const skipReason = typeof metadata.skipReason === "string" ? metadata.skipReason : null;
      const policyPageCount = typeof metadata.policyPageCount === "number" ? metadata.policyPageCount : null;

      if (skipReason === "no_policy_pages" && policyPageCount === 0) {
        boundedDiscoveryUnresolved = true;
      }
    }

    if (!["prefetch_fetch_target", "expansion_fetch_target", "key_page_coverage_fetch_target"].includes(phase)) {
      continue;
    }

    const pageType = typeof metadata.pageType === "string" ? metadata.pageType : null;
    const fetchStatus = typeof metadata.fetchStatus === "string" ? metadata.fetchStatus : null;
    const targetUrl =
      typeof metadata.targetUrl === "string"
        ? metadata.targetUrl
        : typeof metadata.finalUrl === "string"
          ? metadata.finalUrl
          : null;
    const coverageDefinition = pageType ? coverageMap.get(pageType) : null;

    if (!coverageDefinition || !fetchStatus || ["ok", "redirected"].includes(fetchStatus)) {
      continue;
    }

    if (seenKeys.has(coverageDefinition.key)) {
      snapshotOverrides[coverageDefinition.snapshotField] = false;
      continue;
    }

    const existingSupplemental = supplementalSignals.get(coverageDefinition.key);
    if (existingSupplemental) {
      if (targetUrl) {
        const mergedUrls = Array.isArray(existingSupplemental.value)
          ? [...new Set([...existingSupplemental.value, targetUrl])]
          : [targetUrl];
        existingSupplemental.value = mergedUrls;
      }
    } else {
      supplementalSignals.set(coverageDefinition.key, {
        key: coverageDefinition.key,
        label: coverageDefinition.label,
        snapshotField: coverageDefinition.snapshotField,
        value: targetUrl ? [targetUrl] : true
      });
      seenKeys.add(coverageDefinition.key);
    }
    snapshotOverrides[coverageDefinition.snapshotField] = false;
  }

  if (!seenKeys.has("disclosure.key_page_discovery_unresolved_after_bounded_search") && boundedDiscoveryUnresolved) {
    supplementalSignals.set("disclosure.key_page_discovery_unresolved_after_bounded_search", {
      key: "disclosure.key_page_discovery_unresolved_after_bounded_search",
      label: "Bounded key-page discovery unresolved",
      snapshotField: "key_page_discovery_unresolved_after_bounded_search",
      value: true
    });
  }

  return {
    snapshotOverrides,
    supplementalSignals: [...supplementalSignals.values()]
  };
}
