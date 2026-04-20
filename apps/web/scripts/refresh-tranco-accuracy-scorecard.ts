import fs from "node:fs";
import path from "node:path";

const DEFAULT_OUTPUT_DIR = path.resolve(process.cwd(), "tmp/tranco-calibration");
const LEDGER_PATH = "accuracy-review-ledger.jsonl";
const SCORECARD_JSON_PATH = "accuracy-scorecard.json";
const SCORECARD_MD_PATH = "accuracy-scorecard.md";
const TARGET_PRECISION = 0.95;

type ReviewSheetRow = {
  certscore_findings: string;
  direct_review_findings: string;
  domain: string;
  mismatch_type: string;
  notes: string;
  rank: string;
  scan_id: string;
  segment_guess: string;
  status: string;
};

type LedgerVerdict = "correct" | "excluded" | "unknown";
type LedgerEntry = {
  batchId: string;
  domain: string;
  findingId: string;
  mismatchType: string;
  notes: string;
  rank: number | null;
  scoreIncluded: boolean;
  status: string;
  url: string | null;
  verdict: LedgerVerdict;
};

type FamilyScore = {
  correct: number;
  excluded: number;
  falsePositive: number;
  findingId: string;
  meetsTarget: boolean;
  precision: number | null;
  reviewedCount: number;
  targetPrecision: number;
  unknown: number;
  wrongUrl: number;
};

function getArgValue(flag: string) {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return null;
  }

  return process.argv[index + 1] ?? null;
}

function readFileIfExists(filePath: string) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (character === "\"") {
      const next = line[index + 1];
      if (inQuotes && next === "\"") {
        current += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (character === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += character;
  }

  values.push(current);
  return values;
}

function parseCsv(filePath: string) {
  const raw = readFileIfExists(filePath);
  if (!raw) {
    return [] as ReviewSheetRow[];
  }

  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean);

  if (lines.length === 0) {
    return [] as ReviewSheetRow[];
  }

  const headers = parseCsvLine(lines[0] ?? "");

  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row = Object.create(null) as Record<string, string>;

    headers.forEach((header, index) => {
      row[header] = values[index] ?? "";
    });

    return row as ReviewSheetRow;
  });
}

function parseLedger(filePath: string) {
  const raw = readFileIfExists(filePath);
  if (!raw) {
    return [] as LedgerEntry[];
  }

  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      const entry = JSON.parse(line) as LedgerEntry;
      if (!entry.findingId.includes("|")) {
        return [entry];
      }

      return entry.findingId
        .split(/\s*\|\s*/)
        .map((findingId) => findingId.trim())
        .filter(Boolean)
        .map((findingId) => ({
          ...entry,
          findingId
        }));
    });
}

function parseFindings(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return [] as Array<{ findingId: string; url: string | null }>;
  }

  return trimmed
    .split(/\s*\|\s*/)
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => {
      if (token === "none surfaced") {
        return {
          findingId: "none surfaced",
          url: null
        };
      }

      const match = token.match(/^([^:]+):(https?:\/\/.+)$/i);
      if (match) {
        return {
          findingId: match[1]!.trim(),
          url: match[2]!.trim()
        };
      }

      return {
        findingId: token,
        url: null
      };
    });
}

function buildLedgerKey(entry: Pick<LedgerEntry, "batchId" | "domain" | "findingId" | "status">) {
  return [entry.batchId, entry.domain, entry.findingId, entry.status].join("::");
}

function compareLedgerEntries(a: LedgerEntry, b: LedgerEntry) {
  return (
    a.batchId.localeCompare(b.batchId) ||
    (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER) ||
    a.domain.localeCompare(b.domain) ||
    a.findingId.localeCompare(b.findingId)
  );
}

function buildSafeLedgerEntries(input: {
  batchId: string;
  row: ReviewSheetRow;
}) {
  const findings = parseFindings(input.row.certscore_findings);
  const rank = Number.isFinite(Number(input.row.rank)) ? Number(input.row.rank) : null;

  if (input.row.status === "runtime_blocked_exclusion") {
    return findings.map<LedgerEntry>((finding) => ({
      batchId: input.batchId,
      domain: input.row.domain,
      findingId: finding.findingId,
      mismatchType: input.row.mismatch_type || "excluded_blocked_scan",
      notes: input.row.notes,
      rank,
      scoreIncluded: false,
      status: input.row.status,
      url: finding.url,
      verdict: "excluded"
    }));
  }

  if (input.row.status === "clean_match") {
    if (findings.length === 0 || (findings.length === 1 && findings[0]?.findingId === "none surfaced")) {
      return [
        {
          batchId: input.batchId,
          domain: input.row.domain,
          findingId: "none surfaced",
          mismatchType: input.row.mismatch_type || "none",
          notes: input.row.notes,
          rank,
          scoreIncluded: false,
          status: input.row.status,
          url: null,
          verdict: "excluded"
        } satisfies LedgerEntry
      ];
    }

    return findings.map<LedgerEntry>((finding) => ({
      batchId: input.batchId,
      domain: input.row.domain,
      findingId: finding.findingId,
      mismatchType: input.row.mismatch_type || "none",
      notes: input.row.notes,
      rank,
      scoreIncluded: true,
      status: input.row.status,
      url: finding.url,
      verdict: "correct"
    }));
  }

  return [] as LedgerEntry[];
}

function formatPercent(value: number | null) {
  if (value === null) {
    return "n/a";
  }

  return `${(value * 100).toFixed(1)}%`;
}

function buildScorecard(entries: LedgerEntry[], representedBatches: string[]) {
  const familyMap = new Map<string, FamilyScore>();

  for (const entry of entries) {
    const family =
      familyMap.get(entry.findingId) ??
      ({
        correct: 0,
        excluded: 0,
        falsePositive: 0,
        findingId: entry.findingId,
        meetsTarget: false,
        precision: null,
        reviewedCount: 0,
        targetPrecision: TARGET_PRECISION,
        unknown: 0,
        wrongUrl: 0
      } satisfies FamilyScore);

    if (entry.scoreIncluded && entry.verdict === "correct") {
      family.correct += 1;
    } else if (entry.verdict === "unknown") {
      family.unknown += 1;
    } else {
      family.excluded += 1;
    }

    if (entry.scoreIncluded && entry.mismatchType === "wrong_url") {
      family.wrongUrl += 1;
    } else if (entry.scoreIncluded && entry.mismatchType === "false_positive") {
      family.falsePositive += 1;
    }

    familyMap.set(entry.findingId, family);
  }

  const families = [...familyMap.values()]
    .map((family) => {
      const reviewedCount = family.correct + family.wrongUrl + family.falsePositive;
      const precision = reviewedCount > 0 ? family.correct / reviewedCount : null;

      return {
        ...family,
        meetsTarget: precision !== null ? precision >= TARGET_PRECISION : false,
        precision,
        reviewedCount
      };
    })
    .sort((a, b) => {
      if (a.precision === null && b.precision !== null) {
        return 1;
      }
      if (a.precision !== null && b.precision === null) {
        return -1;
      }

      return a.findingId.localeCompare(b.findingId);
    });

  const overall = families.reduce(
    (acc, family) => {
      acc.correct += family.correct;
      acc.falsePositive += family.falsePositive;
      acc.wrongUrl += family.wrongUrl;
      return acc;
    },
    {
      correct: 0,
      falsePositive: 0,
      wrongUrl: 0
    }
  );

  const countedFindings = overall.correct + overall.falsePositive + overall.wrongUrl;
  const precision = countedFindings > 0 ? overall.correct / countedFindings : null;

  const representedDomains = new Set<string>();
  for (const batchId of representedBatches) {
    const sheetPath = path.join(DEFAULT_OUTPUT_DIR, batchId, "review-sheet.csv");
    for (const row of parseCsv(sheetPath)) {
      representedDomains.add(row.domain);
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    reviewBatchCount: representedBatches.length,
    reviewedDomainCount: representedDomains.size,
    families,
    notes: [
      "Precision is calculated conservatively from reviewed surfaced findings only.",
      "Rows marked scanner_discovery_backlog or runtime_blocked_exclusion are excluded from the score denominator.",
      "partial_match rows count surfaced findings as correct for precision only when they were already curated into the ledger; un-ingested partial rows remain outside the denominator until reviewed.",
      "wrong_url and false_positive rows only count against a finding family when that finding id is explicitly represented in the ledger."
    ],
    overall: {
      countedFindings,
      correct: overall.correct,
      falsePositive: overall.falsePositive,
      wrongUrl: overall.wrongUrl,
      precision,
      targetPrecision: TARGET_PRECISION,
      meetsTarget: precision !== null ? precision >= TARGET_PRECISION : false
    }
  };
}

function renderMarkdown(scorecard: ReturnType<typeof buildScorecard>) {
  const familyRows = scorecard.families
    .map(
      (family) =>
        `| ${family.findingId} | ${formatPercent(family.precision)} | ${family.correct} | ${family.wrongUrl} | ${family.falsePositive} | ${family.excluded} | ${family.unknown} | ${family.meetsTarget ? "yes" : "no"} |`
    )
    .join("\n");

  return `# Calibration Accuracy Scorecard

Generated: ${scorecard.generatedAt}
Review batches: ${scorecard.reviewBatchCount}
Reviewed domains: ${scorecard.reviewedDomainCount}
Overall precision target: ${(TARGET_PRECISION * 100).toFixed(1)}%
Overall measured precision: ${formatPercent(scorecard.overall.precision)}

## Family Precision

| Finding | Precision | Correct | Wrong URL | False Positive | Excluded | Unknown | Target Met |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
${familyRows}

## Notes

${scorecard.notes.map((note) => `- ${note}`).join("\n")}
`;
}

function writeJsonl(filePath: string, entries: LedgerEntry[]) {
  fs.writeFileSync(filePath, `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`);
}

async function main() {
  const outputDir = path.resolve(getArgValue("--out-dir") ?? DEFAULT_OUTPUT_DIR);
  const ledgerPath = path.join(outputDir, LEDGER_PATH);
  const existingEntries = parseLedger(ledgerPath);
  const existingKeys = new Set(existingEntries.map((entry) => buildLedgerKey(entry)));

  const reviewBatchDirs = fs
    .readdirSync(outputDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^review-batch-/.test(entry.name))
    .map((entry) => entry.name)
    .sort();

  const appendedEntries: LedgerEntry[] = [];
  const skippedRows: Array<{ batchId: string; domain: string; mismatchType: string; status: string }> = [];

  for (const batchId of reviewBatchDirs) {
    const rows = parseCsv(path.join(outputDir, batchId, "review-sheet.csv"));

    for (const row of rows) {
      const safeEntries = buildSafeLedgerEntries({
        batchId,
        row
      });

      if (safeEntries.length === 0 && row.status !== "queued") {
        skippedRows.push({
          batchId,
          domain: row.domain,
          mismatchType: row.mismatch_type,
          status: row.status
        });
      }

      for (const entry of safeEntries) {
        const key = buildLedgerKey(entry);
        if (existingKeys.has(key)) {
          continue;
        }

        existingKeys.add(key);
        appendedEntries.push(entry);
      }
    }
  }

  const mergedEntries = [...existingEntries, ...appendedEntries].sort(compareLedgerEntries);
  const representedBatches = [...new Set(mergedEntries.map((entry) => entry.batchId))].sort();
  const scorecard = buildScorecard(mergedEntries, representedBatches);

  writeJsonl(ledgerPath, mergedEntries);
  fs.writeFileSync(path.join(outputDir, SCORECARD_JSON_PATH), `${JSON.stringify(scorecard, null, 2)}\n`);
  fs.writeFileSync(path.join(outputDir, SCORECARD_MD_PATH), `${renderMarkdown(scorecard)}\n`);

  console.log(
    JSON.stringify(
      {
        appendedEntryCount: appendedEntries.length,
        outputDir,
        representedBatches,
        scorecard,
        skippedRows
      },
      null,
      2
    )
  );
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
