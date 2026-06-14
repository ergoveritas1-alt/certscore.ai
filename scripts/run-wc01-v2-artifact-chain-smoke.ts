import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { generateWc01V2PolicyCopyReviewArtifactSingleFromFile } from "../packages/certscore-report-adapter/src/wc01-v2-policy-copy-review-artifact-output";
import { generateWc01V2ProductSurfaceProposalDraftSingleFromFile } from "../packages/certscore-report-adapter/src/wc01-v2-product-surface-proposal-draft-output";
import { generateWc01V2ProductionReadinessGateDraftSingleFromFile } from "../packages/certscore-report-adapter/src/wc01-v2-production-readiness-gate-draft-output";

type Args = {
  help?: boolean;
  examplesDir: string;
  outDir: string;
};

type SmokeSummary = {
  status: "passed";
  examplesDir: string;
  outDir: string;
  generatedFiles: string[];
  checks: Array<{
    name: string;
    passed: true;
  }>;
  artifacts: {
    policyCopyReview: {
      outcome: string;
      allowedNextStep: string;
      productionEligible: false;
      customerFacingEligible: false;
      explicitApprovalRequired: true;
      sensitiveContextIsRoutingMetadataOnly: true;
    };
    productionReadinessGate: {
      outcome: string;
      allowedNextStep: string;
      productionEligible: false;
      customerFacingEligible: false;
      explicitApprovalRequired: true;
    };
    productSurfaceProposal: {
      implementationStatus: "not_approved";
      productionEligible: false;
      customerFacingEligible: false;
      explicitApprovalRequired: true;
      failClosedReasons: string[];
    };
  };
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  await mkdir(args.outDir, { recursive: true });

  const policyCopyOut = join(args.outDir, "Wc01V2PolicyCopyReviewArtifact.json");
  const readinessOut = join(args.outDir, "Wc01V2ProductionReadinessGateDraft.json");
  const proposalOut = join(args.outDir, "Wc01V2ProductSurfaceProposalDraft.json");

  await generateWc01V2PolicyCopyReviewArtifactSingleFromFile({
    inputPath: join(args.examplesDir, "Wc01V2PolicyCopyReviewInput.example.json"),
    outPath: policyCopyOut,
  });
  await generateWc01V2ProductionReadinessGateDraftSingleFromFile({
    inputPath: join(args.examplesDir, "Wc01V2ProductionReadinessGateInput.example.json"),
    outPath: readinessOut,
  });
  await generateWc01V2ProductSurfaceProposalDraftSingleFromFile({
    inputPath: join(args.examplesDir, "Wc01V2ProductSurfaceProposalInput.example.json"),
    outPath: proposalOut,
  });

  const policyCopy = await readJson<Record<string, unknown>>(policyCopyOut);
  const readiness = await readJson<Record<string, unknown>>(readinessOut);
  const proposal = await readJson<Record<string, unknown>>(proposalOut);

  const checks: SmokeSummary["checks"] = [];
  assertCheck(policyCopy.productionEligible === false, "policy_copy_production_eligible_false", checks);
  assertCheck(policyCopy.customerFacingEligible === false, "policy_copy_customer_facing_eligible_false", checks);
  assertCheck(policyCopy.explicitApprovalRequired === true, "policy_copy_explicit_approval_required_true", checks);
  assertCheck(
    policyCopy.sensitiveContextIsRoutingMetadataOnly === true,
    "policy_copy_sensitive_context_routing_metadata_only",
    checks,
  );
  assertCheck(
    policyCopy.policyCopyOutcome === "ready_for_production_readiness_gate",
    "policy_copy_ready_for_readiness_gate",
    checks,
  );

  assertCheck(readiness.productionEligible === false, "readiness_production_eligible_false", checks);
  assertCheck(readiness.customerFacingEligible === false, "readiness_customer_facing_eligible_false", checks);
  assertCheck(readiness.explicitApprovalRequired === true, "readiness_explicit_approval_required_true", checks);
  assertCheck(
    readiness.overallGateOutcome === "ready_for_production_proposal_review",
    "readiness_ready_for_product_surface_proposal",
    checks,
  );

  assertCheck(proposal.productionEligible === false, "proposal_production_eligible_false", checks);
  assertCheck(proposal.customerFacingEligible === false, "proposal_customer_facing_eligible_false", checks);
  assertCheck(proposal.explicitApprovalRequired === true, "proposal_explicit_approval_required_true", checks);
  assertCheck(proposal.implementationStatus === "not_approved", "proposal_implementation_status_not_approved", checks);

  const summary: SmokeSummary = {
    status: "passed",
    examplesDir: args.examplesDir,
    outDir: args.outDir,
    generatedFiles: [
      "Wc01V2PolicyCopyReviewArtifact.json",
      "Wc01V2PolicyCopyReviewArtifact.summary.md",
      "Wc01V2ProductionReadinessGateDraft.json",
      "Wc01V2ProductionReadinessGateDraft.summary.md",
      "Wc01V2ProductSurfaceProposalDraft.json",
      "Wc01V2ProductSurfaceProposalDraft.summary.md",
      "Wc01V2ArtifactChainSmoke.summary.json",
      "Wc01V2ArtifactChainSmoke.summary.md",
    ],
    checks,
    artifacts: {
      policyCopyReview: {
        outcome: requireString(policyCopy.policyCopyOutcome, "policyCopyOutcome"),
        allowedNextStep: requireString(policyCopy.allowedNextStep, "policyCopy.allowedNextStep"),
        productionEligible: false,
        customerFacingEligible: false,
        explicitApprovalRequired: true,
        sensitiveContextIsRoutingMetadataOnly: true,
      },
      productionReadinessGate: {
        outcome: requireString(readiness.overallGateOutcome, "overallGateOutcome"),
        allowedNextStep: requireString(readiness.allowedNextStep, "readiness.allowedNextStep"),
        productionEligible: false,
        customerFacingEligible: false,
        explicitApprovalRequired: true,
      },
      productSurfaceProposal: {
        implementationStatus: "not_approved",
        productionEligible: false,
        customerFacingEligible: false,
        explicitApprovalRequired: true,
        failClosedReasons: Array.isArray(proposal.failClosedReasons)
          ? proposal.failClosedReasons.map((reason) => String(reason))
          : [],
      },
    },
  };

  await writeFile(
    join(args.outDir, "Wc01V2ArtifactChainSmoke.summary.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    join(args.outDir, "Wc01V2ArtifactChainSmoke.summary.md"),
    renderMarkdown(summary),
    "utf8",
  );

  console.log(`WC01 v2 artifact chain smoke passed: ${checks.length} checks`);
  console.log(`Wrote ${join(args.outDir, "Wc01V2ArtifactChainSmoke.summary.json")}`);
  console.log(`Wrote ${join(args.outDir, "Wc01V2ArtifactChainSmoke.summary.md")}`);
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    examplesDir: "./docs/certscore-v2/examples",
    outDir: "./artifacts/v2-internal-artifact-chain-example",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--examples-dir") {
      args.examplesDir = requiredValue(argv, ++index, arg);
    } else if (arg === "--out-dir") {
      args.outDir = requiredValue(argv, ++index, arg);
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
    "  pnpm v2:wc01-artifact-chain-smoke [--examples-dir <dir>] [--out-dir <dir>]",
    "",
    "Runs the internal WC01 v2 policy/copy -> readiness -> product-surface proposal artifact smoke.",
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

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

function assertCheck(
  condition: boolean,
  name: string,
  checks: SmokeSummary["checks"],
): asserts condition {
  if (!condition) {
    throw new Error(`WC01 v2 artifact chain smoke failed: ${name}`);
  }
  checks.push({ name, passed: true });
}

function requireString(value: unknown, name: string) {
  if (typeof value !== "string") {
    throw new Error(`Expected ${name} to be a string.`);
  }
  return value;
}

function renderMarkdown(summary: SmokeSummary) {
  return [
    "# WC01 v2 Artifact Chain Smoke Summary",
    "",
    "Internal diagnostic only. Not implementation approval. Not customer-facing report output.",
    "",
    `- Status: ${summary.status}`,
    `- Examples dir: ${summary.examplesDir}`,
    `- Output dir: ${summary.outDir}`,
    "",
    "## Artifact Outcomes",
    "",
    "| Artifact | Outcome | Allowed next step | Production eligible | Customer-facing eligible | Explicit approval required |",
    "|---|---|---|---:|---:|---:|",
    `| Policy/copy review | ${summary.artifacts.policyCopyReview.outcome} | ${summary.artifacts.policyCopyReview.allowedNextStep} | false | false | true |`,
    `| Production readiness gate | ${summary.artifacts.productionReadinessGate.outcome} | ${summary.artifacts.productionReadinessGate.allowedNextStep} | false | false | true |`,
    `| Product surface proposal | ${summary.artifacts.productSurfaceProposal.implementationStatus} | n/a | false | false | true |`,
    "",
    "## Checks",
    "",
    ...summary.checks.map((check) => `- ${check.name}: passed`),
    "",
    "## Guardrail Posture",
    "",
    "- artifact-only",
    "- internal-only",
    "- non-persistent",
    "- sensitive context remains routing metadata only",
    "- no production eligibility",
    "- no customer-facing eligibility",
    "- explicit approval remains required",
    "- product surface proposal remains not approved",
  ].join("\n");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
