import { isMeaningfulPolicyText, normalizePolicySnippet } from "../../lib/scans/policy-snippet-normalization";
import {
  getPolicyActionableFlags,
  getPolicyEvidenceSnippets,
  getPolicyPageType,
  getPolicyPageUrl,
  getPolicySummaryText
} from "../../lib/scans/policy-enrichment-row";

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

const FINDING_POLICY_EVIDENCE_KEYS: Record<string, string[]> = {
  affiliate_disclosure_present: ["affiliate_disclosure", "affiliate", "notice_contact"],
  privacy_contact_path_present: ["notice_contact", "privacy_contact", "dsar"],
  privacy_rights_path_present: ["dsar", "rights_signal:access", "rights_signal:delete", "rights_signal:correction", "notice_contact"],
  targeted_advertising_choices_present: ["do_not_sell", "privacy_choices", "targeted_advertising"],
  third_party_advertising_disclosure_present: ["topic:third_party_advertising_disclosure"],
  tracking_technologies_disclosure_present: ["topic:tracking_technologies_disclosure", "cookies", "cookie_notice", "cookie_table"],
  children_privacy_disclosure_present: ["topic:children", "children"]
};

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
      const pageUrl = getPolicyPageUrl(row);
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
  const actionableFlags = getStringArray(getPolicyActionableFlags(policyRow));
  return structurallyWeak || actionableFlags.includes("policy_fetch_insufficient_content");
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
  const summary = getPolicySummaryText(row);
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

  const summary = getPolicySummaryText(row);
  return summary ? normalizePolicySnippet(summary) : null;
}

function rowMatchesFindingPage(row: Record<string, unknown>, evidenceUrls: string[]) {
  const pageUrl = getPolicyPageUrl(row);
  return Boolean(pageUrl && evidenceUrls.includes(pageUrl));
}

function getCookieRepairEvidence(policyEnrichment: Array<Record<string, unknown>>) {
  const scoredRows = policyEnrichment
    .map((row) => {
      const pageType = String(getPolicyPageType(row) ?? "");
      const pageUrl = getPolicyPageUrl(row);
      const snippets = getCookieSnippetCandidates(row);
      const summary = getPolicySummaryText(row);
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
    const looksLikeFundingSupportPage =
      /\/financial-support(?:\/|$)|\/financial-aid(?:\/|$)|\/student-support(?:\/|$)|\/scholarships?(?:\/|$)|\/fellowships?(?:\/|$)/.test(
        path
      ) &&
      /\b(financial support|financial aid|student support|scholarships?|fellowships?|graduate support|tuition assistance)\b/i.test(
        text
      ) &&
      !hasStrongSupportLanguage;

    return (
      (genericPath && weakTitle && hasChromeOnlyBoilerplate && !hasStrongSupportLanguage) ||
      looksLikeProfileRedirect ||
      looksLikeTopicArticleFromContactSlug ||
      (looksLikeCommercialOfferPage && !hasStrongSupportLanguage) ||
      looksLikeFundingSupportPage
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

export function repairFindingFamilyPacketEvents<TEvent extends ScanEventRecordLike>(input: {
  events: TEvent[];
  policyEnrichment: Array<Record<string, unknown>>;
}): TEvent[] {
  const canonicalTargetDomainCounts = getCanonicalTargetDomainCounts(input.events);
  const cookieRepair = getCookieRepairEvidence(input.policyEnrichment);
  const hasFindingSpecificPolicyRepairs = input.policyEnrichment.some((row) =>
    Object.keys(FINDING_POLICY_EVIDENCE_KEYS).some((findingId) => Boolean(getFindingPolicySnippetCandidate(row, findingId)))
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

  if (!cookieRepair && !hasFindingSpecificPolicyRepairs && !hasSupportPacketFilterCandidates) {
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

      if (!packetsChanged) {
        return packet;
      }

      return {
        ...packetRecord,
        canonicalTargets: repairedTargets,
        supportedUnifiedFindings: repairedFindings
      };
    });

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

  return repairedEvents;
}
