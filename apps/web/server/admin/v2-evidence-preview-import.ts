import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import {
  createWc01V2InternalArtifactRun,
  createWc01V2InternalPreviewItem,
  getWc01V2InternalArtifactRunByPath,
  type Wc01V2InternalReviewerAction,
} from "./v2-internal-reviewer-persistence";

export const WC01_V2_EVIDENCE_PREVIEW_COHORTS = [
  {
    label: "Policy stress",
    value: "policy-stress",
    path: "artifacts/v2-wc01-evidence-preview-policy-stress-consent",
  },
  {
    label: "Edge",
    value: "edge",
    path: "artifacts/v2-wc01-evidence-preview-edge-consent",
  },
  {
    label: "Expanded",
    value: "expanded",
    path: "artifacts/v2-wc01-evidence-preview-expanded-fresh-registry",
  },
  {
    label: "Stress",
    value: "stress",
    path: "artifacts/v2-wc01-evidence-preview-stress-fresh-registry",
  },
] as const;

export type Wc01V2EvidencePreviewCohort = typeof WC01_V2_EVIDENCE_PREVIEW_COHORTS[number]["value"];

type EvidencePreviewPacket = {
  packetVersion?: string;
  sourceUrl?: string;
  domain?: string;
  status?: string;
  productionEligible?: boolean;
  topFindingEligible?: boolean;
  gapEligible?: boolean;
  queueItems?: EvidencePreviewQueueItem[];
};

type EvidencePreviewQueueItem = {
  queueItemId?: string;
  candidateId?: string;
  candidateFamily?: string;
  queueLane?: string;
  sensitiveContextCategories?: string[];
  confidence?: string;
  directness?: string;
  unresolvedEvidenceRefs?: unknown[];
};

export type Wc01V2EvidencePreviewImportResult = {
  cohort: string;
  filesFound: number;
  persistedRuns: number;
  persistedItems: number;
};

export async function importWc01V2EvidencePreviewCohort(input: {
  cohort: Wc01V2EvidencePreviewCohort;
  createdBy: string;
}) {
  const cohort = WC01_V2_EVIDENCE_PREVIEW_COHORTS.find((candidate) => candidate.value === input.cohort);
  if (!cohort) {
    throw new Error("Unsupported WC01 v2 evidence preview cohort.");
  }

  return importWc01V2EvidencePreviewArtifacts({
    path: cohort.path,
    cohort: cohort.value,
    createdBy: input.createdBy,
  });
}

export async function importWc01V2EvidencePreviewArtifacts(input: {
  path: string;
  cohort?: string | null;
  createdBy?: string | null;
  baseCwd?: string;
}): Promise<Wc01V2EvidencePreviewImportResult> {
  const baseCwd = input.baseCwd ?? process.env.INIT_CWD ?? findWorkspaceRoot();
  const inputPath = resolveInputPath(input.path, baseCwd);
  const files = await findEvidencePreviewFiles(inputPath);

  let persistedRuns = 0;
  let persistedItems = 0;
  for (const file of files) {
    const packet = JSON.parse(await readFile(file, "utf8")) as EvidencePreviewPacket;
    const queueItems = packet.queueItems ?? [];
    const summaryMarkdown = await readSiblingSummary(file);
    const artifactPath = relative(baseCwd, file);
    const artifactRoot = relative(baseCwd, dirname(file));
    const existingRun = await getWc01V2InternalArtifactRunByPath(artifactPath);
    const run = existingRun ?? await createWc01V2InternalArtifactRun({
      sourceLabel: packet.domain ?? packet.sourceUrl ?? relative(baseCwd, file),
      cohort: input.cohort ?? inferCohort(file),
      siteDomain: packet.domain ?? null,
      artifactKind: "evidence_preview_packet",
      artifactVersion: packet.packetVersion ?? "unknown",
      artifactPath,
      artifactRoot,
      artifactJson: packet as Record<string, unknown>,
      summaryMarkdown,
      queueItemCount: queueItems.length,
      guardrailStatus: packetHasClosedGuardrails(packet) ? "passed" : "failed",
      createdBy: input.createdBy ?? "internal_import",
      metadataJson: {
        importedFrom: file,
        sourceUrl: packet.sourceUrl ?? null,
        status: packet.status ?? null,
      },
    });

    if (!run) {
      throw new Error(`Failed to persist artifact run for ${file}`);
    }

    for (const [index, item] of queueItems.entries()) {
      await createWc01V2InternalPreviewItem({
        artifactRunId: run.id,
        queueItemId: item.queueItemId ?? item.candidateId ?? `${packet.domain ?? "site"}:${index + 1}`,
        siteDomain: packet.domain ?? null,
        family: item.candidateFamily ?? "unknown",
        queueLane: item.queueLane ?? "unknown",
        suggestedReviewerAction: suggestedActionForLane(item.queueLane),
        sensitiveContextCategories: item.sensitiveContextCategories ?? [],
        confidenceBand: item.confidence ?? null,
        directness: item.directness ?? null,
        unresolvedRefCount: item.unresolvedEvidenceRefs?.length ?? 0,
        warningCount: 0,
        itemJson: item as Record<string, unknown>,
      });
      persistedItems += 1;
    }

    persistedRuns += 1;
  }

  return {
    cohort: input.cohort ?? "custom",
    filesFound: files.length,
    persistedRuns,
    persistedItems,
  };
}

async function findEvidencePreviewFiles(path: string): Promise<string[]> {
  const info = await stat(path);
  if (info.isFile()) {
    return path.endsWith("Wc01V2EvidencePreviewPacket.json") ? [path] : [];
  }
  const entries = await readdir(path, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const child = join(path, entry.name);
    if (entry.isDirectory()) {
      return findEvidencePreviewFiles(child);
    }
    return Promise.resolve(entry.name === "Wc01V2EvidencePreviewPacket.json" ? [child] : []);
  }));
  return nested.flat().sort();
}

async function readSiblingSummary(file: string) {
  try {
    return await readFile(join(dirname(file), "Wc01V2EvidencePreviewPacket.summary.md"), "utf8");
  } catch {
    return null;
  }
}

function packetHasClosedGuardrails(packet: EvidencePreviewPacket) {
  return packet.productionEligible === false && packet.topFindingEligible === false && packet.gapEligible === false;
}

function suggestedActionForLane(queueLane: string | undefined): Wc01V2InternalReviewerAction {
  if (queueLane === "sensitive_context_review_required") {
    return "sensitive_context_escalated";
  }
  if (queueLane === "evidence_quality_review") {
    return "needs_more_evidence";
  }
  if (queueLane === "blocked_suppressed_diagnostic_only") {
    return "internal_only";
  }
  return "evidence_shape_confirmed";
}

function inferCohort(file: string) {
  const parts = file.split("/");
  const artifactDir = parts.find((part) => part.startsWith("v2-wc01-evidence-preview-"));
  return artifactDir?.replace("v2-wc01-evidence-preview-", "") ?? null;
}

function resolveInputPath(path: string, baseCwd: string) {
  return isAbsolute(path) ? path : resolve(baseCwd, path);
}

function findWorkspaceRoot() {
  const candidates = [
    process.cwd(),
    resolve(process.cwd(), "../.."),
  ];
  return candidates.find((candidate) =>
    existsSync(join(candidate, "apps/web")) && existsSync(join(candidate, "packages/db"))
  ) ?? process.cwd();
}
