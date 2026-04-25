import process from "node:process";
import { closePools, query } from "@website-signal-risk-scanner/db";
import { debugBuildScanReportUnifiedFindingState } from "../components/scans/shared-scan-detail-view";
import { buildUnifiedFindingDisplayPackets, type UnifiedFindingDisplayPacket } from "../lib/scans/unified-findings";
import { buildValidationFindingLookup } from "../lib/scans/validation-review-linking";
import { loadScanRecord, type ScanRow } from "./report-production-finding-frequency";

type TargetFinding =
  | "behavioral_analytics_disclosure_present"
  | "children_privacy_disclosure_present"
  | "consent_gated_tracking_claim_conflict"
  | "cookie_policy_present"
  | "privacy_contact_path_present"
  | "privacy_policy_present"
  | "privacy_rights_path_present"
  | "targeted_advertising_disclosure_present"
  | "third_party_advertising_disclosure_present"
  | "tracking_technologies_disclosure_present";

type ScanWithDomain = ScanRow & {
  hostname: string | null;
};

type EvidenceLineageBucket =
  | "surfaced"
  | "audit_only_missing_evidence"
  | "review"
  | "suppressed"
  | "raw_present_no_unified_packet"
  | "no_raw_evidence";

type EvidenceProbe = {
  reasons: string[];
  rawEvidencePresent: boolean;
};

type LineageRow = {
  bucket: EvidenceLineageBucket;
  confidenceFlags: string[];
  domain: string;
  findingId: TargetFinding;
  negativeEvidenceFlags: string[];
  packetEvidence: {
    directRuntime: boolean;
    packetBacked: boolean;
    pageAttribution: boolean;
    policyText: boolean;
    readableSnippet: boolean;
  } | null;
  presentationStatus: string;
  rawReasons: string[];
  scanId: string;
};

const DEFAULT_FINDINGS: TargetFinding[] = [
  "privacy_contact_path_present",
  "privacy_rights_path_present",
  "privacy_policy_present",
  "tracking_technologies_disclosure_present",
  "targeted_advertising_disclosure_present",
  "third_party_advertising_disclosure_present",
  "children_privacy_disclosure_present",
  "cookie_policy_present",
  "behavioral_analytics_disclosure_present",
  "consent_gated_tracking_claim_conflict"
];

const SIGNAL_KEYS_BY_FINDING: Record<TargetFinding, string[]> = {
  behavioral_analytics_disclosure_present: [
    "privacy.behavioral_analytics_disclosure_present",
    "privacy.session_replay_disclosure_present",
    "privacy.product_analytics_disclosure_present"
  ],
  children_privacy_disclosure_present: ["privacy.children_privacy_disclosure_present"],
  consent_gated_tracking_claim_conflict: [],
  cookie_policy_present: ["privacy.cookie_policy_present", "disclosure.cookie_policy_present"],
  privacy_contact_path_present: ["privacy.privacy_contact_path_present"],
  privacy_policy_present: ["privacy.privacy_policy_present", "disclosure.privacy_policy_present"],
  privacy_rights_path_present: ["privacy.privacy_rights_path_present"],
  targeted_advertising_disclosure_present: ["privacy.targeted_advertising_disclosure_present"],
  third_party_advertising_disclosure_present: ["privacy.third_party_advertising_disclosure_present"],
  tracking_technologies_disclosure_present: ["privacy.tracking_technologies_disclosure_present"]
};

const POLICY_SNIPPET_KEYS_BY_FINDING: Record<TargetFinding, string[]> = {
  behavioral_analytics_disclosure_present: [
    "behavioral_analytics_disclosure",
    "product_analytics_disclosure",
    "session_replay_disclosure"
  ],
  children_privacy_disclosure_present: ["topic:children", "children"],
  consent_gated_tracking_claim_conflict: [],
  cookie_policy_present: ["cookie_policy", "cookies"],
  privacy_contact_path_present: ["privacy_contact", "notice_contact", "dsar"],
  privacy_policy_present: [],
  privacy_rights_path_present: ["privacy_rights", "dsar", "access_delete"],
  targeted_advertising_disclosure_present: ["targeted_advertising_disclosure", "advertising"],
  third_party_advertising_disclosure_present: ["third_party_advertising_disclosure", "advertising"],
  tracking_technologies_disclosure_present: ["tracking_technologies_disclosure", "cookies", "pixels"]
};

function getArgValue(flag: string) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

function getNumberArg(flag: string, fallback: number) {
  const raw = getArgValue(flag);
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0))];
}

function getBoolean(record: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    if (typeof record?.[key] === "boolean") {
      return record[key] as boolean;
    }
  }
  return false;
}

function getString(record: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    if (typeof record?.[key] === "string" && String(record[key]).trim()) {
      return String(record[key]).trim();
    }
  }
  return null;
}

function getStringArray(record: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    if (Array.isArray(record?.[key])) {
      return (record[key] as unknown[]).filter((value): value is string => typeof value === "string" && value.trim().length > 0);
    }
  }
  return [];
}

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function getMergedSignalValue(mergedSignals: unknown[], keys: string[]) {
  for (const signal of mergedSignals) {
    const record = getRecord(signal);
    if (!record || !keys.includes(String(record.key ?? ""))) {
      continue;
    }
    const selectedPopulation = getRecord(record.selectedPopulation);
    const value = selectedPopulation?.value ?? record.value;
    if (value !== null && value !== undefined && value !== false) {
      return value;
    }
  }
  return null;
}

function policySnippetReasons(policyRows: Array<Record<string, unknown>>, keys: string[]) {
  const reasons: string[] = [];
  for (const row of policyRows) {
    const snippets = getRecord(row.evidence_snippets ?? row.evidenceSnippets);
    if (!snippets) {
      continue;
    }
    for (const key of keys) {
      if (typeof snippets[key] === "string" && snippets[key].trim().length > 0) {
        reasons.push(`policy snippet ${key}`);
      }
    }
  }
  return uniqueStrings(reasons);
}

function hasPolicyPageType(policyRows: Array<Record<string, unknown>>, pageTypes: string[]) {
  return policyRows.some((row) => pageTypes.includes(String(row.page_type ?? row.pageType ?? "")));
}

function probeRawEvidence(findingId: TargetFinding, record: Record<string, unknown>): EvidenceProbe {
  const snapshot = getRecord(record.snapshot);
  const runtimeArtifacts = getRecord(record.runtimeArtifacts);
  const mergedSignals = Array.isArray(record.mergedSignals) ? record.mergedSignals : [];
  const policyRows = Array.isArray(record.policyEnrichment)
    ? record.policyEnrichment.filter((row): row is Record<string, unknown> => Boolean(getRecord(row)))
    : [];
  const preconsentViolations = Array.isArray(record.preconsentViolations)
    ? record.preconsentViolations.filter((row): row is Record<string, unknown> => Boolean(getRecord(row)))
    : [];
  const trackerVendors = Array.isArray(record.trackerVendors)
    ? record.trackerVendors.filter((row): row is Record<string, unknown> => Boolean(getRecord(row)))
    : [];
  const reasons: string[] = [];
  const signalKeys = SIGNAL_KEYS_BY_FINDING[findingId];
  const mergedSignalValue = getMergedSignalValue(mergedSignals, signalKeys);
  if (mergedSignalValue !== null) {
    reasons.push(`merged signal ${signalKeys.find((key) => getMergedSignalValue(mergedSignals, [key]) !== null) ?? signalKeys[0]}`);
  }
  reasons.push(...policySnippetReasons(policyRows, POLICY_SNIPPET_KEYS_BY_FINDING[findingId]));

  switch (findingId) {
    case "privacy_policy_present":
      if (getBoolean(snapshot, ["privacy_policy_present"])) {
        reasons.push("snapshot privacy_policy_present");
      }
      if (hasPolicyPageType(policyRows, ["privacy_policy"])) {
        reasons.push("policy_enrichment privacy_policy row");
      }
      break;
    case "cookie_policy_present":
      if (getBoolean(snapshot, ["cookie_policy_present"])) {
        reasons.push("snapshot cookie_policy_present");
      }
      if (hasPolicyPageType(policyRows, ["cookie_policy"])) {
        reasons.push("policy_enrichment cookie_policy row");
      }
      break;
    case "privacy_contact_path_present": {
      if (getBoolean(snapshot, ["privacy_contact_method_present"])) {
        reasons.push("snapshot privacy_contact_method_present");
      }
      const channelType = getString(snapshot, ["privacy_contact_channel_type"]) ??
        getString(runtimeArtifacts, ["privacyContactChannelType", "privacy_contact_channel_type"]);
      if (channelType && !/^none|unknown|generic$/i.test(channelType)) {
        reasons.push(`privacy contact channel ${channelType}`);
      }
      break;
    }
    case "privacy_rights_path_present":
      if (
        getBoolean(snapshot, [
          "privacy_request_form_present",
          "data_access_request_present",
          "data_deletion_request_present"
        ])
      ) {
        reasons.push("snapshot privacy rights mechanism");
      }
      break;
    case "consent_gated_tracking_claim_conflict": {
      if (
        getBoolean(snapshot, ["preconsent_tracking_detected", "tracking_before_consent_detected"]) ||
        preconsentViolations.length > 0
      ) {
        reasons.push("pre-consent runtime signal");
      }
      const retainedUrls = uniqueStrings([
        ...preconsentViolations.flatMap((row) => getStringArray(row, ["evidenceUrls", "evidence_urls"])),
        ...getStringArray(runtimeArtifacts, ["consent_baseline_tracker_evidence_urls", "consentBaselineTrackerEvidenceUrls"])
      ]);
      if (retainedUrls.some((url) => /^https?:\/\//i.test(url))) {
        reasons.push("retained pre-consent request URL");
      }
      if (getBoolean(snapshot, ["privacy_policy_present"]) || hasPolicyPageType(policyRows, ["privacy_policy"])) {
        reasons.push("privacy policy surface");
      }
      break;
    }
    case "behavioral_analytics_disclosure_present":
      if (trackerVendors.some((row) => /session[_\s-]?replay|analytics/i.test(String(row.vendorCategory ?? "")))) {
        reasons.push("runtime analytics or replay vendor");
      }
      break;
    case "targeted_advertising_disclosure_present":
    case "third_party_advertising_disclosure_present":
      if (
        getBoolean(snapshot, ["ad_network_google_ads", "ad_network_meta_ads", "retargeting_pixel_detected"]) ||
        trackerVendors.some((row) => /advertis|marketing|retarget/i.test(String(row.vendorCategory ?? "")))
      ) {
        reasons.push("runtime advertising signal");
      }
      break;
    case "tracking_technologies_disclosure_present":
      if (
        getBoolean(snapshot, ["cookie_policy_present", "third_party_tracking_detected"]) ||
        (Number(snapshot?.third_party_request_count ?? 0) > 0)
      ) {
        reasons.push("runtime tracking/cookie signal");
      }
      break;
    case "children_privacy_disclosure_present":
      if (getBoolean(snapshot, ["children_privacy_disclosure_present", "children_directed_context_detected"])) {
        reasons.push("snapshot children privacy context");
      }
      break;
  }

  const uniqueReasons = uniqueStrings(reasons);
  return {
    rawEvidencePresent: uniqueReasons.length > 0,
    reasons: uniqueReasons
  };
}

function classifyLineage(input: {
  packet: UnifiedFindingDisplayPacket | undefined;
  rawEvidencePresent: boolean;
}): EvidenceLineageBucket {
  if (!input.packet) {
    return input.rawEvidencePresent ? "raw_present_no_unified_packet" : "no_raw_evidence";
  }
  switch (input.packet.presentationDecision.status) {
    case "surface":
      return "surfaced";
    case "audit_only":
      return "audit_only_missing_evidence";
    case "suppress":
      return "suppressed";
    default:
      return "review";
  }
}

function parseFindings() {
  const raw = getArgValue("--findings") ?? getArgValue("--finding");
  if (!raw || raw === "default") {
    return DEFAULT_FINDINGS;
  }
  const values = raw.split(",").map((value) => value.trim()).filter(Boolean);
  const allowed = new Set(DEFAULT_FINDINGS);
  const findings = values.filter((value): value is TargetFinding => allowed.has(value as TargetFinding));
  if (findings.length !== values.length) {
    const unsupported = values.filter((value) => !allowed.has(value as TargetFinding));
    throw new Error(`Unsupported finding id(s): ${unsupported.join(", ")}`);
  }
  return findings;
}

async function loadScans(input: { limit: number; scanType: string }) {
  return query<ScanWithDomain>(
    `select s.id, s.organization_id, s.domain_id, s.scan_type, s.status, s.created_at, s.started_at, s.completed_at,
            s.pages_requested, s.pages_scanned, s.error_message, d.hostname
       from scans s
       left join domains d on d.id = s.domain_id
      where s.status = 'completed'
        and s.scan_type = $1
        and s.organization_id is not null
      order by s.completed_at desc nulls last
      limit $2`,
    [input.scanType, input.limit],
    { readOnly: true }
  ).then((result) => result.rows);
}

async function buildLoaderDependencies() {
  const [taxonomyModule, mergedSignalsModule, hybridRuntimeModule, policyEnrichmentModule] = await Promise.all([
    import("../lib/scans/signal-taxonomy"),
    import("../lib/scans/merged-signals"),
    import("../lib/scans/hybrid-runtime-evidence"),
    import("../lib/scans/policy-enrichment-row")
  ]);

  return {
    buildMergedSignalRecords: mergedSignalsModule.buildMergedSignalRecords as (input: Record<string, unknown>) => unknown[],
    getHybridDerivedTrackerVendors: hybridRuntimeModule.getHybridDerivedTrackerVendors as (runtimeArtifacts: Record<string, unknown> | null) => Array<Record<string, unknown>>,
    getPrimaryCategoryDescription: taxonomyModule.getPrimaryCategoryDescription as (category: string) => string,
    getPrimaryCategoryLabel: taxonomyModule.getPrimaryCategoryLabel as (category: string) => string,
    getPrimaryPolicyEnrichmentRow: policyEnrichmentModule.getPrimaryPolicyEnrichmentRow as (rows: Array<Record<string, unknown>>) => Record<string, unknown> | null,
    mapSignalKeyToTaxonomy: taxonomyModule.mapSignalKeyToTaxonomy as (input: { category: string; key: string; label: string }) => { primaryCategory: string; subcategory?: string | null },
    withHybridRuntimeArtifactFallbacks: hybridRuntimeModule.withHybridRuntimeArtifactFallbacks as (runtimeArtifacts: Record<string, unknown>) => Record<string, unknown> | null
  };
}

function renderMarkdown(input: {
  findings: TargetFinding[];
  generatedAt: string;
  rows: LineageRow[];
  scanCount: number;
}) {
  const lines = [
    "# Production Evidence Lineage Audit",
    "",
    `Generated: ${input.generatedAt}`,
    `Scope: ${input.scanCount} recent completed org-backed scans`,
    "",
    "| Finding | Surfaced | Audit-only | Review | Suppressed | Raw present/no packet | No raw evidence | Top negative flags |",
    "|---|---:|---:|---:|---:|---:|---:|---|"
  ];

  for (const findingId of input.findings) {
    const rows = input.rows.filter((row) => row.findingId === findingId);
    const count = (bucket: EvidenceLineageBucket) => rows.filter((row) => row.bucket === bucket).length;
    const flagCounts = new Map<string, number>();
    for (const row of rows) {
      for (const flag of row.negativeEvidenceFlags) {
        flagCounts.set(flag, (flagCounts.get(flag) ?? 0) + 1);
      }
    }
    const flags = [...flagCounts.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, 4)
      .map(([flag, flagCount]) => `${flag} (${flagCount})`)
      .join(", ");

    lines.push(
      `| \`${findingId}\` | ${count("surfaced")} | ${count("audit_only_missing_evidence")} | ${count("review")} | ${count("suppressed")} | ${count("raw_present_no_unified_packet")} | ${count("no_raw_evidence")} | ${flags || "-"} |`
    );
  }

  lines.push("", "## Examples", "");
  for (const findingId of input.findings) {
    const examples = input.rows
      .filter((row) => row.findingId === findingId && row.bucket !== "no_raw_evidence")
      .slice(0, 8);
    if (examples.length === 0) {
      continue;
    }
    lines.push(`### ${findingId}`, "");
    lines.push("| Domain | Bucket | Status | Raw reasons | Negative flags | Packet evidence |");
    lines.push("|---|---|---|---|---|---|");
    for (const row of examples) {
      const evidence = row.packetEvidence
        ? [
            row.packetEvidence.policyText ? "policy_text" : null,
            row.packetEvidence.pageAttribution ? "page" : null,
            row.packetEvidence.readableSnippet ? "snippet" : null,
            row.packetEvidence.directRuntime ? "runtime" : null,
            row.packetEvidence.packetBacked ? "packet" : null
          ].filter(Boolean).join(", ")
        : "-";
      lines.push(
        `| ${row.domain} | ${row.bucket} | ${row.presentationStatus} | ${row.rawReasons.join("<br>") || "-"} | ${row.negativeEvidenceFlags.join("<br>") || "-"} | ${evidence || "-"} |`
      );
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

async function main() {
  const findings = parseFindings();
  const scanLimit = getNumberArg("--scan-limit", 80);
  const scanType = getArgValue("--scan-type") ?? "full";
  const scans = await loadScans({ limit: scanLimit, scanType });
  const dependencies = await buildLoaderDependencies();
  const rows: LineageRow[] = [];

  for (const scan of scans) {
    const record = await loadScanRecord({
      ...dependencies,
      scan
    });
    const state = debugBuildScanReportUnifiedFindingState(record as never);
    const validationFindingLookup = buildValidationFindingLookup(record.validationFindings as never);
    const packets = buildUnifiedFindingDisplayPackets({
      coverageSummary: {
        legalCoverageScore: Number(record.snapshot?.legal_coverage_score ?? 0),
        pagesScanned: Number(record.snapshot?.pages_scanned ?? 0),
        policyEnrichmentCount: record.policyEnrichment.length,
        verifiedPublicSurfacesCount: Number(record.snapshot?.verified_public_surfaces_count ?? 0)
      },
      mergedSignals: record.mergedSignals as never,
      policyEnrichment: record.policyEnrichment,
      reviewFindingCandidates: state.allReviewFindingCandidates ?? [],
      scanEvents: record.events as never,
      validationFindings: record.validationFindings as never,
      validationFindingLookup
    });
    const packetByFindingId = new Map(packets.map((packet) => [packet.unifiedFindingId, packet]));
    const domain = scan.hostname ?? scan.domain_id ?? scan.id;

    for (const findingId of findings) {
      const rawProbe = probeRawEvidence(findingId, record as Record<string, unknown>);
      const packet = packetByFindingId.get(findingId);
      const bucket = classifyLineage({
        packet,
        rawEvidencePresent: rawProbe.rawEvidencePresent
      });

      rows.push({
        bucket,
        confidenceFlags: packet?.confidenceInputs.evidenceQualityFlags ?? [],
        domain,
        findingId,
        negativeEvidenceFlags: packet?.concernContext?.negativeEvidenceFlags ?? [],
        packetEvidence: packet
          ? {
              directRuntime: packet.confidenceInputs.hasDirectRuntimeEvidence,
              packetBacked: packet.confidenceInputs.hasPacketBackedEvidence,
              pageAttribution: packet.confidenceInputs.hasPageAttribution,
              policyText: packet.confidenceInputs.hasPolicyTextEvidence,
              readableSnippet: packet.confidenceInputs.hasReadableSurfaceSnippetEvidence
            }
          : null,
        presentationStatus: packet?.presentationDecision.status ?? "none",
        rawReasons: rawProbe.reasons,
        scanId: scan.id
      });
    }
  }

  const output = {
    findings,
    generatedAt: new Date().toISOString(),
    rows,
    scanCount: scans.length
  };

  if (hasFlag("--json")) {
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  } else {
    process.stdout.write(renderMarkdown(output));
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePools();
  });
