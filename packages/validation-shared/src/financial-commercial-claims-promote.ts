import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import {
  evaluateFinancialCommercialClaimsDataset
} from "./financial-commercial-claims-eval";
import {
  formatFinancialCommercialClaimsDraftExample,
  type FinancialCommercialClaimsDraft
} from "./financial-commercial-claims-draft";

const LEGACY_DATASET_PATH = "/Users/benmasek/WC01/packages/validation-shared/legacy/financial-commercial-claims.dataset.js";

function getArgValue(flag: string) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

type ExtractedMarkdownBlock = {
  approval: "approved" | "pending" | "rejected" | "unknown";
  block: string;
  id: string | null;
};

function extractMarkdownBlocks(markdown: string) {
  const blocks: ExtractedMarkdownBlock[] = [];
  const pattern = /##\s+[^\n]+\n([\s\S]*?)(?=\n##\s+|\s*$)/g;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(markdown)) !== null) {
    const section = match[1] ?? "";
    const approvalMatch = section.match(/^- approval:\s*(approved|pending|rejected)\s*$/im);
    const approval = (approvalMatch?.[1] as ExtractedMarkdownBlock["approval"] | undefined) ?? "unknown";
    const codeFenceMatch = section.match(/```(?:ts|js)?\n([\s\S]*?)```/);
    const block = codeFenceMatch?.[1]?.trim() ?? null;

    if (block && block.startsWith("example({")) {
      blocks.push({
        approval,
        block,
        id: extractBlockId(block)
      });
    }
  }

  return blocks;
}

function extractExistingIds(source: string) {
  return new Set([...source.matchAll(/\bid:\s*"([^"]+)"/g)].map((match) => match[1] ?? "").filter((value) => value.length > 0));
}

function extractBlockId(block: string) {
  const match = block.match(/\bid:\s*"([^"]+)"/);
  return match?.[1] ?? null;
}

function indentBlock(block: string) {
  return block
    .trim()
    .replace(/\n([ ]*)\}\n\}\)$/m, "\n$1})")
    .split("\n")
    .map((line) => `    ${line}`)
    .join("\n");
}

export function appendBlocksToLegacyDataset(source: string, blocks: string[]) {
  const markerMatch = source.match(/\n\];\nfunction summarizeFinancialCommercialClaimsDataset\(/);

  if (!markerMatch || markerMatch.index === undefined) {
    throw new Error("Could not find the financial claims dataset array terminator.");
  }

  const markerIndex = markerMatch.index;
  const before = source.slice(0, markerIndex);
  const after = source.slice(markerIndex);
  const rendered = blocks.map((block) => indentBlock(block)).join(",\n");

  return `${before},\n${rendered}${after}`;
}

function buildBlocksFromJson(content: string) {
  const parsed = JSON.parse(content) as FinancialCommercialClaimsDraft[];
  if (!Array.isArray(parsed)) {
    throw new Error("JSON promotion input must be an array of draft objects.");
  }

  return parsed.map((draft) =>
    formatFinancialCommercialClaimsDraftExample({
      ...draft.input,
      bucket: draft.bucket,
      id: draft.id,
      notes: draft.notes,
      sourceUrl: draft.sourceUrl,
      split: draft.split
    })
  );
}

export function extractPromotableExampleBlocks(input: {
  content: string;
  filename: string;
  includePending?: boolean;
}) {
  if (input.filename.endsWith(".md")) {
    return extractMarkdownBlocks(input.content)
      .filter((entry) => entry.approval === "approved" || (input.includePending === true && entry.approval !== "rejected"))
      .map((entry) => entry.block);
  }

  if (input.filename.endsWith(".json")) {
    return buildBlocksFromJson(input.content);
  }

  if (input.filename.endsWith(".jsonl")) {
    return input.content
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as FinancialCommercialClaimsDraft)
      .map((draft) =>
        formatFinancialCommercialClaimsDraftExample({
          ...draft.input,
          bucket: draft.bucket,
          id: draft.id,
          notes: draft.notes,
          sourceUrl: draft.sourceUrl,
          split: draft.split
        })
      );
  }

  return input.content
    .split(/\n(?=example\(\{)/g)
    .map((block) => block.trim())
    .filter((block) => block.startsWith("example({"));
}

export function promoteFinancialClaimsExamples(input: {
  datasetPath?: string;
  dryRun?: boolean;
  filePath: string;
  includePending?: boolean;
}) {
  const datasetPath = resolve(input.datasetPath ?? LEGACY_DATASET_PATH);
  const filePath = resolve(input.filePath);
  const reviewContent = readFileSync(filePath, "utf8");
  const source = readFileSync(datasetPath, "utf8");
  const blocks = extractPromotableExampleBlocks({
    content: reviewContent,
    filename: filePath,
    includePending: input.includePending
  });

  if (blocks.length === 0) {
    throw new Error(`No promotable approved example blocks found in ${filePath}.`);
  }

  const existingIds = extractExistingIds(source);
  const candidateIds = new Set<string>();

  for (const block of blocks) {
    const id = extractBlockId(block);
    if (!id) {
      throw new Error("Every promoted example block must contain an id.");
    }
    if (existingIds.has(id)) {
      throw new Error(`Refusing to promote duplicate dataset id: ${id}`);
    }
    if (candidateIds.has(id)) {
      throw new Error(`Promotion input contains duplicate draft id: ${id}`);
    }
    candidateIds.add(id);
  }

  if (input.dryRun) {
    return {
      blockCount: blocks.length,
      datasetPath,
      dryRun: true,
      ids: [...candidateIds]
    };
  }

  const nextSource = appendBlocksToLegacyDataset(source, blocks);
  writeFileSync(datasetPath, nextSource, "utf8");

  const evalSummary = evaluateFinancialCommercialClaimsDataset();
  if (evalSummary.mismatches.length > 0 || evalSummary.overallMatchCount !== evalSummary.evaluatedCount) {
    throw new Error(`Promotion wrote ${blocks.length} blocks, but corpus eval failed with ${evalSummary.mismatches.length} mismatches.`);
  }

  return {
    blockCount: blocks.length,
    datasetPath,
    dryRun: false,
    evalSummary,
    ids: [...candidateIds]
  };
}

if (require.main === module) {
  const filePath = getArgValue("--file");
  if (!filePath) {
    throw new Error("Provide --file pointing at a markdown review file, JSON draft array, JSONL draft stream, or raw example block file.");
  }

  const result = promoteFinancialClaimsExamples({
    datasetPath: getArgValue("--dataset-path") ?? undefined,
    dryRun: hasFlag("--dry-run"),
    filePath,
    includePending: hasFlag("--include-pending")
  });

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
