import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type ExpansionWave = 1 | 2;

type ExpansionEntry = {
  expectedLanes: string[];
  notes: string;
  primaryBucket: string;
  sector: string;
  seedUrls?: {
    privacyOptOut?: string[];
  };
  url: string;
  wave: ExpansionWave;
};

type ExpansionManifest = {
  commands: {
    combinedDryRun: string;
    wave1FullCapture: string;
    wave1QuickQualification: string;
    wave2FullCapture: string;
    wave2QuickQualification: string;
  };
  generatedAt: string;
  inputPath: string;
  outputPaths: {
    combinedUrls: string;
    manifestJson: string;
    readme: string;
    wave1Urls: string;
    wave2Urls: string;
  };
  summary: {
    bucketCounts: Record<string, number>;
    sectorCounts: Record<string, number>;
    total: number;
    waveCounts: Record<string, number>;
  };
  waves: Record<string, ExpansionEntry[]>;
};

const DEFAULT_INPUT = path.join("docs", "certscore-v2", "gold-corpus-expansion-50.jsonl");
const DEFAULT_OUT_DIR = path.join("docs", "certscore-v2", "gold-corpus-expansion-50");
const EXPECTED_TOTAL = 50;
const EXPECTED_WAVE_SIZE = 25;
const REQUIRED_BUCKET_MINIMUMS: Record<string, number> = {
  complex_reject_flow: 10,
  gpc_behavior: 6,
  no_banner_control: 6,
  privacy_opt_out_dnsmpi: 14,
  sensitive_context_privacy: 8,
};

function getArg(name: string) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return null;
  }
  return process.argv[index + 1] ?? null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function normalizeUrl(value: string) {
  const parsed = new URL(value);
  parsed.hash = "";
  return parsed.toString();
}

function normalizeHost(value: string) {
  return new URL(value).hostname.replace(/^www\./i, "").toLowerCase();
}

async function readEntries(inputPath: string) {
  const raw = await readFile(inputPath, "utf8");
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map((line, index) => parseEntry(line, index + 1));
}

function parseEntry(line: string, lineNumber: number): ExpansionEntry {
  const parsed = JSON.parse(line) as unknown;
  if (!isRecord(parsed)) {
    throw new Error(`Line ${lineNumber} must be a JSON object.`);
  }
  const wave = parsed.wave;
  if (wave !== 1 && wave !== 2) {
    throw new Error(`Line ${lineNumber} has invalid wave: ${String(wave)}`);
  }
  const url = typeof parsed.url === "string" ? normalizeUrl(parsed.url) : "";
  if (!url) {
    throw new Error(`Line ${lineNumber} is missing a valid url.`);
  }
  const seedUrls = isRecord(parsed.seedUrls) ? parsed.seedUrls : {};
  return {
    expectedLanes: asStringArray(parsed.expectedLanes),
    notes: typeof parsed.notes === "string" ? parsed.notes : "",
    primaryBucket: typeof parsed.primaryBucket === "string" ? parsed.primaryBucket : "unknown",
    sector: typeof parsed.sector === "string" ? parsed.sector : "unknown",
    seedUrls: {
      privacyOptOut: asStringArray(seedUrls.privacyOptOut).map(normalizeUrl),
    },
    url,
    wave,
  };
}

function validateEntries(entries: ExpansionEntry[]) {
  if (entries.length !== EXPECTED_TOTAL) {
    throw new Error(`Expected ${EXPECTED_TOTAL} expansion entries, found ${entries.length}.`);
  }
  const urls = new Set(entries.map((entry) => entry.url));
  if (urls.size !== entries.length) {
    throw new Error(`Expected unique URLs, found ${entries.length - urls.size} duplicate(s).`);
  }
  const hosts = new Set(entries.map((entry) => normalizeHost(entry.url)));
  if (hosts.size !== entries.length) {
    throw new Error(`Expected unique hosts, found ${entries.length - hosts.size} duplicate host(s).`);
  }

  const waveCounts = countBy(entries, (entry) => String(entry.wave));
  for (const wave of ["1", "2"]) {
    if ((waveCounts[wave] ?? 0) !== EXPECTED_WAVE_SIZE) {
      throw new Error(`Expected wave ${wave} to contain ${EXPECTED_WAVE_SIZE} entries, found ${waveCounts[wave] ?? 0}.`);
    }
  }

  const bucketCounts = countBy(entries, (entry) => entry.primaryBucket);
  for (const [bucket, minimum] of Object.entries(REQUIRED_BUCKET_MINIMUMS)) {
    if ((bucketCounts[bucket] ?? 0) < minimum) {
      throw new Error(`Expected bucket ${bucket} to contain at least ${minimum} entries, found ${bucketCounts[bucket] ?? 0}.`);
    }
  }
}

function countBy<T>(items: T[], getKey: (item: T) => string) {
  return items.reduce<Record<string, number>>((counts, item) => {
    const key = getKey(item);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function toCohortJsonLine(entry: ExpansionEntry) {
  return JSON.stringify({
    expectedLanes: entry.expectedLanes,
    notes: entry.notes,
    primaryBucket: entry.primaryBucket,
    sector: entry.sector,
    seedUrls: entry.seedUrls,
    url: entry.url,
  });
}

function renderReadme(manifest: ExpansionManifest) {
  const lines = [
    "# V2 Gold Corpus Expansion 50",
    "",
    "This is an internal v2 diagnostic expansion plan. It writes local artifacts only and does not create production report output, checklist rows, scoring, persisted concerns, unified findings, or customer-facing copy.",
    "",
    "The 50 candidates are split into two 25-site waves. Treat them as qualification targets first; a site becomes gold-corpus coverage only after capture, replay evidence generation, and quality review.",
    "",
    "## Summary",
    "",
    `- Total candidates: ${manifest.summary.total}`,
    `- Wave 1: ${manifest.summary.waveCounts["1"] ?? 0}`,
    `- Wave 2: ${manifest.summary.waveCounts["2"] ?? 0}`,
    "",
    "Bucket counts:",
    "",
    ...Object.entries(manifest.summary.bucketCounts)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([bucket, count]) => `- ${bucket}: ${count}`),
    "",
    "## Run Order",
    "",
    "Start with quick qualification, then run full replay capture for the entries that complete cleanly or are intentionally useful no-go controls.",
    "",
    "```bash",
    manifest.commands.wave1QuickQualification,
    manifest.commands.wave1FullCapture,
    "",
    manifest.commands.wave2QuickQualification,
    manifest.commands.wave2FullCapture,
    "```",
    "",
    "Use `--resume` for interrupted runs. The cohort runner preserves seeded privacy-control URLs from these JSONL lines.",
    "",
    "## Acceptance Checks",
    "",
    "- Compare `legacy_sequential` and `planned_parallel` where applicable before promoting any site into default gates.",
    "- Confirm no new production-facing outputs are created.",
    "- Review not-testable and not-observed changes separately from true regressions.",
    "- Promote only entries that add marginal lane, sector, CMP, GPC, privacy-control, no-banner, or sensitive-context value.",
    "",
  ];
  return `${lines.join("\n")}\n`;
}

async function main() {
  const inputPath = getArg("--input") ?? DEFAULT_INPUT;
  const outDir = getArg("--out-dir") ?? DEFAULT_OUT_DIR;
  const entries = await readEntries(inputPath);
  validateEntries(entries);

  const wave1 = entries.filter((entry) => entry.wave === 1);
  const wave2 = entries.filter((entry) => entry.wave === 2);
  const outputPaths = {
    combinedUrls: path.join(outDir, "all.urls.txt"),
    manifestJson: path.join(outDir, "manifest.json"),
    readme: path.join(outDir, "README.md"),
    wave1Urls: path.join(outDir, "wave-1.urls.txt"),
    wave2Urls: path.join(outDir, "wave-2.urls.txt"),
  };
  const commands = {
    combinedDryRun: `pnpm v2:wc01-scan-lab-cohort --urls ${outputPaths.combinedUrls} --profile full --dry-run`,
    wave1FullCapture: `pnpm v2:wc01-scan-lab-cohort --urls ${outputPaths.wave1Urls} --profile full --capture-replay --consent-dag --resume --out-dir artifacts/v2-gold-expansion-wave-1-full`,
    wave1QuickQualification: `pnpm v2:wc01-scan-lab-cohort --urls ${outputPaths.wave1Urls} --profile standard --resume --out-dir artifacts/v2-gold-expansion-wave-1-qualify`,
    wave2FullCapture: `pnpm v2:wc01-scan-lab-cohort --urls ${outputPaths.wave2Urls} --profile full --capture-replay --consent-dag --resume --out-dir artifacts/v2-gold-expansion-wave-2-full`,
    wave2QuickQualification: `pnpm v2:wc01-scan-lab-cohort --urls ${outputPaths.wave2Urls} --profile standard --resume --out-dir artifacts/v2-gold-expansion-wave-2-qualify`,
  };
  const manifest: ExpansionManifest = {
    commands,
    generatedAt: new Date().toISOString(),
    inputPath,
    outputPaths,
    summary: {
      bucketCounts: countBy(entries, (entry) => entry.primaryBucket),
      sectorCounts: countBy(entries, (entry) => entry.sector),
      total: entries.length,
      waveCounts: countBy(entries, (entry) => String(entry.wave)),
    },
    waves: {
      "1": wave1,
      "2": wave2,
    },
  };

  await mkdir(outDir, { recursive: true });
  await writeFile(outputPaths.wave1Urls, `${wave1.map(toCohortJsonLine).join("\n")}\n`);
  await writeFile(outputPaths.wave2Urls, `${wave2.map(toCohortJsonLine).join("\n")}\n`);
  await writeFile(outputPaths.combinedUrls, `${entries.map(toCohortJsonLine).join("\n")}\n`);
  await writeFile(outputPaths.manifestJson, `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(outputPaths.readme, renderReadme(manifest));

  console.log(JSON.stringify({
    bucketCounts: manifest.summary.bucketCounts,
    outDir,
    total: manifest.summary.total,
    waveCounts: manifest.summary.waveCounts,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
