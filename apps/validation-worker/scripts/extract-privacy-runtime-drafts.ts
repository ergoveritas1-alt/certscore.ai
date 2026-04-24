import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import type {
  PrivacyRuntimeConfidenceBand,
  PrivacyRuntimeExternalSurfacingEligibility,
  PrivacyRuntimeFindingGroup,
  PrivacyRuntimeFindingId,
  PrivacyRuntimePresentationState,
  PrivacyRuntimePromotionEligibility,
  PrivacyRuntimeScenarioType,
  PrivacyRuntimeSourceKind
} from "@website-signal-risk-scanner/validation-shared";

const DEFAULT_ARTIFACT_ROOTS = [
  "artifacts/live-consent-audit",
  "apps/validation-worker/artifacts/live-consent-audit"
];

type JsonRecord = Record<string, unknown>;

type PrivacyRuntimeDraft = {
  artifactPath: string;
  domain: string;
  downgradeReason?: string;
  evidence: JsonRecord;
  expected: {
    confidenceBand: PrivacyRuntimeConfidenceBand;
    externalSurfacingEligibility: PrivacyRuntimeExternalSurfacingEligibility;
    presentationState: PrivacyRuntimePresentationState;
    promotionEligibility: PrivacyRuntimePromotionEligibility;
  };
  findingGroup: PrivacyRuntimeFindingGroup;
  findingId: PrivacyRuntimeFindingId;
  id: string;
  liveFetch?: {
    finalUrl: string;
    ok: boolean;
    status: number;
  };
  negativeControlReason?: string;
  notes: string;
  scenarioName: string;
  scenarioType: PrivacyRuntimeScenarioType;
  sourceKind: PrivacyRuntimeSourceKind;
  sourceUrl: string | null;
};

type ScenarioArtifact = {
  actionSummary?: JsonRecord;
  banner?: JsonRecord;
  network?: JsonRecord[];
  notes?: string[];
  storageBeforeInteraction?: JsonRecord[];
  timestamp?: string;
  url?: string;
};

type ReportFinding = {
  confidenceScore?: number;
  conservativeWording?: string;
  evidence?: {
    cookies?: string[];
    pageUrls?: string[];
    requests?: string[];
    screenshots?: string[];
    storage?: string[];
    uiText?: string[];
  };
  findingId?: string;
  observation?: string;
  title?: string;
};

type SiteReportArtifact = {
  findings?: ReportFinding[];
  finalClassification?: string;
  preConsentTrackingSummary?: {
    likelyVendorsObserved?: string[];
    nonEssentialRequestsBeforeInteraction?: string[];
  };
  site?: {
    hostname?: string;
    startUrl?: string;
  };
};

function getArgValues(flag: string) {
  const values: string[] = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === flag) {
      const value = process.argv[index + 1];
      if (value) {
        values.push(value);
      }
    }
  }
  return values;
}

function getArgValue(flag: string) {
  const values = getArgValues(flag);
  return values.length > 0 ? values[values.length - 1] ?? null : null;
}

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function getBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function getRecordArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is JsonRecord => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry))
    : [];
}

function getStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => value?.replace(/\s+/g, " ").trim() ?? "").filter((value) => value.length > 0))];
}

function readJsonFile(path: string) {
  return JSON.parse(readFileSync(path, "utf8")) as JsonRecord;
}

function walkFiles(root: string, filename: string) {
  const files: string[] = [];
  if (!existsSync(root)) {
    return files;
  }

  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const entry of readdirSync(current)) {
      const path = join(current, entry);
      const stats = statSync(path);
      if (stats.isDirectory()) {
        stack.push(path);
      } else if (entry === filename) {
        files.push(path);
      }
    }
  }

  return files.sort();
}

function resolveDefaultArtifactRoot() {
  for (const candidate of DEFAULT_ARTIFACT_ROOTS) {
    const absolutePath = resolve(candidate);
    if (existsSync(absolutePath)) {
      return absolutePath;
    }
  }

  return resolve(DEFAULT_ARTIFACT_ROOTS[0]!);
}

function inferDomainFromScenarioPath(path: string) {
  return basename(dirname(dirname(path)));
}

function inferScenarioName(path: string) {
  return basename(dirname(path));
}

function inferDomainFromReportPath(path: string) {
  return basename(dirname(path));
}

function isBeforeInteraction(row: JsonRecord) {
  return getString(row.phase) === "before_interaction";
}

function isNonEssentialNetworkRow(row: JsonRecord) {
  const category = getString(row.vendorCategory)?.toLowerCase() ?? "";
  const vendorName = getString(row.vendorName);
  const hostname = getString(row.hostname);

  if (!isBeforeInteraction(row)) {
    return false;
  }
  if (!getString(row.url)?.startsWith("http")) {
    return false;
  }
  if (category === "strictly_necessary") {
    return false;
  }
  if (/captcha|anti-bot|security/i.test([category, vendorName, hostname].filter(Boolean).join(" "))) {
    return false;
  }
  if (category === "unknown_needs_manual_review" && !vendorName) {
    return false;
  }

  return true;
}

function isStrictlyNecessaryOnlyScenario(network: JsonRecord[]) {
  const beforeRows = network.filter(isBeforeInteraction);
  if (beforeRows.length === 0) {
    return false;
  }

  return beforeRows.every((row) => {
    const category = getString(row.vendorCategory)?.toLowerCase() ?? "";
    return category === "strictly_necessary" || category === "unknown_needs_manual_review";
  });
}

function sanitizeUrl(value: string) {
  try {
    const parsed = new URL(value);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return value;
  }
}

function sanitizeSourceUrl(value: string | null | undefined) {
  return value ? sanitizeUrl(value) : null;
}

function getArtifactRunSlug(artifactPath: string) {
  const parts = artifactPath.split(/[\\/]/);
  const auditIndex = parts.lastIndexOf("live-consent-audit");
  const stamp = auditIndex >= 0 ? parts[auditIndex + 1] : null;
  return (stamp ?? "unknown-run").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
}

function getConsentBannerDetectedMs(scenario: ScenarioArtifact) {
  const banner = getRecord(scenario.banner);
  return getBoolean(banner?.bannerPresent) === true ? 12_000 : undefined;
}

function buildPreconsentPositiveDraft(input: {
  artifactPath: string;
  domain: string;
  scenario: ScenarioArtifact;
  scenarioName: string;
}) {
  const network = getRecordArray(input.scenario.network);
  const rows = network.filter(isNonEssentialNetworkRow);
  if (rows.length === 0) {
    return null;
  }

  const vendors = uniqueStrings(rows.map((row) => getString(row.vendorName) ?? getString(row.hostname)));
  const requestUrls = uniqueStrings(rows.map((row) => getString(row.url)).filter(Boolean).map((url) => sanitizeUrl(url!)));
  const vendorCategories = uniqueStrings(rows.map((row) => getString(row.vendorCategory)));
  const banner = getRecord(input.scenario.banner);

  return {
    artifactPath: input.artifactPath,
    domain: input.domain,
    evidence: {
      artifactRefs: getBannerScreenshots(banner),
      consentBannerDetectedMs: getConsentBannerDetectedMs(input.scenario),
      detectionSource: "live_consent_audit_network_before_interaction",
      requestUrls: requestUrls.slice(0, 8),
      sequenceEvidence: true,
      vendorCategories,
      vendors
    },
    expected: {
      confidenceBand: "high",
      externalSurfacingEligibility: "eligible",
      presentationState: "confirmed",
      promotionEligibility: "eligible"
    },
    findingGroup: "preconsent_tracking",
    findingId: "preconsent_tracking",
    id: `live-preconsent-${input.domain}-${input.scenarioName}-${getArtifactRunSlug(input.artifactPath)}`,
    notes: "Live consent audit retained non-essential before-interaction network evidence. Review the URL/vendor classification before promotion.",
    scenarioName: input.scenarioName,
    scenarioType: "positive_high_confidence",
    sourceKind: "live_artifact",
    sourceUrl: sanitizeSourceUrl(input.scenario.url)
  } satisfies PrivacyRuntimeDraft;
}

function buildPreconsentNegativeDraft(input: {
  artifactPath: string;
  domain: string;
  scenario: ScenarioArtifact;
  scenarioName: string;
}) {
  const network = getRecordArray(input.scenario.network);
  if (!isStrictlyNecessaryOnlyScenario(network)) {
    return null;
  }

  return {
    artifactPath: input.artifactPath,
    domain: input.domain,
    evidence: {
      requestUrls: uniqueStrings(network.filter(isBeforeInteraction).map((row) => getString(row.url)).filter(Boolean).map((url) => sanitizeUrl(url!))).slice(0, 8),
      sequenceEvidence: false,
      vendorCategories: uniqueStrings(network.filter(isBeforeInteraction).map((row) => getString(row.vendorCategory))),
      vendors: uniqueStrings(network.filter(isBeforeInteraction).map((row) => getString(row.vendorName)))
    },
    expected: {
      confidenceBand: "low",
      externalSurfacingEligibility: "suppress",
      presentationState: "suppressed",
      promotionEligibility: "blocked"
    },
    findingGroup: "preconsent_tracking",
    findingId: "preconsent_tracking",
    id: `live-preconsent-negative-${input.domain}-${input.scenarioName}-${getArtifactRunSlug(input.artifactPath)}`,
    negativeControlReason: "Before-interaction network evidence is strictly necessary, security, or unresolved without a non-essential vendor.",
    notes: "Live consent audit negative-control candidate. Review before adding to the corpus.",
    scenarioName: input.scenarioName,
    scenarioType: "negative_control",
    sourceKind: "live_artifact",
    sourceUrl: sanitizeSourceUrl(input.scenario.url)
  } satisfies PrivacyRuntimeDraft;
}

function getBannerScreenshots(banner: JsonRecord | null) {
  const screenshots = getRecord(banner?.screenshots);
  return uniqueStrings([
    getString(screenshots?.banner),
    getString(screenshots?.firstLoad),
    getString(screenshots?.preferencesCenter)
  ]);
}

function getReadableBannerText(value: string | null) {
  if (!value) {
    return null;
  }

  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length < 12) {
    return null;
  }
  if (/^(?:var|let|const|function|\{|window\.|!function|\()/i.test(compact)) {
    return null;
  }
  if (!/cookie|consent|tracking|advertising|personalized|preferences|reject|accept|manage/i.test(compact)) {
    return null;
  }

  return compact.slice(0, 240);
}

function buildDarkPatternDraft(input: {
  artifactPath: string;
  domain: string;
  scenario: ScenarioArtifact;
  scenarioName: string;
}) {
  const banner = getRecord(input.scenario.banner);
  const bannerPresent = getBoolean(banner?.bannerPresent);
  const bannerText = getString(banner?.bannerText);
  const readableBannerText = getReadableBannerText(bannerText);
  const actionSummary = getRecord(input.scenario.actionSummary);
  const rejectPath = getRecord(actionSummary?.rejectPath);
  const acceptPath = getRecord(actionSummary?.acceptPath);
  const rejectAttempted = getBoolean(rejectPath?.attempted);
  const acceptAttempted = getBoolean(acceptPath?.attempted);
  const artifactRefs = getBannerScreenshots(banner);

  if (bannerPresent !== true) {
    return null;
  }

  const rejectLabels = getStringArray(rejectPath?.labels);
  const acceptLabels = getStringArray(acceptPath?.labels);
  const consentText = [readableBannerText, ...rejectLabels, ...acceptLabels].join(" ");
  const looksLikeConsentSurface = /cookie|consent|tracking|advertising|personalized|preferences|reject|accept|manage/i.test(consentText);
  if (!looksLikeConsentSurface) {
    return null;
  }

  const findingId: PrivacyRuntimeFindingId =
    acceptLabels.length > 0 && rejectLabels.length === 0
      ? "accept_only_banner"
      : rejectAttempted === false && acceptAttempted === true
        ? "reject_button_missing"
        : "accept_more_prominent_than_reject";

  return {
    artifactPath: input.artifactPath,
    domain: input.domain,
    evidence: {
      artifactRefs,
      consentSurfaceObserved: true,
      uiFacts: uniqueStrings([
        "banner_present",
        rejectLabels.length === 0 ? "reject_label_not_observed" : null,
        acceptLabels.length > 0 ? "accept_label_observed" : null
      ]),
      visualFacts: readableBannerText ? [readableBannerText] : []
    },
    expected: {
      confidenceBand: "moderate",
      externalSurfacingEligibility: "eligible",
      presentationState: "review",
      promotionEligibility: "eligible"
    },
    findingGroup: "dark_pattern_consent",
    findingId,
    id: `live-dark-pattern-${input.domain}-${input.scenarioName}-${getArtifactRunSlug(input.artifactPath)}`,
    notes: "Live consent audit observed a banner/control asymmetry candidate. Review screenshot/text before promotion.",
    scenarioName: input.scenarioName,
    scenarioType: "positive_moderate",
    sourceKind: "live_artifact",
    sourceUrl: sanitizeSourceUrl(input.scenario.url)
  } satisfies PrivacyRuntimeDraft;
}

function mapReportFindingToDraft(input: {
  artifactPath: string;
  domain: string;
  finding: ReportFinding;
  report: SiteReportArtifact;
}) {
  const evidence = input.finding.evidence ?? {};
  const sourceUrl = sanitizeSourceUrl(evidence.pageUrls?.[0] ?? input.report.site?.startUrl ?? null);
  const requests = uniqueStrings((evidence.requests ?? []).map(sanitizeUrl));
  const screenshots = uniqueStrings(evidence.screenshots ?? []);
  const uiText = uniqueStrings(evidence.uiText ?? []);
  const observation = input.finding.observation ?? input.finding.conservativeWording ?? input.finding.title ?? "";
  const id = `live-report-${input.domain}-${input.finding.findingId ?? "unknown"}-${getArtifactRunSlug(input.artifactPath)}`;
  const confidenceScore = input.finding.confidenceScore ?? 0;

  switch (input.finding.findingId) {
    case "F001":
      return {
        artifactPath: input.artifactPath,
        domain: input.domain,
        evidence: {
          artifactRefs: screenshots,
          consentBannerDetectedMs: screenshots.length > 0 ? 12_000 : undefined,
          detectionSource: "live_consent_audit_report",
          requestUrls: requests.slice(0, 8),
          sequenceEvidence: requests.length > 0,
          vendorCategories: ["analytics", "advertising_marketing"],
          vendors: uniqueStrings(input.report.preConsentTrackingSummary?.likelyVendorsObserved ?? [])
        },
        expected: {
          confidenceBand: confidenceScore >= 0.8 ? "high" : "moderate",
          externalSurfacingEligibility: requests.length > 0 ? "eligible" : "audit_only",
          presentationState: requests.length > 0 ? "confirmed" : "review",
          promotionEligibility: requests.length > 0 ? "eligible" : "internal_only"
        },
        findingGroup: "preconsent_tracking",
        findingId: "preconsent_tracking",
        id,
        notes: `Report-level live audit finding: ${observation}`,
        scenarioName: "report",
        scenarioType: requests.length > 0 ? "positive_high_confidence" : "borderline_review",
        sourceKind: "live_artifact",
        sourceUrl
      } satisfies PrivacyRuntimeDraft;
    case "F002":
    case "F004":
      return {
        artifactPath: input.artifactPath,
        domain: input.domain,
        evidence: {
          artifactRefs: screenshots,
          consentSurfaceObserved: true,
          uiFacts: [input.finding.findingId === "F004" ? "optional_controls_preselected" : "reject_path_less_direct"],
          visualFacts: uiText
        },
        expected: {
          confidenceBand: "moderate",
          externalSurfacingEligibility: "eligible",
          presentationState: "review",
          promotionEligibility: "eligible"
        },
        findingGroup: "dark_pattern_consent",
        findingId: input.finding.findingId === "F004" ? "accept_more_prominent_than_reject" : "reject_button_missing",
        id,
        notes: `Report-level live audit finding: ${observation}`,
        scenarioName: "report",
        scenarioType: "positive_moderate",
        sourceKind: "live_artifact",
        sourceUrl
      } satisfies PrivacyRuntimeDraft;
    case "F003":
    case "F005":
      return {
        artifactPath: input.artifactPath,
        domain: input.domain,
        downgradeReason: "Report-level runtime effect evidence needs reviewer confirmation before corpus promotion.",
        evidence: {
          requestUrls: requests.slice(0, 8),
          sequenceEvidence: requests.length > 0,
          vendors: uniqueStrings(input.report.preConsentTrackingSummary?.likelyVendorsObserved ?? [])
        },
        expected: {
          confidenceBand: "moderate",
          externalSurfacingEligibility: "audit_only",
          presentationState: "review",
          promotionEligibility: "internal_only"
        },
        findingGroup: "preconsent_tracking",
        findingId: "preconsent_tracking",
        id,
        notes: `Report-level live audit finding: ${observation}`,
        scenarioName: "report",
        scenarioType: "borderline_review",
        sourceKind: "live_artifact",
        sourceUrl
      } satisfies PrivacyRuntimeDraft;
    default:
      return null;
  }
}

function loadDraftsFromReports(input: {
  artifactRoot: string;
  domains: string[];
  limit: number;
}) {
  const reportPaths = walkFiles(input.artifactRoot, "report.json");
  const drafts: PrivacyRuntimeDraft[] = [];

  for (const path of reportPaths) {
    const domain = inferDomainFromReportPath(path);
    if (input.domains.length > 0 && !input.domains.includes(domain)) {
      continue;
    }

    const report = readJsonFile(path) as SiteReportArtifact;
    const artifactPath = relative(process.cwd(), path);
    for (const finding of report.findings ?? []) {
      const draft = mapReportFindingToDraft({
        artifactPath,
        domain,
        finding,
        report
      });
      if (draft) {
        drafts.push(draft);
      }
      if (drafts.length >= input.limit) {
        return drafts;
      }
    }
  }

  return drafts;
}

function dedupeDrafts(drafts: PrivacyRuntimeDraft[]) {
  const seen = new Map<string, PrivacyRuntimeDraft>();

  for (const draft of drafts) {
    const key = `${draft.findingId}|${draft.domain}|${draft.scenarioName}|${JSON.stringify(draft.evidence)}`;
    if (!seen.has(key)) {
      seen.set(key, draft);
    }
  }

  return [...seen.values()];
}

async function fetchLiveUrl(url: string) {
  try {
    const response = await fetch(url, {
      headers: {
        "user-agent": "CertScore calibration review (+https://certscore.ai)",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      },
      redirect: "follow"
    });

    return {
      finalUrl: response.url,
      ok: response.ok,
      status: response.status
    };
  } catch {
    return {
      finalUrl: url,
      ok: false,
      status: 0
    };
  }
}

async function attachLiveFetch(drafts: PrivacyRuntimeDraft[]) {
  const cache = new Map<string, Awaited<ReturnType<typeof fetchLiveUrl>>>();

  for (const draft of drafts) {
    if (!draft.sourceUrl) {
      continue;
    }
    if (!cache.has(draft.sourceUrl)) {
      cache.set(draft.sourceUrl, await fetchLiveUrl(draft.sourceUrl));
    }
    draft.liveFetch = cache.get(draft.sourceUrl);
  }
}

function loadDraftsFromArtifactRoot(input: {
  artifactRoot: string;
  domains: string[];
  limit: number;
}) {
  const scenarioPaths = walkFiles(input.artifactRoot, "scenario.json");
  const drafts: PrivacyRuntimeDraft[] = [];

  for (const path of scenarioPaths) {
    const domain = inferDomainFromScenarioPath(path);
    if (input.domains.length > 0 && !input.domains.includes(domain)) {
      continue;
    }

    const scenario = readJsonFile(path) as ScenarioArtifact;
    const scenarioName = inferScenarioName(path);
    const artifactPath = relative(process.cwd(), path);
    const rawCandidates: Array<PrivacyRuntimeDraft | null> = [
      buildPreconsentPositiveDraft({ artifactPath, domain, scenario, scenarioName }),
      buildPreconsentNegativeDraft({ artifactPath, domain, scenario, scenarioName }),
      buildDarkPatternDraft({ artifactPath, domain, scenario, scenarioName })
    ];
    const candidates = rawCandidates.filter((draft): draft is PrivacyRuntimeDraft => Boolean(draft));

    drafts.push(...candidates);
    if (drafts.length >= input.limit) {
      break;
    }
  }

  const reportDrafts = loadDraftsFromReports(input);

  return dedupeDrafts([...reportDrafts, ...drafts]).slice(0, input.limit);
}

function renderDraftJson(drafts: PrivacyRuntimeDraft[]) {
  return JSON.stringify(drafts, null, 2);
}

function renderDraftMarkdown(drafts: PrivacyRuntimeDraft[], input: {
  artifactRoot: string;
  liveFetch: boolean;
}) {
  const rows = [
    "| Approval | ID | Domain | Finding | Scenario | Expected | Live URL |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...drafts.map((draft) =>
      [
        "pending",
        draft.id,
        draft.domain,
        `\`${draft.findingId}\``,
        `\`${draft.scenarioType}\``,
        `\`${draft.expected.presentationState}/${draft.expected.confidenceBand}\``,
        draft.liveFetch ? `${draft.liveFetch.status} ${draft.liveFetch.ok ? "ok" : "not-ok"}` : "not checked"
      ].join(" | ").replace(/^/, "| ").replace(/$/, " |")
    )
  ].join("\n");

  const sections = drafts.map((draft) =>
    [
      `## ${draft.id}`,
      "",
      "- approval: pending",
      `- domain: ${draft.domain}`,
      `- findingId: \`${draft.findingId}\``,
      `- findingGroup: \`${draft.findingGroup}\``,
      `- scenarioType: \`${draft.scenarioType}\``,
      `- sourceKind: \`${draft.sourceKind}\``,
      `- artifactPath: \`${draft.artifactPath}\``,
      draft.sourceUrl ? `- sourceUrl: ${draft.sourceUrl}` : null,
      draft.liveFetch ? `- liveFetch: ${draft.liveFetch.status} ${draft.liveFetch.finalUrl}` : null,
      draft.negativeControlReason ? `- negativeControlReason: ${draft.negativeControlReason}` : null,
      draft.downgradeReason ? `- downgradeReason: ${draft.downgradeReason}` : null,
      `- notes: ${draft.notes}`,
      "",
      "```json",
      JSON.stringify(
        {
          evidence: draft.evidence,
          expected: draft.expected
        },
        null,
        2
      ),
      "```",
      ""
    ]
      .filter((value): value is string => value !== null)
      .join("\n")
  );

  return [
    "# Privacy Runtime Draft Review",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Artifact root: \`${input.artifactRoot}\``,
    `Live fetch: ${input.liveFetch ? "on" : "off"}`,
    `Draft count: ${drafts.length}`,
    "",
    "## Summary",
    "",
    rows,
    "",
    ...sections
  ].join("\n");
}

function writeOutputFile(outputPath: string, content: string) {
  const absolutePath = resolve(outputPath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, content, "utf8");
  return absolutePath;
}

export async function runPrivacyRuntimeDraftExtraction() {
  const artifactRoot = getArgValue("--artifact-root")
    ? resolve(getArgValue("--artifact-root")!)
    : resolveDefaultArtifactRoot();
  const domains = getArgValues("--domain");
  const limit = Number.parseInt(getArgValue("--limit") ?? "30", 10);
  const outputPath = getArgValue("--output");
  const asJson = hasFlag("--json");
  const liveFetch = hasFlag("--live-fetch");

  if (!Number.isFinite(limit) || limit <= 0) {
    throw new Error(`Invalid --limit value: ${String(getArgValue("--limit"))}`);
  }

  const drafts = loadDraftsFromArtifactRoot({
    artifactRoot,
    domains,
    limit
  });

  if (liveFetch) {
    await attachLiveFetch(drafts);
  }

  const rendered = asJson ? renderDraftJson(drafts) : renderDraftMarkdown(drafts, { artifactRoot, liveFetch });

  if (outputPath) {
    const absolutePath = writeOutputFile(outputPath, rendered);
    console.error(`wrote ${drafts.length} privacy runtime drafts to ${absolutePath}`);
    return;
  }

  console.log(rendered);
}

if (require.main === module) {
  runPrivacyRuntimeDraftExtraction().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
