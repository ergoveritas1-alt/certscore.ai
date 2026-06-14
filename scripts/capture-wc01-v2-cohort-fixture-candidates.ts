import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { canonicalEvidenceBundleSchema } from "../packages/certscore-contracts/src/index";

type Args = {
  domains?: string[];
  help?: boolean;
  max?: number;
  outDir?: string;
  summaryPath?: string;
};

type CohortSummary = {
  input?: {
    outDir?: string;
  };
  results?: CohortResult[];
};

type CohortResult = {
  cohort?: string;
  domain?: string;
  eligibleFindingKeys?: string[];
  headedFallbackUsed?: boolean;
  index?: number;
  runtime?: {
    coverageStatus?: string;
    preConsentTrackingObserved?: boolean | null;
    sessionReplayOrBehavioralAnalyticsObserved?: boolean | null;
    thirdPartyCookiesPreConsentObserved?: boolean | null;
  };
  status?: string;
  url?: string;
};

type CapturedFixtureCandidate = {
  copiedTo: string;
  domain: string;
  eligibleFindingKeys: string[];
  headedFallbackUsed: boolean;
  index?: number;
  reason: string;
  runtimeCoverageStatus?: string;
  sourceBundlePath: string;
  sourceCohort?: string;
};

type CaptureManifest = {
  capturedAt: string;
  captureVersion: "wc01.v2_scan_lab_cohort_fixture_candidates.1";
  candidates: CapturedFixtureCandidate[];
  guardrailPosture: string[];
  input: {
    domains?: string[];
    max?: number;
    outDir: string;
    summaryPath: string;
  };
  skipped: Array<{
    domain: string;
    reason: string;
  }>;
};

const DEFAULT_DOMAINS = [
  "ford.com",
  "nytimes.com",
  "bbc.com",
  "hotjar.com",
  "linear.app",
];

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const summaryPath = args.summaryPath ?? (await findLatestSummaryPath());
  const summary = await readJson<CohortSummary>(summaryPath);
  const outDir = args.outDir ?? path.join(
    "./artifacts",
    `v2-scan-lab-cohort-fixture-candidates-${formatRunTimestamp(new Date())}`,
  );
  await mkdir(outDir, { recursive: true });

  const selected = selectCandidates(summary.results ?? [], args);
  const candidates: CapturedFixtureCandidate[] = [];
  const skipped: CaptureManifest["skipped"] = [];

  for (const selection of selected) {
    const domain = selection.result.domain ?? hostnameFromUrl(selection.result.url) ?? "unknown-domain";
    const sourceBundlePath = await findSourceBundlePath(selection.result);
    if (!sourceBundlePath) {
      skipped.push({ domain, reason: "canonical evidence bundle artifact not found" });
      continue;
    }

    const raw = await readJson<unknown>(sourceBundlePath);
    canonicalEvidenceBundleSchema.parse(raw);

    const fileName = `${safeSlug(domain)}.CanonicalEvidenceBundle.json`;
    const copiedTo = path.join(outDir, fileName);
    await copyFile(sourceBundlePath, copiedTo);
    candidates.push({
      copiedTo,
      domain,
      eligibleFindingKeys: [...(selection.result.eligibleFindingKeys ?? [])].sort(),
      headedFallbackUsed: selection.result.headedFallbackUsed === true,
      index: selection.result.index,
      reason: selection.reason,
      runtimeCoverageStatus: selection.result.runtime?.coverageStatus,
      sourceBundlePath,
      sourceCohort: selection.result.cohort,
    });
  }

  const manifest: CaptureManifest = {
    capturedAt: new Date().toISOString(),
    captureVersion: "wc01.v2_scan_lab_cohort_fixture_candidates.1",
    candidates,
    guardrailPosture: [
      "captures schema-valid v2 CanonicalEvidenceBundle artifacts only",
      "does not mutate packages/certscore-contracts/fixtures/saved-bundles",
      "does not persist normalized concerns or unified findings",
      "does not update customer-facing reports, scoring, checklist rows, or regulatory lenses",
    ],
    input: {
      domains: args.domains,
      max: args.max,
      outDir,
      summaryPath,
    },
    skipped,
  };

  const manifestJsonPath = path.join(outDir, "Wc01V2ScanLabCohort.fixture-candidates.json");
  const manifestMarkdownPath = path.join(outDir, "Wc01V2ScanLabCohort.fixture-candidates.md");
  await writeFile(manifestJsonPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await writeFile(manifestMarkdownPath, renderMarkdown(manifest), "utf8");

  console.log(`Captured ${candidates.length} v2 cohort fixture candidate(s).`);
  console.log(`Wrote ${manifestJsonPath}`);
  console.log(`Wrote ${manifestMarkdownPath}`);
  if (skipped.length > 0) {
    console.log(`Skipped ${skipped.length} candidate(s); see manifest.`);
  }
}

function selectCandidates(results: CohortResult[], args: Args) {
  const completed = results.filter((result) => result.status === "completed");
  const selections: Array<{ reason: string; result: CohortResult }> = [];
  const seen = new Set<string>();
  const requestedDomains = args.domains ?? DEFAULT_DOMAINS;

  for (const domain of requestedDomains) {
    const result = completed.find((item) => sameDomain(item, domain));
    if (result) {
      pushSelection(selections, seen, result, `named control: ${domain}`);
    }
  }

  const limitedCoverage = completed.find((result) =>
    result.runtime?.coverageStatus === "limited_none" || result.runtime?.coverageStatus === "limited_partial",
  );
  if (limitedCoverage) {
    pushSelection(selections, seen, limitedCoverage, "runtime coverage limitation control");
  }

  const sessionReplay = completed.find((result) =>
    result.runtime?.sessionReplayOrBehavioralAnalyticsObserved === true,
  );
  if (sessionReplay) {
    pushSelection(selections, seen, sessionReplay, "session replay or behavioral analytics control");
  }

  const tracking = completed.find((result) => result.runtime?.preConsentTrackingObserved === true);
  if (tracking) {
    pushSelection(selections, seen, tracking, "pre-consent tracking control");
  }

  const quiet = completed.find((result) =>
    result.runtime?.preConsentTrackingObserved === false &&
    result.runtime?.thirdPartyCookiesPreConsentObserved === false &&
    result.runtime?.sessionReplayOrBehavioralAnalyticsObserved === false,
  );
  if (quiet) {
    pushSelection(selections, seen, quiet, "low-signal control");
  }

  return typeof args.max === "number" ? selections.slice(0, args.max) : selections;
}

function pushSelection(
  selections: Array<{ reason: string; result: CohortResult }>,
  seen: Set<string>,
  result: CohortResult,
  reason: string,
) {
  const domain = result.domain ?? hostnameFromUrl(result.url) ?? result.url;
  if (!domain || seen.has(domain)) {
    return;
  }
  seen.add(domain);
  selections.push({ reason, result });
}

async function findSourceBundlePath(result: CohortResult) {
  const domain = result.domain ?? hostnameFromUrl(result.url);
  if (!domain || !result.cohort) {
    return null;
  }
  const directPath = path.join(
    process.cwd(),
    "artifacts",
    `v2-calibration-${result.cohort}`,
    domain,
    "CanonicalEvidenceBundle.json",
  );
  if (existsSync(directPath)) {
    return directPath;
  }
  return findBundleByDomain(domain);
}

async function findBundleByDomain(domain: string) {
  const artifactsDir = path.join(process.cwd(), "artifacts");
  if (!existsSync(artifactsDir)) {
    return null;
  }
  const entries = await readdir(artifactsDir, { withFileTypes: true });
  const candidates = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && entry.name.startsWith("v2-calibration-"))
      .map(async (entry) => {
        const candidate = path.join(artifactsDir, entry.name, domain, "CanonicalEvidenceBundle.json");
        if (!existsSync(candidate)) {
          return null;
        }
        const stats = await stat(candidate);
        return { bundlePath: candidate, mtimeMs: stats.mtimeMs };
      }),
  );
  return candidates
    .filter((candidate): candidate is { bundlePath: string; mtimeMs: number } => Boolean(candidate))
    .sort((left, right) => right.mtimeMs - left.mtimeMs)[0]?.bundlePath ?? null;
}

async function findLatestSummaryPath() {
  const artifactsDir = path.join(process.cwd(), "artifacts");
  const entries = await readdir(artifactsDir, { withFileTypes: true });
  const candidates = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && entry.name.startsWith("v2-scan-lab-cohort-"))
      .map(async (entry) => {
        const summaryPath = path.join(artifactsDir, entry.name, "Wc01V2ScanLabCohort.summary.json");
        if (!existsSync(summaryPath)) {
          return null;
        }
        const stats = await stat(summaryPath);
        return { mtimeMs: stats.mtimeMs, summaryPath };
      }),
  );
  const latest = candidates
    .filter((candidate): candidate is { mtimeMs: number; summaryPath: string } => Boolean(candidate))
    .sort((left, right) => right.mtimeMs - left.mtimeMs)[0];
  if (!latest) {
    throw new Error("No cohort summary found. Pass --summary <path> or run pnpm v2:wc01-scan-lab-cohort first.");
  }
  return latest.summaryPath;
}

function sameDomain(result: CohortResult, domain: string) {
  return result.domain === domain || hostnameFromUrl(result.url) === domain;
}

function hostnameFromUrl(value: string | undefined) {
  if (!value) {
    return null;
  }
  try {
    return new URL(value.includes("://") ? value : `https://${value}`).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function renderMarkdown(manifest: CaptureManifest) {
  return [
    "# WC01 v2 Scan Lab Fixture Candidates",
    "",
    "Internal diagnostic only. Candidate capture only. Not customer-facing report output.",
    "",
    `- Candidates: ${manifest.candidates.length}`,
    `- Skipped: ${manifest.skipped.length}`,
    `- Summary: ${manifest.input.summaryPath}`,
    "",
    "## Candidates",
    "",
    "| Domain | Reason | Coverage | Eligible Keys | Copied To |",
    "|---|---|---|---|---|",
    ...manifest.candidates.map((candidate) => [
      candidate.domain,
      candidate.reason,
      candidate.runtimeCoverageStatus ?? "",
      candidate.eligibleFindingKeys.join(", "),
      candidate.copiedTo,
    ].map(escapeMarkdownCell).join(" | ").replace(/^/, "| ").replace(/$/, " |")),
    "",
    "## Skipped",
    "",
    ...manifest.skipped.map((item) => `- ${item.domain}: ${item.reason}`),
    ...(manifest.skipped.length === 0 ? ["- None"] : []),
    "",
    "## Guardrail Posture",
    "",
    ...manifest.guardrailPosture.map((item) => `- ${item}`),
    "",
  ].join("\n");
}

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) {
      continue;
    }
    if (arg === "--summary") {
      args.summaryPath = requiredValue(argv, ++index, arg);
    } else if (arg === "--out-dir") {
      args.outDir = requiredValue(argv, ++index, arg);
    } else if (arg === "--domains") {
      args.domains = requiredValue(argv, ++index, arg)
        .split(",")
        .map((domain) => domain.trim())
        .filter(Boolean);
    } else if (arg === "--max") {
      args.max = parsePositiveInteger(requiredValue(argv, ++index, arg), arg);
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}\n\n${usage()}`);
    }
  }
  return args;
}

function usage() {
  return [
    "Usage:",
    "  pnpm v2:wc01-capture-cohort-fixtures [--summary <path>] [--out-dir <dir>]",
    "                                         [--domains ford.com,nytimes.com] [--max <n>]",
    "",
    "Copies representative schema-valid CanonicalEvidenceBundle artifacts from a v2 Scan Lab cohort.",
    "The saved-bundle fixture corpus is not changed by this command.",
    "",
    "Artifact-only. Non-persistent. Not implementation approval. Not customer-facing report output.",
  ].join("\n");
}

function requiredValue(argv: string[], index: number, flag: string) {
  const value = argv[index];
  if (!value) {
    throw new Error(`Missing value for ${flag}.`);
  }
  return value;
}

function parsePositiveInteger(value: string, flag: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`Expected ${flag} to be a positive integer.`);
  }
  return parsed;
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

function safeSlug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9.-]+/g, "-").replace(/^-+|-+$/g, "") || "unknown-domain";
}

function escapeMarkdownCell(value: unknown) {
  return String(value).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function formatRunTimestamp(date: Date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
