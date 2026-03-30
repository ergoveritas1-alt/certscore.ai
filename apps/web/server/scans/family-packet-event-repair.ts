import { isMeaningfulPolicyText, normalizePolicySnippet } from "../../lib/scans/policy-snippet-normalization";

type ScanEventRecordLike = {
  eventType: string;
  metadataJson: unknown;
};

type FamilyPacketTargetRecord = {
  canonicalUrl?: unknown;
  fetchQuality?: unknown;
  snippet?: unknown;
  supportedSurfaceTypes?: unknown;
  supportingRefs?: unknown;
  title?: unknown;
};

type FamilyPacketFindingRecord = {
  evidencePayload?: unknown;
  evidenceUrls?: unknown;
  findingId?: unknown;
  reason?: unknown;
  sourceSurfaceTypes?: unknown;
};

type DiscoveryCandidateRecord = {
  candidateScore: number;
  candidateUrl: string;
  discoveredFrom: string;
  hostRelation: string;
  pageType: string;
  sourceUrl: string | null;
};

type VerifiedSurfaceRecoveryRecord = {
  snippet: string | null;
  surfaceType: string;
  title: string | null;
  url: string;
};

const FINDING_POLICY_EVIDENCE_KEYS: Record<string, string[]> = {
  affiliate_disclosure_present: ["affiliate_disclosure", "affiliate", "notice_contact"],
  privacy_contact_path_present: ["notice_contact", "privacy_contact", "dsar"],
  privacy_rights_path_present: ["dsar", "rights_signal:access", "rights_signal:delete", "rights_signal:correction", "notice_contact"],
  targeted_advertising_choices_present: ["do_not_sell", "privacy_choices", "targeted_advertising"],
  third_party_advertising_disclosure_present: ["topic:third_party_advertising_disclosure"],
  tracking_technologies_disclosure_present: ["topic:tracking_technologies_disclosure", "cookies", "cookie_notice", "cookie_table"],
  children_privacy_disclosure_present: ["topic:children", "children"]
};

const TERMS_PATH_PATTERN =
  /\/t\/terms(?:\/|$)|\/terms(?:\/|$)|\/terms-of-service(?:\/|$)|\/terms-of-sale(?:\/|$)|\/terms-of-use(?:\/|$)|\/termsofuse(?:\/|$)|\/termsandconditions?(?:\/|$)|\/account-terms(?:\/|$)|\/terms(?:[-_])?of(?:[-_])?(?:service|use)(?:\.html)?(?:\/|$)|\/termsofuse(?:\.html)?(?:\/|$)|\/terms(?:[-_])?and(?:[-_])?conditions?(?:\.html)?(?:\/|$)|\/legal\/.*terms(?:\/|$)|\/policy\/legal(?:\/|$)|\/info\/terms(?:ofuse)?\.html(?:\/|$)/;
const PRIVACY_PATH_PATTERN =
  /\/privacy(?:\/|$)|\/privacy-policy(?:\/|$)|\/privacy-notice(?:\/|$)|\/policy\/privacy(?:\/|$)|\/politica(?:[-_])?de(?:[-_])?confidentialitate(?:\/|$)|\/datenschutzerklaerung(?:\/|$)|\/privacy(?:\.html)?(?:\/|$)|\/terms(?:\/|#|$).*#privacy(?:[_-])?policy(?:\/|$)?/;
const CONTACT_PATH_PATTERN =
  /\/t\/contact(?:[_-]us)?(?:\/|$)|\/contact-us(?:\/|$)|\/contact(?:\/|$)|\/support(?:\/|$)|\/help(?:\/|$)|\/contact(?:[-_]?us)?(?:\.html)?(?:\/|$)|\/info\/contact(?:[-_]?us)?\.html(?:\/|$)/;
const ACCESSIBILITY_PATH_PATTERN =
  /\/accessibility(?:\/|$)|\/accessibility-statement(?:\/|$)|\/accessibility(?:\.html)?(?:\/|$)/;

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0))];
}

function getStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0) : [];
}

function getRecordArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object") : [];
}

function getHostKey(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function getTargetDomainKey(target: FamilyPacketTargetRecord) {
  return typeof target.canonicalUrl === "string" ? getHostKey(target.canonicalUrl) : null;
}

function getTargetSupportingRefs(target: FamilyPacketTargetRecord) {
  return getRecordArray(target.supportingRefs);
}

function targetHasOnlySelfReferentialDocumentRefs(target: FamilyPacketTargetRecord) {
  const targetDomainKey = getTargetDomainKey(target);
  const refs = getTargetSupportingRefs(target);

  if (refs.length === 0) {
    return true;
  }

  return refs.every((ref) => {
    const refType = typeof ref.refType === "string" ? ref.refType : null;
    if (refType && refType !== "title" && refType !== "excerpt") {
      return false;
    }

    const refDomainKey = typeof ref.url === "string" ? getHostKey(ref.url) : null;
    return !refDomainKey || refDomainKey === targetDomainKey;
  });
}

function getCanonicalTargetDomainCounts(events: ScanEventRecordLike[]) {
  const counts = new Map<string, number>();

  for (const event of events) {
    if (event.eventType !== "runtime.build_phase_diagnostic" || !event.metadataJson || typeof event.metadataJson !== "object") {
      continue;
    }

    const metadata = event.metadataJson as Record<string, unknown>;
    if (metadata.phase !== "finding_family_packets" || !Array.isArray(metadata.packets)) {
      continue;
    }

    for (const packet of metadata.packets as Array<Record<string, unknown>>) {
      const canonicalTargets = Array.isArray(packet.canonicalTargets)
        ? (packet.canonicalTargets as FamilyPacketTargetRecord[])
        : [];
      for (const target of canonicalTargets) {
        const domainKey = getTargetDomainKey(target);
        if (!domainKey) {
          continue;
        }
        counts.set(domainKey, (counts.get(domainKey) ?? 0) + 1);
      }
    }
  }

  return counts;
}

function suppressOutlierLegalTargets(input: {
  canonicalTargets: FamilyPacketTargetRecord[];
  supportedUnifiedFindings: FamilyPacketFindingRecord[];
  canonicalTargetDomainCounts: Map<string, number>;
}) {
  const domainCounts = input.canonicalTargetDomainCounts;
  const dominantCount = Math.max(0, ...domainCounts.values());
  if (dominantCount < 2) {
    return {
      changed: false,
      canonicalTargets: input.canonicalTargets,
      supportedUnifiedFindings: input.supportedUnifiedFindings
    };
  }

  const dominantDomainKeys = new Set(
    [...domainCounts.entries()].filter(([, count]) => count >= dominantCount).map(([domainKey]) => domainKey)
  );
  const suspiciousDomainKeys = new Set<string>();

  for (const target of input.canonicalTargets) {
    const surfaceTypes = getStringArray(target.supportedSurfaceTypes);
    if (!surfaceTypes.includes("privacy_policy") && !surfaceTypes.includes("terms_of_service")) {
      continue;
    }

    const domainKey = getTargetDomainKey(target);
    if (!domainKey || dominantDomainKeys.has(domainKey) || (domainCounts.get(domainKey) ?? 0) > 1) {
      continue;
    }

    if (!targetHasOnlySelfReferentialDocumentRefs(target)) {
      continue;
    }

    suspiciousDomainKeys.add(domainKey);
  }

  if (suspiciousDomainKeys.size === 0) {
    return {
      changed: false,
      canonicalTargets: input.canonicalTargets,
      supportedUnifiedFindings: input.supportedUnifiedFindings
    };
  }

  const canonicalTargets = input.canonicalTargets.filter((target) => {
    const domainKey = getTargetDomainKey(target);
    return !domainKey || !suspiciousDomainKeys.has(domainKey);
  });

  const supportedUnifiedFindings = input.supportedUnifiedFindings.filter((finding) => {
    const evidenceUrls = getStringArray(finding.evidenceUrls);
    if (evidenceUrls.length === 0) {
      return true;
    }

    const evidenceDomainKeys = new Set(evidenceUrls.map((url) => getHostKey(url)).filter((value): value is string => Boolean(value)));
    if (evidenceDomainKeys.size === 0) {
      return true;
    }

    return [...evidenceDomainKeys].some((domainKey) => !suspiciousDomainKeys.has(domainKey));
  });

  return {
    changed: canonicalTargets.length !== input.canonicalTargets.length || supportedUnifiedFindings.length !== input.supportedUnifiedFindings.length,
    canonicalTargets,
    supportedUnifiedFindings
  };
}

function isSuspiciousRelatedPartyLegalDiscoveryCandidate(
  candidate: DiscoveryCandidateRecord | null,
  canonicalTargetDomainCounts: Map<string, number>
) {
  if (!candidate || candidate.hostRelation !== "related_party") {
    return false;
  }

  const dominantCount = Math.max(0, ...canonicalTargetDomainCounts.values());
  if (dominantCount < 2) {
    return false;
  }

  const domainKey = getHostKey(candidate.candidateUrl);
  if (!domainKey) {
    return false;
  }

  return (canonicalTargetDomainCounts.get(domainKey) ?? 0) <= 1;
}

function getPolicyRowForTarget(
  policyEnrichment: Array<Record<string, unknown>>,
  target: FamilyPacketTargetRecord
) {
  const canonicalUrl = typeof target.canonicalUrl === "string" ? target.canonicalUrl : null;
  if (!canonicalUrl) {
    return null;
  }

  return (
    policyEnrichment.find((row) => {
      const pageUrl = typeof (row.pageUrl ?? row.page_url) === "string" ? String(row.pageUrl ?? row.page_url) : null;
      return pageUrl === canonicalUrl;
    }) ?? null
  );
}

function isWeakPrivacyHubTarget(
  target: FamilyPacketTargetRecord,
  policyEnrichment: Array<Record<string, unknown>>
) {
  const surfaceTypes = getStringArray(target.supportedSurfaceTypes);
  if (!surfaceTypes.includes("privacy_policy")) {
    return false;
  }

  const canonicalUrl = typeof target.canonicalUrl === "string" ? target.canonicalUrl.toLowerCase() : "";
  const text = [typeof target.title === "string" ? target.title : null, typeof target.snippet === "string" ? target.snippet : null]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase();
  const looksLikeHub =
    /\/hc\/sections?\//.test(canonicalUrl) ||
    /\/sections?\//.test(canonicalUrl) ||
    ((/terms and policies|help centre|help center|policy center|policy centre|section/i.test(text) &&
      !/privacy policy|privacy notice|data privacy/i.test(text)));

  if (!looksLikeHub) {
    return false;
  }

  const policyRow = getPolicyRowForTarget(policyEnrichment, target);
  if (!policyRow) {
    return false;
  }

  const structurallyWeak = policyRow.policy_structurally_weak === true;
  const actionableFlags = getStringArray(policyRow.policy_actionable_flags);
  return structurallyWeak || actionableFlags.includes("policy_fetch_insufficient_content");
}

function getPolicyEvidenceSnippets(row: Record<string, unknown>) {
  return row.policyEvidenceSnippets && typeof row.policyEvidenceSnippets === "object"
    ? (row.policyEvidenceSnippets as Record<string, unknown>)
    : row.policy_evidence_snippets && typeof row.policy_evidence_snippets === "object"
      ? (row.policy_evidence_snippets as Record<string, unknown>)
      : null;
}

function getPolicyPageUrl(row: Record<string, unknown>) {
  return typeof (row.pageUrl ?? row.page_url) === "string" ? String(row.pageUrl ?? row.page_url) : null;
}

function getPolicySummaryShort(row: Record<string, unknown>) {
  const value =
    typeof row.policySummaryShort === "string"
      ? row.policySummaryShort
      : typeof row.policy_summary_short === "string"
        ? row.policy_summary_short
        : null;

  return isMeaningfulPolicyText(value) ? value : null;
}

function isMachineReadablePolicyEndpoint(value: string | null) {
  if (!value) {
    return false;
  }

  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();

    return (
      host === "privacyportal.onetrust.com" ||
      path.includes("/request/v1/enterprisepolicy/") ||
      path.includes("/digitalpolicy/content") ||
      path.includes("/api/")
    );
  } catch {
    return /privacyportal\.onetrust\.com|\/request\/v1\/enterprisepolicy\/|\/digitalpolicy\/content|\/api\//i.test(value);
  }
}

function isWeakRootLikeUrl(value: string | null) {
  if (!value) {
    return false;
  }

  try {
    const parsed = new URL(value);
    const pathname = parsed.pathname.trim();
    return pathname === "" || pathname === "/";
  } catch {
    return /\/?#?$/.test(value);
  }
}

function hasCookieLikeEvidenceText(value: string | null | undefined) {
  if (!isMeaningfulPolicyText(value)) {
    return false;
  }

  return /cookie|tracking technolog|analytical cookies|marketing cookies|privacy choices|your privacy choices|gpc|global privacy control|opt-out preference/i.test(
    value
  );
}

function getCookieSnippetCandidates(row: Record<string, unknown>) {
  const snippets = getPolicyEvidenceSnippets(row);
  const summary = getPolicySummaryShort(row);
  const values = uniqueStrings([
    typeof snippets?.cookie_notice === "string" ? snippets.cookie_notice : null,
    typeof snippets?.cookie_table === "string" ? snippets.cookie_table : null,
    typeof snippets?.cookies === "string" ? snippets.cookies : null,
    typeof snippets?.tracking_technologies === "string" ? snippets.tracking_technologies : null,
    typeof snippets?.privacy_choices === "string" ? snippets.privacy_choices : null,
    typeof snippets?.do_not_sell === "string" ? snippets.do_not_sell : null,
    summary
  ]);

  return values
    .map((value) => normalizePolicySnippet(value))
    .filter((value): value is string => Boolean(value) && hasCookieLikeEvidenceText(value));
}

function getFindingPolicySnippetCandidate(row: Record<string, unknown>, findingId: string) {
  const snippets = getPolicyEvidenceSnippets(row);
  const wantedKeys = FINDING_POLICY_EVIDENCE_KEYS[findingId] ?? [];
  const direct = uniqueStrings(
    wantedKeys.flatMap((key) => (isMeaningfulPolicyText(snippets?.[key]) ? [String(snippets?.[key])] : []))
  )
    .map((value) => normalizePolicySnippet(value))
    .filter((value): value is string => Boolean(value));

  if (direct.length > 0) {
    return direct[0];
  }

  const summary = getPolicySummaryShort(row);
  return summary ? normalizePolicySnippet(summary) : null;
}

function getPolicySurfaceRepairEvidence(
  policyEnrichment: Array<Record<string, unknown>>,
  pageType: string,
  label: string
) {
  const scoredRows = policyEnrichment
    .map((row) => {
      const rowPageType = String(row.pageType ?? row.page_type ?? "");
      const pageUrl = getPolicyPageUrl(row);
      const summary = getPolicySummaryShort(row);
      const actionableFlags = getStringArray(row.policy_actionable_flags);
      const structurallyWeak = row.policy_structurally_weak === true;
      if (
        rowPageType !== pageType ||
        !pageUrl ||
        isMachineReadablePolicyEndpoint(pageUrl) ||
        isWeakRootLikeUrl(pageUrl) ||
        structurallyWeak ||
        actionableFlags.includes("policy_fetch_insufficient_content")
      ) {
        return null;
      }

      let score = 0;
      if (summary) {
        score += 3;
      }
      if (/privacy|policy|notice|gdpr|ochrana|privacidad|datenschutz|confidential/i.test(pageUrl)) {
        score += 2;
      }

      return {
        pageUrl,
        score,
        snippet: summary ?? `Verified policy-enrichment evidence for ${label}.`,
        title: label
      };
    })
    .filter(
      (entry): entry is { pageUrl: string; score: number; snippet: string; title: string } =>
        Boolean(entry?.pageUrl) && Boolean(entry?.snippet)
    )
    .sort((left, right) => right.score - left.score);

  return scoredRows[0] ?? null;
}

function rowMatchesFindingPage(row: Record<string, unknown>, evidenceUrls: string[]) {
  const pageUrl = getPolicyPageUrl(row);
  return Boolean(pageUrl && evidenceUrls.includes(pageUrl));
}

function getCookieRepairEvidence(policyEnrichment: Array<Record<string, unknown>>) {
  const scoredRows = policyEnrichment
    .map((row) => {
      const pageType = String(row.pageType ?? row.page_type ?? "");
      const pageUrl = getPolicyPageUrl(row);
      const snippets = getCookieSnippetCandidates(row);
      const summary = getPolicySummaryShort(row);
      const combinedText = [...snippets, ...(summary ? [summary] : [])];

      if (!pageUrl || isMachineReadablePolicyEndpoint(pageUrl) || isWeakRootLikeUrl(pageUrl) || combinedText.length === 0) {
        return null;
      }

      let score = 0;
      if (pageType === "privacy_policy") {
        score += 5;
      }
      if (pageType === "cookie_policy") {
        score += 4;
      }
      if (combinedText.some((entry) => /your privacy choices|privacy choices/i.test(entry))) {
        score += 2;
      }
      if (combinedText.some((entry) => /gpc|global privacy control|opt-out preference/i.test(entry))) {
        score += 2;
      }
      if (combinedText.some((entry) => /analytical cookies|marketing cookies|tracking technolog/i.test(entry))) {
        score += 2;
      }
      if (pageUrl && /\/legal\/privacy\/us-residents\/?$/i.test(pageUrl)) {
        score += 3;
      } else if (pageUrl && /us-residents|privacy-notice/i.test(pageUrl)) {
        score += 2;
      }

      return {
        pageType,
        pageUrl,
        score,
        snippet: snippets[0] ?? normalizePolicySnippet(summary ?? "") ?? null
      };
    })
    .filter(
      (entry): entry is { pageType: string; pageUrl: string; score: number; snippet: string | null } =>
        Boolean(entry?.pageUrl) && Boolean(entry?.snippet)
    )
    .sort((left, right) => right.score - left.score);

  const best = scoredRows[0];
  if (!best || !best.snippet) {
    return null;
  }

  return {
    pageUrl: best.pageUrl,
    snippet: best.snippet,
    title: best.pageType === "privacy_policy" ? "Privacy Notice" : "Cookie Policy"
  };
}

function targetHasStrongCookieEvidence(target: FamilyPacketTargetRecord) {
  const text = [
    typeof target.title === "string" ? target.title : null,
    typeof target.snippet === "string" ? target.snippet : null
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ");

  return hasCookieLikeEvidenceText(text);
}

function findingHasStrongCookieEvidence(finding: FamilyPacketFindingRecord) {
  const payload =
    finding.evidencePayload && typeof finding.evidencePayload === "object"
      ? (finding.evidencePayload as Record<string, unknown>)
      : {};

  return getStringArray(payload.policySnippets).some((snippet) => hasCookieLikeEvidenceText(snippet));
}

function extractDiscoveryCandidates(events: ScanEventRecordLike[]) {
  const candidates: DiscoveryCandidateRecord[] = [];

  for (const event of events) {
    if (event.eventType !== "runtime.build_phase_diagnostic" || !event.metadataJson || typeof event.metadataJson !== "object") {
      continue;
    }

    const metadata = event.metadataJson as Record<string, unknown>;
    if (metadata.phase !== "page_discovery_fetch") {
      continue;
    }

    const discoveryDebug =
      metadata.discoveryDebug && typeof metadata.discoveryDebug === "object"
        ? (metadata.discoveryDebug as Record<string, unknown>)
        : null;
    const topCandidates = getRecordArray(discoveryDebug?.topDiscoveryCandidates);

    for (const candidate of topCandidates) {
      const candidateUrl = typeof candidate.candidateUrl === "string" ? candidate.candidateUrl : null;
      const pageType = typeof candidate.pageType === "string" ? candidate.pageType : null;
      if (!candidateUrl || !pageType) {
        continue;
      }

      candidates.push({
        candidateScore:
          typeof candidate.candidateScore === "number"
            ? candidate.candidateScore
            : Number(candidate.candidateScore ?? 0),
        candidateUrl,
        discoveredFrom: typeof candidate.discoveredFrom === "string" ? candidate.discoveredFrom : "",
        hostRelation: typeof candidate.hostRelation === "string" ? candidate.hostRelation : "",
        pageType,
        sourceUrl: typeof candidate.sourceUrl === "string" ? candidate.sourceUrl : null
      });
    }
  }

  return candidates;
}

function extractVerifiedSurfaceRecoveryResults(events: ScanEventRecordLike[]) {
  const results: VerifiedSurfaceRecoveryRecord[] = [];

  for (const event of events) {
    if (event.eventType !== "runtime.build_phase_diagnostic" || !event.metadataJson || typeof event.metadataJson !== "object") {
      continue;
    }

    const metadata = event.metadataJson as Record<string, unknown>;
    if (metadata.phase !== "surface_recovery_side_merge") {
      continue;
    }

    const verificationResults = getRecordArray(metadata.verificationResults);
    for (const record of verificationResults) {
      const surfaceType = typeof record.surfaceType === "string" ? record.surfaceType : null;
      const verifiedUrl = typeof record.verifiedUrl === "string" ? record.verifiedUrl : null;
      const requestedUrl = typeof record.requestedUrl === "string" ? record.requestedUrl : null;
      const title = typeof record.title === "string" ? record.title : null;
      const snippet = typeof record.snippet === "string" ? record.snippet : null;
      const candidateUrl = verifiedUrl ?? requestedUrl;
      if (!surfaceType || !candidateUrl) {
        continue;
      }

      const candidateTarget = {
        canonicalUrl: candidateUrl,
        snippet,
        title
      } satisfies FamilyPacketTargetRecord;
      const surfaceText = `${title ?? ""} ${snippet ?? ""}`.toLowerCase();
      const failureReason = typeof record.failureReason === "string" ? record.failureReason : null;
      const hasAcceptedVerifiedFallback =
        record.urlVerified === true &&
        failureReason === "url_disallowed_for_surface" &&
        (() => {
          if (surfaceType === "contact_support") {
            return (
              CONTACT_PATH_PATTERN.test(getUrlPath(candidateUrl)) &&
              /contact us|contact|phone numbers|support|help/i.test(surfaceText) &&
              !isLikelyChromeOnlySupportTarget(candidateTarget, "contact_support_path_present")
            );
          }

          if (surfaceType === "accessibility_support") {
            return (
              ACCESSIBILITY_PATH_PATTERN.test(getUrlPath(candidateUrl)) &&
              /accessibility|screen reader|assistive|accommodation|caption|audio description/i.test(surfaceText) &&
              !isLikelyChromeOnlySupportTarget(candidateTarget, "accessibility_support_path_present")
            );
          }

          if (surfaceType === "terms_of_service") {
            return (
              TERMS_PATH_PATTERN.test(getUrlPath(candidateUrl)) &&
              /terms|agreement|conditions|legal/i.test(surfaceText)
            );
          }

          return false;
        })();

      if (record.verified !== true && !hasAcceptedVerifiedFallback) {
        continue;
      }

      results.push({
        snippet,
        surfaceType,
        title,
        url: candidateUrl
      });
    }
  }

  return results;
}

function getUrlPath(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  try {
    return new URL(value).pathname.toLowerCase();
  } catch {
    return value.toLowerCase();
  }
}

function getUrlPathWithFragment(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  try {
    const parsed = new URL(value);
    return `${parsed.pathname.toLowerCase()}${parsed.hash.toLowerCase()}`;
  } catch {
    return value.toLowerCase();
  }
}

function isStrongRenderedDiscoveryCandidate(candidate: DiscoveryCandidateRecord, pageType: string) {
  if (candidate.pageType !== pageType) {
    return false;
  }

  const path = getUrlPath(candidate.candidateUrl);
  const pathWithFragment = getUrlPathWithFragment(candidate.candidateUrl);
  if (pageType === "privacy_policy") {
    if (!["same_host", "same_brand_subdomain", "related_party"].includes(candidate.hostRelation)) {
      return false;
    }
    const isStrongDiscoverySource = ["rendered_link", "html_link"].includes(candidate.discoveredFrom);
    const isStrongFooterLegalLink = candidate.discoveredFrom === "footer_link" && candidate.hostRelation === "same_host";
    const isStrongRelatedPartyLegalLink =
      candidate.hostRelation === "related_party" && ["rendered_link", "html_link", "footer_link", "legal_hub"].includes(candidate.discoveredFrom);
    return (
      (isStrongDiscoverySource || isStrongFooterLegalLink || isStrongRelatedPartyLegalLink) &&
      candidate.candidateScore >= (candidate.hostRelation === "related_party" ? 80 : 40) &&
      (PRIVACY_PATH_PATTERN.test(pathWithFragment) || (/\/terms(?:\/|$)/.test(path) && /#privacy(?:[_-])?policy/i.test(candidate.candidateUrl)))
    );
  }

  if (pageType === "terms_of_service") {
    if (!["same_host", "same_brand_subdomain", "related_party"].includes(candidate.hostRelation)) {
      return false;
    }
    const isStrongDiscoverySource = ["rendered_link", "html_link"].includes(candidate.discoveredFrom);
    const isStrongFooterLegalLink = candidate.discoveredFrom === "footer_link" && candidate.hostRelation === "same_host";
    const isStrongRelatedPartyLegalLink =
      candidate.hostRelation === "related_party" && ["rendered_link", "html_link", "footer_link", "legal_hub"].includes(candidate.discoveredFrom);
    return (
      (isStrongDiscoverySource || isStrongFooterLegalLink || isStrongRelatedPartyLegalLink) &&
      candidate.candidateScore >= (candidate.hostRelation === "related_party" ? 80 : 40) &&
      TERMS_PATH_PATTERN.test(path)
    );
  }

  if (!["same_host", "same_brand_subdomain"].includes(candidate.hostRelation)) {
    return false;
  }

  if (pageType === "accessibility_statement") {
    const isStrongDiscoverySource = ["rendered_link", "html_link"].includes(candidate.discoveredFrom);
    const isStrongFooterAccessibilityLink = candidate.discoveredFrom === "footer_link" && candidate.hostRelation === "same_host";
    return (
      (isStrongDiscoverySource || isStrongFooterAccessibilityLink) &&
      candidate.candidateScore >= 80 &&
      ACCESSIBILITY_PATH_PATTERN.test(path)
    );
  }

  if (pageType === "contact") {
    const isStrongDiscoverySource = ["rendered_link", "html_link"].includes(candidate.discoveredFrom);
    const isStrongFooterContactLink = candidate.discoveredFrom === "footer_link" && candidate.hostRelation === "same_host";
    return (
      (isStrongDiscoverySource || isStrongFooterContactLink) &&
      candidate.candidateScore >= 70 &&
      CONTACT_PATH_PATTERN.test(path)
    );
  }

  if (!["rendered_link", "html_link"].includes(candidate.discoveredFrom)) {
    return false;
  }

  return false;
}

function getDiscoveryCandidatePriorityBonus(candidate: DiscoveryCandidateRecord, pageType: string) {
  const path = getUrlPath(candidate.candidateUrl);
  const pathWithFragment = getUrlPathWithFragment(candidate.candidateUrl);
  let bonus = 0;

  if (pageType === "privacy_policy") {
    if (/\/privacy-policy(?:\/|$)|\/policy\/privacy(?:\/|$)/.test(path)) {
      bonus += 35;
    } else if (/\/privacy(?:\/|$)|\/privacy(?:\.html)?(?:\/|$)/.test(path)) {
      bonus += 25;
    } else if (/\/terms(?:\/|$).*#privacy(?:[_-])?policy/.test(pathWithFragment)) {
      bonus += 20;
    }
  }

  if (pageType === "terms_of_service") {
    if (/\/lp\/legal\/.*terms-of-sale(?:\/|$)/.test(path) || /\/legal\/.*terms-of-sale(?:\/|$)/.test(path)) {
      bonus += 40;
    } else if (/\/terms-of-service(?:\/|$)|\/terms-of-use(?:\/|$)|\/termsofuse(?:\/|$)|\/termsandconditions?(?:\/|$)|\/account-terms(?:\/|$)|\/terms(?:[-_])?of(?:[-_])?(?:service|use)(?:\.html)?(?:\/|$)|\/termsofuse(?:\.html)?(?:\/|$)|\/terms(?:[-_])?and(?:[-_])?conditions?(?:\.html)?(?:\/|$)|\/policy\/legal(?:\/|$)|\/info\/terms(?:ofuse)?\.html(?:\/|$)/.test(path)) {
      bonus += 30;
    } else if (/\/t\/terms(?:\/|$)|\/terms(?:\/|$)/.test(path)) {
      bonus += 25;
    }
  }

  if (pageType === "accessibility_statement") {
    if (/\/lp\/accessibility(?:\/|$)|\/accessibility(?:\/|$)|\/accessibility-statement(?:\/|$)|\/accessibility(?:\.html)?(?:\/|$)/.test(path)) {
      bonus += 35;
    }
  }

  if (pageType === "contact") {
    if (/\/lp\/contact-us(?:\/|$)|\/contact-us(?:\/|$)/.test(path)) {
      bonus += 45;
    } else if (/\/info\/contact(?:[-_])?us?\.html(?:\/|$)|\/contact(?:[-_])?us(?:\.html)?(?:\/|$)/.test(path)) {
      bonus += 35;
    } else if (/\/contact(?:\/|$)/.test(path)) {
      bonus += 25;
    } else if (/\/support\/contents\/.*contact/i.test(path)) {
      bonus += 15;
    }

    if (/\?/.test(candidate.candidateUrl) || /\/incidents-online\//.test(path) || /\/dynamic(?:\/|$)/.test(path)) {
      bonus -= 60;
    }
    if (/\/support\/home(?:\/|$)/.test(path)) {
      bonus -= 25;
    }
  }

  return bonus;
}

function getBestDiscoveryCandidate(candidates: DiscoveryCandidateRecord[], pageType: string) {
  return candidates
    .filter((candidate) => isStrongRenderedDiscoveryCandidate(candidate, pageType))
    .sort((left, right) => {
      const weightedDelta =
        right.candidateScore + getDiscoveryCandidatePriorityBonus(right, pageType) -
        (left.candidateScore + getDiscoveryCandidatePriorityBonus(left, pageType));
      if (weightedDelta !== 0) {
        return weightedDelta;
      }

      return right.candidateScore - left.candidateScore;
    })[0] ?? null;
}

function isLikelyChromeOnlySupportTarget(target: FamilyPacketTargetRecord, findingId: string) {
  const title = typeof target.title === "string" ? target.title.trim() : "";
  const snippet = typeof target.snippet === "string" ? target.snippet.trim() : "";
  const path = getUrlPath(typeof target.canonicalUrl === "string" ? target.canonicalUrl : null);
  const text = `${title} ${snippet}`.toLowerCase();
  const hasChromeOnlyBoilerplate =
    /about press copyright contact us creators advertise developers terms privacy policy/i.test(text) ||
    /home shorts subscriptions/i.test(text);

  if (findingId === "contact_support_path_present") {
    const genericPath = /^\/contact(?:\/)?$/.test(path);
    const weakTitle = /^contact\s*-\s*[^|]+$/i.test(title);
    const hasStrongSupportLanguage =
      /help center|support (team|center)|customer support|submit a request|feedback form|reach us by|contact us (?:for|about|with)|questions\??\s+contact us/i.test(
        text
      );
    const looksLikeProfileRedirect =
      /^\/(?:user|users|profile|profiles)\/[a-z0-9._%+-]+(?:\/)?$/i.test(path) &&
      (/^.+\(@[^)]+\)\s*-\s*[^|]+$/i.test(title) || /\bfollow\b|\bmessage\b|\breading list\b/i.test(text)) &&
      !hasStrongSupportLanguage;
    const looksLikeTopicArticleFromContactSlug =
      /^\/contact-[a-z0-9-]+(?:\/)?$/.test(path) &&
      !/contact|support|help|feedback|get in touch|reach us|email us/i.test(title) &&
      !hasStrongSupportLanguage;
    const looksLikeCommercialOfferPage =
      /\/pricing(?:\/|$)|\/plans?(?:\/|$)|\/packages?(?:\/|$)|\/services?(?:\/|$)|\/products?(?:\/|$)|\/shop(?:\/|$)|\/buy(?:\/|$)/.test(
        path
      ) &&
      /\b(pricing|plans?|packages?|services?|products?|shop|buy now|get started|request a quote)\b/i.test(text) &&
      !/contact|support|help|feedback|get in touch|reach us|email us/i.test(title);

    return (
      (genericPath && weakTitle && hasChromeOnlyBoilerplate && !hasStrongSupportLanguage) ||
      looksLikeProfileRedirect ||
      looksLikeTopicArticleFromContactSlug ||
      (looksLikeCommercialOfferPage && !hasStrongSupportLanguage)
    );
  }

  if (findingId === "accessibility_support_path_present") {
    const genericPath = /^\/accessibility(?:\/)?$/.test(path);
    const weakTitle = /^accessibility\s*-\s*[^|]+$/i.test(title);
    const hasStrongAccessibilityLanguage =
      /caption|audio description|screen reader|assistive|accommodation|accessibility support|accessibility help/i.test(text);
    const hasStrongAccessibilityPathSignals =
      /\/accessibility(?:\/|$)|\/accessibility-statement(?:\/|$)|\/support(?:\/|$)|\/help(?:\/|$)|caption|audio description|screen reader|assistive|accommodation|accessibility support|accessibility help/i.test(
        `${path} ${text}`
      );
    const looksLikeProfileRedirect =
      /^\/(?:user|users|profile|profiles)\/[a-z0-9._%+-]+(?:\/)?$/i.test(path) &&
      (/^.+\(@[^)]+\)\s*-\s*[^|]+$/i.test(title) || /\bfollow\b|\bmessage\b|\breading list\b/i.test(text)) &&
      !hasStrongAccessibilityLanguage;
    const looksLikeTopicArticleFromAccessibilitySlug =
      /^\/accessibility-[a-z0-9-]+(?:\/)?$/.test(path) &&
      !hasStrongAccessibilityLanguage &&
      !/support|help|screen reader|assistive|accommodation|caption|audio description/i.test(title);
    const looksLikeEditorialInitiative =
      /\/belonging(?:\/|$)|\/disability-innovation(?:\/|$)|\/stories(?:\/|$)|\/blog(?:\/|$)|\/news(?:\/|$)|\/about(?:\/|$)/.test(path) &&
      /innovation|belonging|co-creating|explore accessibility in our products|disability innovation/i.test(text);

    return (
      (genericPath && weakTitle && hasChromeOnlyBoilerplate && !hasStrongAccessibilityLanguage) ||
      looksLikeProfileRedirect ||
      looksLikeTopicArticleFromAccessibilitySlug ||
      (looksLikeEditorialInitiative && !hasStrongAccessibilityPathSignals)
    );
  }

  return false;
}

function buildDiscoveryRepairTarget(input: {
  candidate: DiscoveryCandidateRecord;
  label: string;
  surfaceType: string;
}) {
  return {
    canonicalUrl: input.candidate.candidateUrl,
    fetchQuality: "discovery_retained",
    snippet: `Homepage rendered link candidate for ${input.label}.`,
    supportedSurfaceTypes: [input.surfaceType],
    supportingRefs: [
      {
        refType: "discovery_candidate",
        text: `Homepage rendered link candidate for ${input.label}.`,
        url: input.candidate.candidateUrl,
        verified: false
      }
    ],
    title: input.label
  } satisfies FamilyPacketTargetRecord;
}

function buildDiscoveryRepairFinding(input: {
  findingId: string;
  reason: string;
  sourceSurfaceType: string;
  url: string;
}) {
  return {
    evidencePayload: {
      fetchQuality: "discovery_retained",
      pageUrls: [input.url],
      policySnippets: [input.reason],
      sourceUrls: [input.url]
    },
    evidenceUrls: [input.url],
    findingId: input.findingId,
    reason: input.reason,
    sourceSurfaceTypes: [input.sourceSurfaceType]
  } satisfies FamilyPacketFindingRecord;
}

function buildVerifiedSurfaceRecoveryTarget(input: {
  label: string;
  snippet?: string | null;
  surfaceType: string;
  title?: string | null;
  url: string;
}) {
  const title = input.title?.trim() || input.label;
  const snippet = input.snippet?.trim() || `Verified surface-recovery evidence for ${input.label}.`;

  return {
    canonicalUrl: input.url,
    fetchQuality: "verified_content",
    snippet,
    supportedSurfaceTypes: [input.surfaceType],
    supportingRefs: [
      {
        refType: "surface_recovery_verified",
        text: snippet,
        title,
        url: input.url,
        verified: true
      }
    ],
    title
  } satisfies FamilyPacketTargetRecord;
}

function buildVerifiedSurfaceRecoveryFinding(input: {
  findingId: string;
  reason: string;
  snippet?: string | null;
  sourceSurfaceType: string;
  url: string;
}) {
  const snippet = input.snippet?.trim() || input.reason;
  return {
    evidencePayload: {
      fetchQuality: "verified_content",
      pageUrls: [input.url],
      policySnippets: [snippet],
      sourceUrls: [input.url]
    },
    evidenceUrls: [input.url],
    findingId: input.findingId,
    reason: input.reason,
    sourceSurfaceTypes: [input.sourceSurfaceType]
  } satisfies FamilyPacketFindingRecord;
}

export function repairFindingFamilyPacketEvents<TEvent extends ScanEventRecordLike>(input: {
  events: TEvent[];
  policyEnrichment: Array<Record<string, unknown>>;
}): TEvent[] {
  const discoveryCandidates = extractDiscoveryCandidates(input.events);
  const canonicalTargetDomainCounts = getCanonicalTargetDomainCounts(input.events);
  const verifiedSurfaceRecoveryResults = extractVerifiedSurfaceRecoveryResults(input.events);
  const cookieRepair = getCookieRepairEvidence(input.policyEnrichment);
  const privacySurfaceRepair = getPolicySurfaceRepairEvidence(input.policyEnrichment, "privacy_policy", "Privacy Notice");
  const hasFindingSpecificPolicyRepairs = input.policyEnrichment.some((row) =>
    Object.keys(FINDING_POLICY_EVIDENCE_KEYS).some((findingId) => Boolean(getFindingPolicySnippetCandidate(row, findingId)))
  );
  const hasDiscoveryRepairs =
    Boolean(privacySurfaceRepair) ||
    Boolean(getBestDiscoveryCandidate(discoveryCandidates, "privacy_policy")) ||
    Boolean(getBestDiscoveryCandidate(discoveryCandidates, "terms_of_service")) ||
    Boolean(getBestDiscoveryCandidate(discoveryCandidates, "contact")) ||
    Boolean(getBestDiscoveryCandidate(discoveryCandidates, "accessibility_statement")) ||
    verifiedSurfaceRecoveryResults.some((result) =>
      ["contact_support", "accessibility_support", "terms_of_service"].includes(result.surfaceType)
    );
  const hasSupportPacketFilterCandidates = input.events.some((event) => {
    if (event.eventType !== "runtime.build_phase_diagnostic" || !event.metadataJson || typeof event.metadataJson !== "object") {
      return false;
    }

    const metadata = event.metadataJson as Record<string, unknown>;
    if (metadata.phase !== "finding_family_packets" || !Array.isArray(metadata.packets)) {
      return false;
    }

    return metadata.packets.some((packet) => {
      if (!packet || typeof packet !== "object") {
        return false;
      }

      const packetRecord = packet as Record<string, unknown>;
      if (packetRecord.familyId !== "support_access" || !Array.isArray(packetRecord.canonicalTargets)) {
        return false;
      }

      return (packetRecord.canonicalTargets as FamilyPacketTargetRecord[]).some((target) => {
        const surfaceTypes = getStringArray(target.supportedSurfaceTypes);
        return (
          (surfaceTypes.includes("contact_support") && isLikelyChromeOnlySupportTarget(target, "contact_support_path_present")) ||
          (surfaceTypes.includes("accessibility_support") &&
            isLikelyChromeOnlySupportTarget(target, "accessibility_support_path_present"))
        );
      });
    });
  });

  const hasPrivacyChoicesRepairCandidates = input.events.some((event) => {
    if (event.eventType !== "runtime.build_phase_diagnostic" || !event.metadataJson || typeof event.metadataJson !== "object") {
      return false;
    }

    const metadata = event.metadataJson as Record<string, unknown>;
    if (metadata.phase !== "finding_family_packets" || !Array.isArray(metadata.packets)) {
      return false;
    }

    return metadata.packets.some((packet) => {
      if (!packet || typeof packet !== "object") {
        return false;
      }

      const packetRecord = packet as Record<string, unknown>;
      if (packetRecord.familyId !== "privacy_controls") {
        return false;
      }

      const canonicalTargets = Array.isArray(packetRecord.canonicalTargets)
        ? (packetRecord.canonicalTargets as FamilyPacketTargetRecord[])
        : [];
      const supportedUnifiedFindings = Array.isArray(packetRecord.supportedUnifiedFindings)
        ? (packetRecord.supportedUnifiedFindings as FamilyPacketFindingRecord[])
        : [];

      const hasPrivacyChoicesTarget = canonicalTargets.some((target) =>
        getStringArray(target.supportedSurfaceTypes).includes("privacy_choices")
      );
      const hasTargetedAdvertisingChoicesFinding = supportedUnifiedFindings.some(
        (finding) => finding.findingId === "targeted_advertising_choices_present"
      );

      return hasPrivacyChoicesTarget && !hasTargetedAdvertisingChoicesFinding;
    });
  });

  if (
    !cookieRepair &&
    !hasFindingSpecificPolicyRepairs &&
    !hasDiscoveryRepairs &&
    !hasSupportPacketFilterCandidates &&
    !hasPrivacyChoicesRepairCandidates
  ) {
    return input.events;
  }

  const repairedEvents = input.events.map((event) => {
    if (event.eventType !== "runtime.build_phase_diagnostic" || !event.metadataJson || typeof event.metadataJson !== "object") {
      return event;
    }

    const metadata = event.metadataJson as Record<string, unknown>;
    if (metadata.phase !== "finding_family_packets" || !Array.isArray(metadata.packets)) {
      return event;
    }

    let packetsChanged = false;
    const packets = metadata.packets.map((packet) => {
      if (!packet || typeof packet !== "object") {
        return packet;
      }

      const packetRecord = packet as Record<string, unknown>;
      if (packetRecord.familyId !== "privacy_controls" && packetRecord.familyId !== "support_access" && packetRecord.familyId !== "legal_core") {
        return packet;
      }

      const canonicalTargets = Array.isArray(packetRecord.canonicalTargets)
        ? (packetRecord.canonicalTargets as FamilyPacketTargetRecord[])
        : [];
      const supportedUnifiedFindings = Array.isArray(packetRecord.supportedUnifiedFindings)
        ? (packetRecord.supportedUnifiedFindings as FamilyPacketFindingRecord[])
        : [];
      const cookieFinding = supportedUnifiedFindings.find((finding) => finding.findingId === "cookie_policy_present");

      if (packetRecord.familyId === "support_access") {
        const repairedTargets = canonicalTargets.filter((target) => {
          const surfaceTypes = getStringArray(target.supportedSurfaceTypes);
          if (surfaceTypes.includes("contact_support") && isLikelyChromeOnlySupportTarget(target, "contact_support_path_present")) {
            packetsChanged = true;
            return false;
          }
          if (surfaceTypes.includes("accessibility_support") && isLikelyChromeOnlySupportTarget(target, "accessibility_support_path_present")) {
            packetsChanged = true;
            return false;
          }
          return true;
        });

        const repairedFindings = supportedUnifiedFindings.filter((finding) => {
          const surfaceTypes = getStringArray(finding.sourceSurfaceTypes);
          if (
            finding.findingId === "contact_support_path_present" &&
            !repairedTargets.some((target) => getStringArray(target.supportedSurfaceTypes).some((surfaceType) => surfaceTypes.includes(surfaceType)))
          ) {
            packetsChanged = true;
            return false;
          }
          if (
            finding.findingId === "accessibility_support_path_present" &&
            !repairedTargets.some((target) => getStringArray(target.supportedSurfaceTypes).some((surfaceType) => surfaceTypes.includes(surfaceType)))
          ) {
            packetsChanged = true;
            return false;
          }
          return true;
        });

        const contactCandidate = getBestDiscoveryCandidate(discoveryCandidates, "contact");
        const verifiedContactSupport =
          verifiedSurfaceRecoveryResults.find((result) => result.surfaceType === "contact_support") ?? null;
        const hasStrongContactTarget = repairedTargets.some((target) => getStringArray(target.supportedSurfaceTypes).includes("contact_support"));
        if (verifiedContactSupport && !hasStrongContactTarget) {
          repairedTargets.push(
            buildVerifiedSurfaceRecoveryTarget({
              label: "Contact Us",
              snippet: verifiedContactSupport.snippet,
              surfaceType: "contact_support",
              title: verifiedContactSupport.title,
              url: verifiedContactSupport.url
            })
          );
          repairedFindings.push(
            buildVerifiedSurfaceRecoveryFinding({
              findingId: "contact_support_path_present",
              reason: "Verified support-access evidence includes help, contact, or feedback language.",
              snippet: verifiedContactSupport.snippet,
              sourceSurfaceType: "contact_support",
              url: verifiedContactSupport.url
            })
          );
          packetsChanged = true;
        } else if (contactCandidate && !hasStrongContactTarget) {
          repairedTargets.push(
            buildDiscoveryRepairTarget({
              candidate: contactCandidate,
              label: "Contact Us",
              surfaceType: "contact_support"
            })
          );
          repairedFindings.push(
            buildDiscoveryRepairFinding({
              findingId: "contact_support_path_present",
              reason: "Homepage discovery retained a strong same-brand contact/help path.",
              sourceSurfaceType: "contact_support",
              url: contactCandidate.candidateUrl
            })
          );
          packetsChanged = true;
        }

        const accessibilityCandidate = getBestDiscoveryCandidate(discoveryCandidates, "accessibility_statement");
        const verifiedAccessibilitySupport =
          verifiedSurfaceRecoveryResults.find((result) => result.surfaceType === "accessibility_support") ?? null;
        const hasStrongAccessibilityTarget = repairedTargets.some((target) =>
          getStringArray(target.supportedSurfaceTypes).includes("accessibility_support")
        );
        if (verifiedAccessibilitySupport && !hasStrongAccessibilityTarget) {
          repairedTargets.push(
            buildVerifiedSurfaceRecoveryTarget({
              label: "Accessibility",
              snippet: verifiedAccessibilitySupport.snippet,
              surfaceType: "accessibility_support",
              title: verifiedAccessibilitySupport.title,
              url: verifiedAccessibilitySupport.url
            })
          );
          repairedFindings.push(
            buildVerifiedSurfaceRecoveryFinding({
              findingId: "accessibility_support_path_present",
              reason: "Verified support-access evidence includes accessibility, captioning, or accommodation language.",
              snippet: verifiedAccessibilitySupport.snippet,
              sourceSurfaceType: "accessibility_support",
              url: verifiedAccessibilitySupport.url
            })
          );
          packetsChanged = true;
        } else if (accessibilityCandidate && !hasStrongAccessibilityTarget) {
          repairedTargets.push(
            buildDiscoveryRepairTarget({
              candidate: accessibilityCandidate,
              label: "Accessibility",
              surfaceType: "accessibility_support"
            })
          );
          repairedFindings.push(
            buildDiscoveryRepairFinding({
              findingId: "accessibility_support_path_present",
              reason: "Homepage discovery retained a strong same-brand accessibility support path.",
              sourceSurfaceType: "accessibility_support",
              url: accessibilityCandidate.candidateUrl
            })
          );
          packetsChanged = true;
        }

        if (!packetsChanged) {
          return packet;
        }

        return {
          ...packetRecord,
          canonicalTargets: repairedTargets,
          supportedUnifiedFindings: repairedFindings
        };
      }

      if (packetRecord.familyId === "legal_core") {
        const legalOutlierSuppression = suppressOutlierLegalTargets({
          canonicalTargetDomainCounts,
          canonicalTargets,
          supportedUnifiedFindings
        });
        let repairedTargets = [...legalOutlierSuppression.canonicalTargets];
        let repairedFindings = [...legalOutlierSuppression.supportedUnifiedFindings];
        packetsChanged ||= legalOutlierSuppression.changed;

        const weakPrivacyHubTargets = repairedTargets.filter((target) => isWeakPrivacyHubTarget(target, input.policyEnrichment));
        if (weakPrivacyHubTargets.length > 0) {
          const weakPrivacyUrls = new Set(
            weakPrivacyHubTargets
              .map((target) => (typeof target.canonicalUrl === "string" ? target.canonicalUrl : null))
              .filter((value): value is string => Boolean(value))
          );
          repairedTargets = repairedTargets.filter((target) => {
            const canonicalUrl = typeof target.canonicalUrl === "string" ? target.canonicalUrl : null;
            return !canonicalUrl || !weakPrivacyUrls.has(canonicalUrl);
          });
          repairedFindings = repairedFindings.filter((finding) => {
            if (finding.findingId !== "privacy_policy_present") {
              return true;
            }

            const evidenceUrls = getStringArray(finding.evidenceUrls);
            return evidenceUrls.some((url) => !weakPrivacyUrls.has(url));
          });
          packetsChanged = true;
        }

        const hasPrivacyTarget = repairedTargets.some((target) => getStringArray(target.supportedSurfaceTypes).includes("privacy_policy"));
        const hasPrivacyFinding = repairedFindings.some((finding) => finding.findingId === "privacy_policy_present");
        const privacyDiscoveryCandidateRaw = getBestDiscoveryCandidate(discoveryCandidates, "privacy_policy");
        const privacyDiscoveryCandidate = isSuspiciousRelatedPartyLegalDiscoveryCandidate(
          privacyDiscoveryCandidateRaw,
          canonicalTargetDomainCounts
        )
          ? null
          : privacyDiscoveryCandidateRaw;
        if (privacySurfaceRepair && (!hasPrivacyTarget || !hasPrivacyFinding)) {
          if (!hasPrivacyTarget) {
            repairedTargets.push({
              canonicalUrl: privacySurfaceRepair.pageUrl,
              fetchQuality: "verified_content",
              snippet: privacySurfaceRepair.snippet,
              supportedSurfaceTypes: ["privacy_policy"],
              supportingRefs: [
                {
                  refType: "policy_enrichment_page",
                  text: privacySurfaceRepair.snippet,
                  title: privacySurfaceRepair.title,
                  url: privacySurfaceRepair.pageUrl,
                  verified: true
                }
              ],
              title: privacySurfaceRepair.title
            } satisfies FamilyPacketTargetRecord);
          }
          if (!hasPrivacyFinding) {
            repairedFindings.push({
              evidencePayload: {
                fetchQuality: "verified_content",
                pageUrls: [privacySurfaceRepair.pageUrl],
                policySnippets: [privacySurfaceRepair.snippet],
                sourceUrls: [privacySurfaceRepair.pageUrl]
              },
              evidenceUrls: [privacySurfaceRepair.pageUrl],
              findingId: "privacy_policy_present",
              reason: "Verified legal-core evidence includes a privacy policy or privacy notice surface.",
              sourceSurfaceTypes: ["privacy_policy"]
            } satisfies FamilyPacketFindingRecord);
          }
          packetsChanged = true;
        } else if (privacyDiscoveryCandidate && (!hasPrivacyTarget || !hasPrivacyFinding)) {
          if (!hasPrivacyTarget) {
            repairedTargets.push(
              buildDiscoveryRepairTarget({
                candidate: privacyDiscoveryCandidate,
                label: "Privacy Notice",
                surfaceType: "privacy_policy"
              })
            );
          }
          if (!hasPrivacyFinding) {
            repairedFindings.push(
              buildDiscoveryRepairFinding({
                findingId: "privacy_policy_present",
                reason: "Homepage discovery retained a strong same-brand privacy surface.",
                sourceSurfaceType: "privacy_policy",
                url: privacyDiscoveryCandidate.candidateUrl
              })
            );
          }
          packetsChanged = true;
        }
        const hasTermsTarget = repairedTargets.some((target) => getStringArray(target.supportedSurfaceTypes).includes("terms_of_service"));
        const hasTermsFinding = repairedFindings.some((finding) => finding.findingId === "terms_of_service_present");
        const termsCandidateRaw = getBestDiscoveryCandidate(discoveryCandidates, "terms_of_service");
        const termsCandidate = isSuspiciousRelatedPartyLegalDiscoveryCandidate(
          termsCandidateRaw,
          canonicalTargetDomainCounts
        )
          ? null
          : termsCandidateRaw;

        if (termsCandidate && (!hasTermsTarget || !hasTermsFinding)) {
          if (!hasTermsTarget) {
            repairedTargets.push(
              buildDiscoveryRepairTarget({
                candidate: termsCandidate,
                label: "Terms of Service",
                surfaceType: "terms_of_service"
              })
            );
          }
          if (!hasTermsFinding) {
            repairedFindings.push(
              buildDiscoveryRepairFinding({
                findingId: "terms_of_service_present",
                reason: "Homepage discovery retained a strong same-brand terms surface.",
                sourceSurfaceType: "terms_of_service",
                url: termsCandidate.candidateUrl
              })
            );
          }
          packetsChanged = true;
        }

        if (!packetsChanged) {
          return packet;
        }

        return {
          ...packetRecord,
          canonicalTargets: repairedTargets,
          supportedUnifiedFindings: repairedFindings
        };
      }

      const alreadyStrong =
        canonicalTargets.some((target) => targetHasStrongCookieEvidence(target)) ||
        supportedUnifiedFindings.some((finding) => findingHasStrongCookieEvidence(finding));

      const repairedTargets =
        cookieFinding && cookieRepair && !alreadyStrong
          ? [
              ...canonicalTargets,
              {
                canonicalUrl: cookieRepair.pageUrl,
                fetchQuality: "verified_content",
                snippet: cookieRepair.snippet,
                supportedSurfaceTypes: ["cookie_policy_or_settings", "privacy_choices"],
                supportingRefs: [{ text: cookieRepair.title, url: cookieRepair.pageUrl, verified: true }],
                title: cookieRepair.title
              }
            ]
          : [...canonicalTargets];

      const repairedFindings = supportedUnifiedFindings.map((finding) => {
        const payload =
          finding.evidencePayload && typeof finding.evidencePayload === "object"
            ? (finding.evidencePayload as Record<string, unknown>)
            : {};
        const findingId = typeof finding.findingId === "string" ? finding.findingId : null;
        const evidenceUrls = uniqueStrings([
          ...getStringArray(payload.pageUrls),
          ...getStringArray(payload.sourceUrls),
          ...getStringArray(finding.evidenceUrls)
        ]);
        const matchedPolicyRow =
          findingId
            ? input.policyEnrichment.find((row) => rowMatchesFindingPage(row, evidenceUrls)) ?? null
            : null;
        const policySnippet =
          findingId && matchedPolicyRow ? getFindingPolicySnippetCandidate(matchedPolicyRow, findingId) : null;
        const cookieSpecificRepair = finding.findingId === "cookie_policy_present" && cookieRepair
          ? {
              fetchQuality: "verified_content",
              pageUrls: uniqueStrings([
                ...getStringArray(payload.pageUrls),
                ...getStringArray(finding.evidenceUrls),
                cookieRepair.pageUrl
              ]),
              policySnippets: uniqueStrings([...getStringArray(payload.policySnippets), cookieRepair.snippet]),
              policySummaryShort:
                (typeof payload.policySummaryShort === "string" && payload.policySummaryShort.trim().length > 0
                  ? payload.policySummaryShort
                  : cookieRepair.snippet),
              sourceUrls: uniqueStrings([
                ...getStringArray(payload.sourceUrls),
                ...getStringArray(finding.evidenceUrls),
                cookieRepair.pageUrl
              ])
            }
          : null;

        if (!cookieSpecificRepair && !policySnippet) {
          return finding;
        }

        packetsChanged = true;
        return {
          ...finding,
          evidencePayload: {
            ...payload,
            ...(cookieSpecificRepair ?? {}),
            ...(policySnippet
              ? {
                  pageUrls: uniqueStrings([...(cookieSpecificRepair?.pageUrls ?? getStringArray(payload.pageUrls)), ...evidenceUrls]),
                  policySnippets: uniqueStrings([
                    ...(cookieSpecificRepair?.policySnippets ?? getStringArray(payload.policySnippets)),
                    policySnippet
                  ]),
                  policySummaryShort:
                    (typeof payload.policySummaryShort === "string" && payload.policySummaryShort.trim().length > 0
                      ? payload.policySummaryShort
                      : policySnippet),
                  sourceUrls: uniqueStrings([...(cookieSpecificRepair?.sourceUrls ?? getStringArray(payload.sourceUrls)), ...evidenceUrls])
                }
              : {})
          },
          evidenceUrls:
            cookieSpecificRepair && cookieRepair
              ? uniqueStrings([...getStringArray(finding.evidenceUrls), cookieRepair.pageUrl])
              : getStringArray(finding.evidenceUrls)
        };
      });

      const hasPrivacyChoicesTarget = repairedTargets.some((target) =>
        getStringArray(target.supportedSurfaceTypes).includes("privacy_choices")
      );
      const hasTargetedAdvertisingChoicesFinding = repairedFindings.some(
        (finding) => finding.findingId === "targeted_advertising_choices_present"
      );

      if (hasPrivacyChoicesTarget && !hasTargetedAdvertisingChoicesFinding) {
        const privacyChoicesTarget =
          repairedTargets.find((target) => getStringArray(target.supportedSurfaceTypes).includes("privacy_choices")) ?? null;
        const privacyChoicesUrl = typeof privacyChoicesTarget?.canonicalUrl === "string" ? privacyChoicesTarget.canonicalUrl : null;

        if (privacyChoicesUrl) {
          repairedFindings.push(
            buildDiscoveryRepairFinding({
              findingId: "targeted_advertising_choices_present",
              reason: "Verified privacy-controls evidence includes a dedicated privacy choices or do-not-sell/share path.",
              sourceSurfaceType: "privacy_choices",
              url: privacyChoicesUrl
            })
          );
          packetsChanged = true;
        }
      }

      if (!packetsChanged) {
        return packet;
      }

      return {
        ...packetRecord,
        canonicalTargets: repairedTargets,
        supportedUnifiedFindings: repairedFindings
      };
    });

    const packetRecords = packets.filter((packet): packet is Record<string, unknown> => Boolean(packet) && typeof packet === "object");
    const hasSupportAccessPacket = packetRecords.some((packet) => packet.familyId === "support_access");
    const contactCandidate = getBestDiscoveryCandidate(discoveryCandidates, "contact");
    const accessibilityCandidate = getBestDiscoveryCandidate(discoveryCandidates, "accessibility_statement");
    const verifiedContactSupport =
      verifiedSurfaceRecoveryResults.find((result) => result.surfaceType === "contact_support") ?? null;
    const verifiedAccessibilitySupport =
      verifiedSurfaceRecoveryResults.find((result) => result.surfaceType === "accessibility_support") ?? null;

    if (!hasSupportAccessPacket && (contactCandidate || accessibilityCandidate || verifiedContactSupport || verifiedAccessibilitySupport)) {
      const canonicalTargets: FamilyPacketTargetRecord[] = [];
      const supportedUnifiedFindings: FamilyPacketFindingRecord[] = [];

      if (verifiedContactSupport) {
        canonicalTargets.push(
          buildVerifiedSurfaceRecoveryTarget({
            label: "Contact Us",
            snippet: verifiedContactSupport.snippet,
            surfaceType: "contact_support",
            title: verifiedContactSupport.title,
            url: verifiedContactSupport.url
          })
        );
        supportedUnifiedFindings.push(
          buildVerifiedSurfaceRecoveryFinding({
            findingId: "contact_support_path_present",
            reason: "Verified support-access evidence includes help, contact, or feedback language.",
            snippet: verifiedContactSupport.snippet,
            sourceSurfaceType: "contact_support",
            url: verifiedContactSupport.url
          })
        );
      } else if (contactCandidate) {
        canonicalTargets.push(
          buildDiscoveryRepairTarget({
            candidate: contactCandidate,
            label: "Contact Us",
            surfaceType: "contact_support"
          })
        );
        supportedUnifiedFindings.push(
          buildDiscoveryRepairFinding({
            findingId: "contact_support_path_present",
            reason: "Homepage discovery retained a strong same-brand contact/help path.",
            sourceSurfaceType: "contact_support",
            url: contactCandidate.candidateUrl
          })
        );
      }

      if (verifiedAccessibilitySupport) {
        canonicalTargets.push(
          buildVerifiedSurfaceRecoveryTarget({
            label: "Accessibility",
            snippet: verifiedAccessibilitySupport.snippet,
            surfaceType: "accessibility_support",
            title: verifiedAccessibilitySupport.title,
            url: verifiedAccessibilitySupport.url
          })
        );
        supportedUnifiedFindings.push(
          buildVerifiedSurfaceRecoveryFinding({
            findingId: "accessibility_support_path_present",
            reason: "Verified support-access evidence includes accessibility, captioning, or accommodation language.",
            snippet: verifiedAccessibilitySupport.snippet,
            sourceSurfaceType: "accessibility_support",
            url: verifiedAccessibilitySupport.url
          })
        );
      } else if (accessibilityCandidate) {
        canonicalTargets.push(
          buildDiscoveryRepairTarget({
            candidate: accessibilityCandidate,
            label: "Accessibility",
            surfaceType: "accessibility_support"
          })
        );
        supportedUnifiedFindings.push(
          buildDiscoveryRepairFinding({
            findingId: "accessibility_support_path_present",
            reason: "Homepage discovery retained a strong same-brand accessibility support path.",
            sourceSurfaceType: "accessibility_support",
            url: accessibilityCandidate.candidateUrl
          })
        );
      }

      packets.push({
        contract: {
          id: "support_access"
        },
        familyId: "support_access",
        canonicalTargets,
        supportedUnifiedFindings
      });
      packetsChanged = true;
    }

    if (!packetsChanged) {
      return event;
    }

    return {
      ...event,
      metadataJson: {
        ...metadata,
        packets
      }
    };
  });

  const hasFamilyPacketEvent = repairedEvents.some((event) => {
    if (event.eventType !== "runtime.build_phase_diagnostic" || !event.metadataJson || typeof event.metadataJson !== "object") {
      return false;
    }

    const metadata = event.metadataJson as Record<string, unknown>;
    return metadata.phase === "finding_family_packets" && Array.isArray(metadata.packets);
  });

  if (hasFamilyPacketEvent) {
    return repairedEvents;
  }

  const syntheticPackets: Array<Record<string, unknown>> = [];
  const contactCandidate = getBestDiscoveryCandidate(discoveryCandidates, "contact");
  const accessibilityCandidate = getBestDiscoveryCandidate(discoveryCandidates, "accessibility_statement");
  const termsCandidate = getBestDiscoveryCandidate(discoveryCandidates, "terms_of_service");
  const verifiedContactSupport =
    verifiedSurfaceRecoveryResults.find((result) => result.surfaceType === "contact_support") ?? null;
  const verifiedAccessibilitySupport =
    verifiedSurfaceRecoveryResults.find((result) => result.surfaceType === "accessibility_support") ?? null;

  if (contactCandidate || accessibilityCandidate || verifiedContactSupport || verifiedAccessibilitySupport) {
    const canonicalTargets: FamilyPacketTargetRecord[] = [];
    const supportedUnifiedFindings: FamilyPacketFindingRecord[] = [];

    if (verifiedContactSupport) {
      canonicalTargets.push(
        buildVerifiedSurfaceRecoveryTarget({
          label: "Contact Us",
          snippet: verifiedContactSupport.snippet,
          surfaceType: "contact_support",
          title: verifiedContactSupport.title,
          url: verifiedContactSupport.url
        })
      );
      supportedUnifiedFindings.push(
        buildVerifiedSurfaceRecoveryFinding({
          findingId: "contact_support_path_present",
          reason: "Verified support-access evidence includes help, contact, or feedback language.",
          snippet: verifiedContactSupport.snippet,
          sourceSurfaceType: "contact_support",
          url: verifiedContactSupport.url
        })
      );
    } else if (contactCandidate) {
      canonicalTargets.push(
        buildDiscoveryRepairTarget({
          candidate: contactCandidate,
          label: "Contact Us",
          surfaceType: "contact_support"
        })
      );
      supportedUnifiedFindings.push(
        buildDiscoveryRepairFinding({
          findingId: "contact_support_path_present",
          reason: "Homepage discovery retained a strong same-brand contact/help path.",
          sourceSurfaceType: "contact_support",
          url: contactCandidate.candidateUrl
        })
      );
    }

    if (verifiedAccessibilitySupport) {
      canonicalTargets.push(
        buildVerifiedSurfaceRecoveryTarget({
          label: "Accessibility",
          snippet: verifiedAccessibilitySupport.snippet,
          surfaceType: "accessibility_support",
          title: verifiedAccessibilitySupport.title,
          url: verifiedAccessibilitySupport.url
        })
      );
      supportedUnifiedFindings.push(
        buildVerifiedSurfaceRecoveryFinding({
          findingId: "accessibility_support_path_present",
          reason: "Verified support-access evidence includes accessibility, captioning, or accommodation language.",
          snippet: verifiedAccessibilitySupport.snippet,
          sourceSurfaceType: "accessibility_support",
          url: verifiedAccessibilitySupport.url
        })
      );
    } else if (accessibilityCandidate) {
      canonicalTargets.push(
        buildDiscoveryRepairTarget({
          candidate: accessibilityCandidate,
          label: "Accessibility",
          surfaceType: "accessibility_support"
        })
      );
      supportedUnifiedFindings.push(
        buildDiscoveryRepairFinding({
          findingId: "accessibility_support_path_present",
          reason: "Homepage discovery retained a strong same-brand accessibility support path.",
          sourceSurfaceType: "accessibility_support",
          url: accessibilityCandidate.candidateUrl
        })
      );
    }

    syntheticPackets.push({
      contract: {
        id: "support_access"
      },
      familyId: "support_access",
      canonicalTargets,
      supportedUnifiedFindings
    });
  }

  if (termsCandidate) {
    syntheticPackets.push({
      contract: {
        id: "legal_core"
      },
      familyId: "legal_core",
      canonicalTargets: [
        buildDiscoveryRepairTarget({
          candidate: termsCandidate,
          label: "Terms of Service",
          surfaceType: "terms_of_service"
        })
      ],
      supportedUnifiedFindings: [
        buildDiscoveryRepairFinding({
          findingId: "terms_of_service_present",
          reason: "Homepage discovery retained a strong same-brand terms surface.",
          sourceSurfaceType: "terms_of_service",
          url: termsCandidate.candidateUrl
        })
      ]
    });
  }

  if (syntheticPackets.length === 0) {
    return repairedEvents;
  }

  return [
    ...repairedEvents,
    {
      eventType: "runtime.build_phase_diagnostic",
      metadataJson: {
        phase: "finding_family_packets",
        packets: syntheticPackets
      }
    } as TEvent
  ];
}
