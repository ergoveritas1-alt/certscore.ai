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
  sourceSurfaceTypes?: unknown;
};

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0))];
}

function getStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0) : [];
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

export function repairFindingFamilyPacketEvents<TEvent extends ScanEventRecordLike>(input: {
  events: TEvent[];
  policyEnrichment: Array<Record<string, unknown>>;
}): TEvent[] {
  const cookieRepair = getCookieRepairEvidence(input.policyEnrichment);
  if (!cookieRepair) {
    return input.events;
  }

  return input.events.map((event) => {
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
      if (packetRecord.familyId !== "privacy_controls") {
        return packet;
      }

      const canonicalTargets = Array.isArray(packetRecord.canonicalTargets)
        ? (packetRecord.canonicalTargets as FamilyPacketTargetRecord[])
        : [];
      const supportedUnifiedFindings = Array.isArray(packetRecord.supportedUnifiedFindings)
        ? (packetRecord.supportedUnifiedFindings as FamilyPacketFindingRecord[])
        : [];
      const cookieFinding = supportedUnifiedFindings.find((finding) => finding.findingId === "cookie_policy_present");

      if (!cookieFinding) {
        return packet;
      }

      const alreadyStrong =
        canonicalTargets.some((target) => targetHasStrongCookieEvidence(target)) ||
        supportedUnifiedFindings.some((finding) => findingHasStrongCookieEvidence(finding));
      if (alreadyStrong) {
        return packet;
      }

      packetsChanged = true;
      const repairedTargets = [
        ...canonicalTargets,
        {
          canonicalUrl: cookieRepair.pageUrl,
          fetchQuality: "verified_content",
          snippet: cookieRepair.snippet,
          supportedSurfaceTypes: ["cookie_policy_or_settings", "privacy_choices"],
          supportingRefs: [{ text: cookieRepair.title, url: cookieRepair.pageUrl, verified: true }],
          title: cookieRepair.title
        }
      ];

      const repairedFindings = supportedUnifiedFindings.map((finding) => {
        if (finding.findingId !== "cookie_policy_present") {
          return finding;
        }

        const payload =
          finding.evidencePayload && typeof finding.evidencePayload === "object"
            ? (finding.evidencePayload as Record<string, unknown>)
            : {};

        return {
          ...finding,
          evidencePayload: {
            ...payload,
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
          },
          evidenceUrls: uniqueStrings([...getStringArray(finding.evidenceUrls), cookieRepair.pageUrl])
        };
      });

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
}
