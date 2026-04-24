import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import process from "node:process";
import {
  evaluatePrivacyRuntimeFindingsDataset
} from "./privacy-runtime-findings-eval";
import {
  PRIVACY_RUNTIME_FINDINGS_DATASET_SEED,
  type PrivacyRuntimeFindingDatasetExample
} from "./privacy-runtime-findings.dataset";

const REVIEWED_DATASET_PATH = join(__dirname, "privacy-runtime-findings.reviewed.ts");

type DraftInput = PrivacyRuntimeFindingDatasetExample & {
  artifactPath?: string;
  domain?: string;
  liveFetch?: unknown;
  scenarioName?: string;
  sourceUrl?: string | null;
};

type ExtractedMarkdownBlock = {
  approval: "approved" | "pending" | "rejected" | "needs-rescan" | "duplicate-pattern" | "unknown";
  block: string;
  example: PrivacyRuntimeFindingDatasetExample;
  id: string | null;
};

function getArgValue(flag: string) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

function normalizeApproval(value: string | null | undefined): ExtractedMarkdownBlock["approval"] {
  switch (value) {
    case "approved":
    case "pending":
    case "rejected":
    case "needs-rescan":
    case "duplicate-pattern":
      return value;
    default:
      return "unknown";
  }
}

function normalizeDraft(input: DraftInput): PrivacyRuntimeFindingDatasetExample {
  return {
    downgradeReason: input.downgradeReason,
    evidence: input.evidence,
    expected: input.expected,
    findingGroup: input.findingGroup,
    findingId: input.findingId,
    id: input.id,
    negativeControlReason: input.negativeControlReason,
    notes: input.notes,
    scenarioType: input.scenarioType,
    sourceKind: input.sourceKind
  };
}

function extractBlockId(block: string) {
  const match = block.match(/\bid:\s*"([^"]+)"/);
  return match?.[1] ?? null;
}

function extractExistingIds(source: string) {
  return new Set([...source.matchAll(/\bid:\s*"([^"]+)"/g)].map((match) => match[1] ?? "").filter((value) => value.length > 0));
}

function renderExampleObject(example: PrivacyRuntimeFindingDatasetExample) {
  return JSON.stringify(example, null, 2)
    .replace(/"([^"]+)":/g, "$1:")
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n");
}

function extractMarkdownBlocks(markdown: string) {
  const blocks: ExtractedMarkdownBlock[] = [];
  const pattern = /##\s+[^\n]+\n([\s\S]*?)(?=\n##\s+|\s*$)/g;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(markdown)) !== null) {
    const section = match[1] ?? "";
    const approvalMatch = section.match(/^- approval:\s*(approved|pending|rejected|needs-rescan|duplicate-pattern)\s*$/im);
    const approval = normalizeApproval(approvalMatch?.[1]);
    const jsonFenceMatch = section.match(/```json\n([\s\S]*?)```/);
    const evidenceBlock = jsonFenceMatch?.[1]?.trim();
    const idMatch = section.match(/^##\s+([^\n]+)$/m) ?? match[0].match(/^##\s+([^\n]+)/);
    const sectionId = idMatch?.[1]?.trim() ?? null;

    if (!evidenceBlock || !sectionId) {
      continue;
    }

    const metadata = {
      downgradeReason: section.match(/^- downgradeReason:\s*(.+)$/im)?.[1]?.trim(),
      findingGroup: section.match(/^- findingGroup:\s*`([^`]+)`/im)?.[1]?.trim(),
      findingId: section.match(/^- findingId:\s*`([^`]+)`/im)?.[1]?.trim(),
      negativeControlReason: section.match(/^- negativeControlReason:\s*(.+)$/im)?.[1]?.trim(),
      notes: section.match(/^- notes:\s*(.+)$/im)?.[1]?.trim(),
      scenarioType: section.match(/^- scenarioType:\s*`([^`]+)`/im)?.[1]?.trim(),
      sourceKind: section.match(/^- sourceKind:\s*`([^`]+)`/im)?.[1]?.trim()
    };
    const parsed = JSON.parse(evidenceBlock) as Pick<PrivacyRuntimeFindingDatasetExample, "evidence" | "expected">;
    const draft = normalizeDraft({
      ...metadata,
      evidence: parsed.evidence,
      expected: parsed.expected,
      id: sectionId
    } as DraftInput);

    blocks.push({
      approval,
      block: renderExampleObject(draft),
      example: draft,
      id: draft.id
    });
  }

  return blocks;
}

function buildEntriesFromJson(content: string) {
  const parsed = JSON.parse(content) as DraftInput[];
  if (!Array.isArray(parsed)) {
    throw new Error("JSON promotion input must be an array of privacy runtime draft objects.");
  }

  return parsed.map((draft) => {
    const example = normalizeDraft(draft);
    return {
      approval: "approved" as const,
      block: renderExampleObject(example),
      example,
      id: example.id
    };
  });
}

function extractPromotablePrivacyRuntimeEntries(input: {
  content: string;
  filename: string;
  includePending?: boolean;
}) {
  if (input.filename.endsWith(".md")) {
    return extractMarkdownBlocks(input.content)
      .filter((entry) => entry.approval === "approved" || (input.includePending === true && entry.approval === "pending"));
  }

  if (input.filename.endsWith(".json")) {
    return buildEntriesFromJson(input.content);
  }

  return input.content
    .split(/\n(?=\s*\{)/g)
    .map((block) => block.trim())
    .filter((block) => block.startsWith("{"))
    .map((block) => {
      const example = JSON.parse(block) as PrivacyRuntimeFindingDatasetExample;
      return {
        approval: "approved" as const,
        block: renderExampleObject(example),
        example,
        id: example.id
      };
    });
}

export function extractPromotablePrivacyRuntimeBlocks(input: {
  content: string;
  filename: string;
  includePending?: boolean;
}) {
  return extractPromotablePrivacyRuntimeEntries(input).map((entry) => entry.block);
}

export function appendBlocksToReviewedPrivacyRuntimeDataset(source: string, blocks: string[]) {
  const markerMatch = source.match(/\n\];\s*$/);
  if (!markerMatch || markerMatch.index === undefined) {
    throw new Error("Could not find the reviewed privacy runtime dataset array terminator.");
  }

  const markerIndex = markerMatch.index;
  const before = source.slice(0, markerIndex);
  const after = source.slice(markerIndex);
  const needsComma = !/\[\s*$/.test(before);
  const rendered = blocks.join(",\n");

  return `${before}${needsComma ? "," : ""}\n${rendered}${after}`;
}

export function promotePrivacyRuntimeExamples(input: {
  datasetPath?: string;
  dryRun?: boolean;
  filePath: string;
  includePending?: boolean;
}) {
  const datasetPath = resolve(input.datasetPath ?? REVIEWED_DATASET_PATH);
  const filePath = resolve(input.filePath);
  const reviewContent = readFileSync(filePath, "utf8");
  const source = readFileSync(datasetPath, "utf8");
  const entries = extractPromotablePrivacyRuntimeEntries({
    content: reviewContent,
    filename: filePath,
    includePending: input.includePending
  });
  const blocks = entries.map((entry) => entry.block);

  if (blocks.length === 0) {
    throw new Error(`No promotable approved privacy runtime examples found in ${filePath}.`);
  }

  const existingIds = extractExistingIds(source);
  const candidateIds = new Set<string>();

  for (const block of blocks) {
    const id = extractBlockId(block);
    if (!id) {
      throw new Error("Every promoted privacy runtime example must contain an id.");
    }
    if (existingIds.has(id)) {
      throw new Error(`Refusing to promote duplicate privacy runtime dataset id: ${id}`);
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

  const nextSource = appendBlocksToReviewedPrivacyRuntimeDataset(source, blocks);
  writeFileSync(datasetPath, nextSource, "utf8");

  const evalSummary = evaluatePrivacyRuntimeFindingsDataset([
    ...PRIVACY_RUNTIME_FINDINGS_DATASET_SEED,
    ...entries.map((entry) => entry.example)
  ]);
  if (evalSummary.mismatches.length > 0 || evalSummary.overallMatchCount !== evalSummary.evaluatedCount) {
    throw new Error(`Promotion wrote ${blocks.length} examples, but privacy runtime eval failed with ${evalSummary.mismatches.length} mismatches.`);
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
    throw new Error("Provide --file pointing at a privacy runtime review markdown or JSON draft array.");
  }

  const result = promotePrivacyRuntimeExamples({
    datasetPath: getArgValue("--dataset-path") ?? undefined,
    dryRun: hasFlag("--dry-run"),
    filePath,
    includePending: hasFlag("--include-pending")
  });

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
