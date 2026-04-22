import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { query } from "@website-signal-risk-scanner/db";
import {
  buildFinancialCommercialClaimsDraft,
  formatFinancialCommercialClaimsDraftExample,
  type FinancialCommercialClaimsDraft,
  type FinancialCommercialClaimsDraftInput
} from "@website-signal-risk-scanner/validation-shared";

const LEGACY_DATASET_PATH = "/Users/benmasek/WC01/packages/validation-shared/legacy/financial-commercial-claims.dataset.js";

type FindingRow = {
  created_at: string;
  evidence_json: Record<string, unknown> | null;
  hostname: string;
  page_url: string | null;
  rule_key: string;
  scan_id: string;
  title: string;
  validation_run_id: string;
};

const NON_PROMOTABLE_FINANCIAL_RULES = new Set([
  "financial_review.apr_or_interest_rate_disclosure_present",
  "financial_review.fee_disclosure_present",
  "financial_review.investment_risk_disclosure_present",
  "financial_review.legal_entity_name_present",
  "financial_review.operator_contact_path_present",
  "financial_review.past_performance_disclaimer_present"
]);

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

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => value?.replace(/\s+/g, " ").trim() ?? "").filter((value) => value.length > 0))];
}

function decodeHtml(text: string) {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'");
}

function stripHtmlToText(html: string) {
  return decodeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<\/?(?:section|article|div|li|p|main|aside|footer|header|nav|table|tr|td|th|ul|ol|br|h[1-6]|a|button|span)[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function splitTextIntoCandidateBlocks(text: string) {
  return text
    .split("\n")
    .map((entry) => entry.replace(/\s+/g, " ").trim())
    .filter((entry) => entry.length >= 24);
}

function getString(record: Record<string, unknown> | null | undefined, key: string) {
  const value = record?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function getStringArray(record: Record<string, unknown> | null | undefined, key: string) {
  const value = record?.[key];
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return value
    .map((entry) => (typeof entry === "string" ? entry.replace(/\s+/g, " ").trim() : ""))
    .filter((entry) => entry.length > 0);
}

function synthesizeBlockText(evidence: Record<string, unknown> | null | undefined, ruleKey: string) {
  const matchedSnippet = getString(evidence, "matchedSnippet");
  if (matchedSnippet && matchedSnippet.length >= 24) {
    return matchedSnippet;
  }

  const snippets = uniqueStrings([
    getString(evidence, "claimText"),
    getString(evidence, "matchedPhrase"),
    matchedSnippet,
    ...getStringArray(evidence, "policySnippets"),
    ...getStringArray(evidence, "supportingHeadings")
  ]);

  const joined = snippets.join(". ");
  if (joined.length > 0) {
    return joined;
  }

  return ruleKey.replace(/^financial_review\./, "").replaceAll("_", " ");
}

function scoreBlockAgainstHints(block: string, hints: string[]) {
  const normalizedBlock = block.toLowerCase();
  let score = 0;

  for (const hint of hints) {
    if (normalizedBlock.includes(hint.toLowerCase())) {
      score += Math.max(1, Math.min(4, hint.length / 6));
    }
  }

  return score;
}

function maybeSparseSynthesizedText(text: string) {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length < 80 || compact.split(/[.]/).length <= 2;
}

async function fetchPublicPageExcerpt(input: {
  hints: string[];
  pageUrl: string;
}) {
  try {
    const response = await fetch(input.pageUrl, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9"
      },
      redirect: "follow"
    });

    if (!response.ok) {
      return null;
    }

    const html = await response.text();
    const text = stripHtmlToText(html);
    const blocks = splitTextIntoCandidateBlocks(text);
    if (blocks.length === 0) {
      return null;
    }

    const ranked = blocks
      .map((block) => ({
        block,
        score: scoreBlockAgainstHints(block, input.hints)
      }))
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score || right.block.length - left.block.length);

    return ranked[0]?.block ?? null;
  } catch {
    return null;
  }
}

function inferDraftInput(row: FindingRow): FinancialCommercialClaimsDraftInput {
  const evidence = row.evidence_json;
  const sourceUrl = getString(evidence, "pageUrl") ?? row.page_url ?? undefined;
  const pageType = getString(evidence, "pageType");
  const candidateSignals = getStringArray(evidence, "candidateSignals");
  const supportingHeadings = getStringArray(evidence, "supportingHeadings");
  const blockHeading = supportingHeadings[0] ?? null;
  const blockText = synthesizeBlockText(evidence, row.rule_key);
  const notesParts = uniqueStrings([
    `Auto-drafted from ${row.rule_key} on ${row.hostname}.`,
    row.title,
    `scan ${row.scan_id}`,
    `run ${row.validation_run_id}`
  ]);
  return {
    adjacentAfter: null,
    adjacentBefore: row.hostname,
    blockHeading,
    blockText,
    candidateSignals,
    notes: notesParts.join(" "),
    pageType,
    pageUrl: sourceUrl,
    sourceType: "page_evidence",
    sourceUrl,
    split: "eval"
  };
}

function dedupeDrafts(drafts: FinancialCommercialClaimsDraft[]) {
  const deduped = new Map<string, FinancialCommercialClaimsDraft>();

  for (const draft of drafts) {
    const key = JSON.stringify({
      blockHeading: draft.input.blockHeading,
      blockText: draft.input.blockText,
      candidateSignals: [...draft.input.candidateSignals].sort(),
      expectedFindingIds: [...draft.pageExpectation.expectedFindingIds].sort(),
      pageType: draft.input.pageType,
      pageUrl: draft.input.pageUrl
    });

    const existing = deduped.get(key);
    if (!existing) {
      deduped.set(key, draft);
      continue;
    }

    existing.notes = uniqueStrings([existing.notes, draft.notes]).join(" ");
  }

  return [...deduped.values()];
}

function shouldSkipFindingRow(row: FindingRow) {
  return NON_PROMOTABLE_FINANCIAL_RULES.has(row.rule_key);
}

function shouldKeepDraft(draft: FinancialCommercialClaimsDraft) {
  const pageType = draft.input.pageType?.toLowerCase() ?? "";

  if (pageType.includes("privacy") || pageType.includes("terms") || pageType.includes("legal")) {
    return false;
  }

  if (draft.pageExpectation.expectedFindingIds.length === 0) {
    return false;
  }

  return true;
}

function loadExistingDatasetIds(datasetPath: string) {
  const source = readFileSync(datasetPath, "utf8");
  return new Set(
    [...source.matchAll(/\bid:\s*"([^"]+)"/g)]
      .map((match) => match[1] ?? "")
      .filter((value) => value.length > 0)
  );
}

function filterExistingDrafts(input: {
  datasetPath: string;
  drafts: FinancialCommercialClaimsDraft[];
}) {
  const existingIds = loadExistingDatasetIds(input.datasetPath);
  return input.drafts.filter((draft) => !existingIds.has(draft.id));
}

function renderDrafts(drafts: FinancialCommercialClaimsDraft[], asJson: boolean) {
  if (asJson) {
    return JSON.stringify(drafts, null, 2);
  }

  return drafts
    .map((draft) =>
      [
        `// ${draft.id}`,
        formatFinancialCommercialClaimsDraftExample({
          ...draft.input,
          bucket: draft.bucket,
          id: draft.id,
          notes: draft.notes,
          sourceUrl: draft.sourceUrl,
          split: draft.split
        }),
        ""
      ].join("\n")
    )
    .join("\n");
}

function renderDraftReviewMarkdown(input: {
  asJson: boolean;
  drafts: FinancialCommercialClaimsDraft[];
  hostnames: string[];
  liveFetch: boolean;
  scanIds: string[];
}) {
  const generatedAt = new Date().toISOString();
  const filterSummary = [
    input.scanIds.length > 0 ? `scanIds=${input.scanIds.join(", ")}` : null,
    input.hostnames.length > 0 ? `hostnames=${input.hostnames.join(", ")}` : null,
    `liveFetch=${input.liveFetch ? "on" : "off"}`,
    `format=${input.asJson ? "json" : "example"}`
  ]
    .filter((value): value is string => Boolean(value))
    .join(" | ");
  const summaryTable = [
    "| Approval | ID | Host | Bucket | Expected Findings |",
    "| --- | --- | --- | --- | --- |",
    ...input.drafts.map((draft) => {
      const host = draft.input.pageUrl ? new URL(draft.input.pageUrl).hostname : "—";
      const findings =
        draft.pageExpectation.expectedFindingIds.length > 0
          ? draft.pageExpectation.expectedFindingIds.join(", ")
          : "none";
      return `| pending | ${draft.id} | ${host} | ${draft.bucket} | ${findings} |`;
    })
  ].join("\n");

  const sections = input.drafts.map((draft) =>
    [
      `## ${draft.id}`,
      "",
      `- bucket: \`${draft.bucket}\``,
      `- split: \`${draft.split}\``,
      `- approval: pending`,
      draft.sourceUrl ? `- sourceUrl: ${draft.sourceUrl}` : null,
      `- expectedFindings: ${
        draft.pageExpectation.expectedFindingIds.length > 0
          ? draft.pageExpectation.expectedFindingIds.map((value) => `\`${value}\``).join(", ")
          : "_none_"
      }`,
      `- cardMode: \`${draft.pageExpectation.expectedCardMode}\``,
      "",
      "```ts",
      formatFinancialCommercialClaimsDraftExample({
        ...draft.input,
        bucket: draft.bucket,
        id: draft.id,
        notes: draft.notes,
        sourceUrl: draft.sourceUrl,
        split: draft.split
      }),
      "```",
      ""
    ]
      .filter((value): value is string => value !== null)
      .join("\n")
  );

  return [
    "# Financial Claims Draft Review",
    "",
    `Generated: ${generatedAt}`,
    `Filters: ${filterSummary}`,
    `Draft count: ${input.drafts.length}`,
    "",
    "## Summary",
    "",
    summaryTable,
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

async function loadFindingRows(input: {
  hostnames: string[];
  limit: number;
  scanIds: string[];
}) {
  return query<FindingRow>(
    `
      select distinct on (vr.scan_id, vrf.page_url, vrf.rule_key)
        vrf.validation_run_id,
        vr.scan_id,
        d.hostname,
        vrf.rule_key,
        vrf.title,
        vrf.page_url,
        vrf.evidence_json,
        vrf.created_at
      from validation_run_findings vrf
      join validation_runs vr on vr.id = vrf.validation_run_id
      join scans s on s.id = vr.scan_id
      join domains d on d.id = s.domain_id
      where vrf.rule_key like 'financial_review.%'
        and (
          cardinality($1::uuid[]) = 0
          or vr.scan_id = any($1::uuid[])
        )
        and (
          cardinality($2::text[]) = 0
          or d.hostname = any($2::text[])
        )
      order by vr.scan_id, vrf.page_url, vrf.rule_key, vrf.created_at desc
      limit $3
    `,
    [input.scanIds, input.hostnames, input.limit],
    { readOnly: true }
  ).then((result) => result.rows);
}

async function main() {
  const scanIds = getArgValues("--scan-id");
  const hostnames = getArgValues("--hostname");
  const limit = Number.parseInt(getArgValue("--limit") ?? "12", 10);
  const asJson = hasFlag("--json");
  const includeExisting = hasFlag("--include-existing");
  const liveFetch = hasFlag("--live-fetch");
  const outputPath = getArgValue("--output");

  if (!Number.isFinite(limit) || limit <= 0) {
    throw new Error(`Invalid --limit value: ${String(getArgValue("--limit"))}`);
  }

  const rows = await loadFindingRows({
    hostnames,
    limit,
    scanIds
  });

  const rawInputs = rows
    .filter((row) => !shouldSkipFindingRow(row))
    .map((row) => inferDraftInput(row));

  if (liveFetch) {
    for (const draftInput of rawInputs) {
      if (!draftInput.pageUrl) {
        continue;
      }

      if (!maybeSparseSynthesizedText(draftInput.blockText)) {
        continue;
      }

      const fetchedExcerpt = await fetchPublicPageExcerpt({
        hints: uniqueStrings([
          draftInput.blockHeading,
          draftInput.blockText,
          ...(draftInput.candidateSignals ?? [])
        ])
          .flatMap((entry) => entry.split(/[.]/))
          .map((entry) => entry.trim())
          .filter((entry) => entry.length >= 4),
        pageUrl: draftInput.pageUrl
      });

      if (fetchedExcerpt) {
        draftInput.blockText = fetchedExcerpt;
      }
    }
  }

  const drafts = dedupeDrafts(rawInputs.map((row) => buildFinancialCommercialClaimsDraft(row))).filter((draft) => shouldKeepDraft(draft));
  const filteredDrafts = includeExisting
    ? drafts
    : filterExistingDrafts({
        datasetPath: LEGACY_DATASET_PATH,
        drafts
      });
  const rendered = renderDrafts(filteredDrafts, asJson);

  if (outputPath) {
    const fileContent = outputPath.endsWith(".md")
      ? renderDraftReviewMarkdown({
          asJson,
          drafts: filteredDrafts,
          hostnames,
          liveFetch,
          scanIds
        })
      : rendered;
    const absolutePath = writeOutputFile(outputPath, fileContent);
    console.error(`wrote ${filteredDrafts.length} drafts to ${absolutePath}`);
    return;
  }

  console.log(rendered);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
