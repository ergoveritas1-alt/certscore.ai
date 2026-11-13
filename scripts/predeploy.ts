import { spawn } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { availableParallelism, freemem, tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { checkReleasePrerequisites } from "./lib/release-prerequisites";
import { scheduleReleaseTasks, releaseResourceLimits } from "./lib/release-scheduler";
import { deduplicateExecutions, checkResources, inventoryChecks } from "./lib/release-check-plan";
import { workspaceExportsFingerprint } from "./lib/release-bootstrap";
import { releaseInputs, receiptMatches, writeCheckReceipt } from "./lib/release-receipts";
import { fileURLToPath } from "node:url";

export type Check = {
  key: string;
  label: string;
  command: string[];
};

type Target = {
  key: string;
  label: string;
  matches: (file: string) => boolean;
  checks: Check[];
};

type Args = {
  allTargets: boolean;
  inventory: boolean;
  targetKeys: string[];
  receiptDir: string;
  reuseDir: string | null;
  requireReceipts: boolean;
  staged: boolean;
  baseRef: string | null;
  mode: "fast" | "full";
};

const RELEASE_REGRESSION_REVIEW_CHECK: Check = {
  key: "scan-release-regression-review",
  label: "calibration regression cases remain selected by full and targeted preflight",
  command: ["pnpm", "test:scan-release-regressions"],
};

const ASSESSMENT_HIGHLIGHTS_CHECK: Check = {
  key: "assessment-highlights",
  label: "reviewed assessment highlights and completed EU/California report headlines",
  command: ["pnpm", "test:assessment-highlights"],
};

const REPORT_PRESENTATION_CHECK: Check = {
  key: "report-presentation",
  label: "canonical EU/California scope, report status labels and evidence/PDF parity",
  command: ["pnpm", "test:report-presentation"],
};

const MCP_RELEASE_ASSET_CHECK: Check = {
  key: "mcp-release-asset-contract",
  label: "metadata-only MCP release asset verification",
  command: ["node", "--import", "tsx", "--test", "scripts/mcp-release-asset.test.ts", "scripts/npm-release-runtime.test.ts"],
};

const MCP_RELEASE_GUARD_CHECK: Check = {
  key: "mcp-release-drift",
  label: "canonical MCP manifest, runtime tools and public documentation agree",
  command: ["node", "--import", "tsx", "scripts/verify-certscore-mcp-release-guards.ts"],
};

const EVIDENCE_RECOVERY_CHECK: Check = {
  key: "report-evidence-recovery",
  label: "verified artifact recovery, exact consent documents and policy completeness",
  command: ["pnpm", "exec", "tsx", "--tsconfig", "apps/web/tsconfig.test.json", "--test",
    "apps/web/server/scans/local-v2-dag-report.test.ts",
    "apps/web/server/scans/consent-control-assessment-projector.test.ts"],
};

const CANONICAL_PROJECTION_CHECK: Check = {
  key: "canonical-projection-parity",
  label: "canonical projection parity",
  command: ["pnpm", "test:canonical-projection-parity"],
};

const RUNTIME_GRAPH_RELEASE_CHECK: Check = {
  key: "runtime-graph-release",
  label: "runtime graph persistence, access, API and rollout contracts",
  command: [
    "pnpm", "exec", "tsx", "--tsconfig", "apps/web/tsconfig.json", "--test",
    "apps/web/server/scans/runtime-evidence-graph-access.test.ts",
    "apps/web/server/scans/runtime-evidence-graph-dispatch.test.ts",
    "apps/web/server/scans/runtime-evidence-graph-projection.test.ts",
    "apps/web/server/scans/runtime-evidence-graph-read.test.ts",
    "apps/web/lib/scans/gpc-resource-inventory.test.ts",
    "apps/web/server/scans/runtime-evidence-graph-storage.test.ts",
    "apps/web/lib/api-v2/scan-resource.test.ts",
    "apps/web/lib/api-v2/after-action-summary.test.ts",
    "apps/web/lib/public-integration-versions.test.ts",
    "apps/web/server/pulse/retrieval-quota.test.ts",
    "scripts/runtime-graph-rollout.test.ts",
    "scripts/lib/scanner-configuration-scope.test.ts",
    "scripts/lib/scanner-image-provenance.test.ts",
    "apps/v2-dag-lambda/src/dev-scripts.test.ts",
    "apps/validation-worker/src/validation/local-v2-dag-lambda-dispatch.test.ts",
  ],
};

const SCAN_NO_GO_RELEASE_CHECK: Check = {
  key: "scan-no-go-release",
  label: "canonical no-go score, persistence and report regressions",
  command: ["pnpm", "test:scan-no-go"],
};

const POLICY_SOURCE_WITNESS_CHECK: Check = {
  key: "policy-source-witnesses",
  label: "source-bound policy citations and German canonical disclosure regressions",
  command: ["pnpm", "exec", "tsx", "--tsconfig", "tsconfig.base.json", "--test",
    "packages/certscore-contracts/src/article13-disclosure-rejection.test.ts",
    "packages/certscore-contracts/src/gdpr-transparency-topic-classifier.test.ts",
    "packages/certscore-scan-core/src/policy-topic-witnesses.test.ts",
    "apps/web/lib/scans/gdpr-transparency-topic-evidence-adapter.test.ts",
    "apps/web/lib/scans/policy-topic-witnesses.test.ts",
    "apps/web/lib/scans/ergoveritas-test1-transparency.test.ts"],
};

const REPORT_PUBLICATION_CHECK: Check = {
  key: "report-publication",
  label: "report publication ownership, artifact transfer and recovery contracts",
  command: ["pnpm", "exec", "tsx", "--tsconfig", "apps/web/tsconfig.test.json", "--test",
    "apps/web/server/scans/canonical-scan-report-publisher.test.ts",
    "apps/web/server/scans/report-artifact-transfer.test.ts",
    "apps/web/server/scans/score-materialization-failure.test.ts",
    "apps/web/server/scans/score-materialization-request-repository.test.ts",
    "apps/web/server/scans/local-action-packet-mirror.test.ts"],
};

const CALIFORNIA_REVIEW_CHECK: Check = {
  key: "california-review-coverage",
  label: "California assessment, canonical score, report/export and homepage access contracts",
  command: ["pnpm","exec","tsx","--tsconfig","apps/web/tsconfig.test.json","--test",
    "apps/web/server/scans/california-review-coverage-projection.test.ts",
    "apps/web/server/scans/california-collection-notice-matching.test.ts",
    "apps/web/server/scans/runtime-storage-purpose-assessment.test.ts",
    "packages/certscore-vendor-resolver/src/runtime-script-facts.test.ts",
    "packages/certscore-vendor-resolver/src/client-boundary.test.ts",
    "packages/certscore-scan-core/src/runtime-script-evidence.test.ts",
    "packages/certscore-contracts/src/california-clause-assessment.test.ts",
    "packages/certscore-contracts/src/california-sale-sharing-assessment.test.ts",
    "apps/web/server/scans/california-privacy-review-projection.test.ts",
    "apps/web/server/scans/california-disclosure-choice-scoring.test.ts",
    "apps/web/server/scans/california-runtime-link-scoring.test.ts",
    "apps/web/server/scans/report-export.test.ts",
    "apps/web/lib/scans/regulatory-review-catalog.test.tsx",
    "apps/web/lib/scans/california-opt-out-collection-scoring.test.ts",
    "apps/web/server/scans/cmp-audit-assessment-projector.test.ts",
    "apps/web/components/scans/cmp-details.test.tsx",
    "apps/web/components/scans/collection-surfaces-table.test.tsx",
    "packages/certscore-scan-core/src/policy-terminal-access.test.ts",
    "scripts/audit-california-capture-cohort.test.ts"],
};

const CMP_INITIALIZATION_CAPTURE_CHECK: Check = {
  key: "cmp-initialization-capture",
  label: "bounded passive CMP initialization, SDK readiness and retained transport",
  command: ["pnpm", "exec", "tsx", "--tsconfig", "tsconfig.base.json", "--test", "--test-concurrency=1",
    "packages/certscore-scan-core/src/cmp-initialization-settle.test.ts",
    "packages/certscore-scan-core/src/consent-committed-response.test.ts",
    "packages/certscore-scan-core/src/screenshot-transaction-fallback.test.ts",
    "packages/certscore-scan-core/src/cmp-basic-capture.test.ts",
    "packages/certscore-scan-core/src/cnn-consent-capture.test.ts",
    "packages/certscore-contracts/src/consent-scope-exclusion.test.ts",
    "packages/certscore-scan-core/src/privacy-link-access.test.ts",
    "packages/certscore-scan-core/src/cmp-action-target.test.ts",
    "packages/certscore-scan-core/src/consent-context-visibility.test.ts",
    "packages/certscore-scan-core/src/consent-action-dispatch-regression.test.ts",
    "packages/certscore-scan-core/src/boxless-consent-scope.test.ts",
    "packages/certscore-scan-core/src/cmp-accessible-action-scope.test.ts",
    "packages/certscore-scan-core/src/termly-network-inventory.test.ts",
    "packages/certscore-scan-core/src/gpc-matched-settle.test.ts",
    "packages/certscore-scan-core/src/gpc-production-observation.test.ts",
    "packages/certscore-scan-core/src/policy-anchor-binding.test.ts",
    "packages/certscore-scan-core/src/policy-document-ownership.test.ts",
    "packages/certscore-scan-core/src/policy-response-body.test.ts",
    "packages/certscore-scan-core/src/public-network-guard.test.ts",
    "packages/certscore-scan-core/src/cmp-library-coverage.test.ts",
    "packages/certscore-scan-core/src/cmp-attribution-capture.test.ts",
    "packages/certscore-scan-core/src/consent-geometry-checkpoint.test.ts",
    "packages/certscore-vendor-resolver/src/cmp-library-coverage.test.ts",
    "packages/shared/src/cmp-library-coverage.test.ts",
    "packages/shared/src/known-cmps.test.ts"],
};

const RUNTIME_GRAPH_CAPTURE_CHECK: Check = {
  key: "runtime-graph-capture",
  label: "runtime graph browser, correlation, retention and deadline regressions",
  command: ["pnpm", "exec", "tsx", "--tsconfig", "tsconfig.base.json", "--test", "--test-concurrency=1",
    "packages/certscore-scan-core/src/bounded-initiator-url.test.ts",
    "packages/certscore-contracts/src/runtime-evidence-graph.test.ts",
    "packages/certscore-scan-core/src/runtime-evidence-graph.test.ts",
    "packages/certscore-scan-core/src/runtime-evidence-graph-browser.test.ts",
    "packages/certscore-scan-core/src/canonical-bundle-retention.test.ts",
    "packages/certscore-scan-core/src/browser-recovery-cleanup.test.ts",
    "packages/certscore-scan-core/src/consent-geometry-proof-budget.test.ts",
    "packages/certscore-scan-core/src/gpc-response-assessment.test.ts",
    "packages/certscore-scan-core/src/transport-security-scanner.test.ts"],
};
const REPRESENTATIVE_PROOF_CHECK: Check = {
  key: "consent-representative-proof",
  label: "same-session representative viewport proof regression",
  command: ["pnpm", "exec", "tsx", "--tsconfig", "tsconfig.base.json", "--test", "--test-name-pattern=^consent-proof lane (binds a completed generic negative|retains same-document Playwright proof)", "packages/certscore-scan-core/src/integration-fixtures.test.ts"],
};

const GPC_OBSERVATION_RELEASE_CHECK: Check = {
  key: "gpc-production-observation",
  label: "GPC retained delivery, blocked requests, canonical projection and public contracts",
  command: ["pnpm", "exec", "tsx", "--tsconfig", "tsconfig.base.json", "--test", "--test-concurrency=1",
    "packages/certscore-contracts/src/gpc-impact.test.ts",
    "packages/certscore-contracts/src/canonical-evidence-artifact.test.ts",
    "packages/certscore-scan-core/src/artifact-writer.test.ts",
    "packages/certscore-contracts/src/gpc-cookie-read-binding.test.ts",
    "packages/certscore-scan-core/src/gpc-cmp-state-comparison.test.ts",
    "packages/certscore-scan-core/src/gpc-collection-comparison.test.ts",
    "scripts/lib/audit-progress-gpc.test.ts",
    "packages/certscore-api-contracts/src/gpc-cmp-state-comparison.test.ts",
    "packages/certscore-api-contracts/src/gpc-collection-comparison.test.ts",
    "packages/certscore-api-contracts/src/gpc-semantic-readiness.test.ts",
    "packages/certscore-api-contracts/src/cmp-audit-availability.test.ts",
    "packages/certscore-sdk/src/detailed-evidence.test.ts",
    "apps/web/lib/scans/gpc-guidance.test.ts",
    "apps/web/lib/scans/consent-control-report.test.ts",
    "apps/web/lib/scans/cmp-audit-projection.test.ts",
    "apps/web/lib/scans/gpc-public-evidence.test.ts",
    "packages/certscore-scan-core/src/gpc-impact-assessment.test.ts",
    "packages/certscore-scan-core/src/gpc-impact-capture.test.ts",
    "packages/certscore-scan-core/src/gpc-document-stream.test.ts",
    "packages/certscore-scan-core/src/gpc-cookie-read-binding.test.ts",
    "packages/certscore-scan-core/src/gpc-impact-browser.test.ts",
    "packages/certscore-scan-core/src/gpc-impact-cohort.test.ts",
    "packages/certscore-scan-core/src/gpc-signal-capture.test.ts",
    "packages/certscore-scan-core/src/gpc-semantic-monitor.test.ts",
    "packages/certscore-scan-core/src/local-onetrust-gpc-receipt.test.ts",
    "packages/certscore-scan-core/src/gpc-opt-out-capture.test.ts",
    "packages/certscore-scan-core/src/access-reliability.test.ts",
    "packages/certscore-scan-core/src/cross-lane-access.test.ts",
    "packages/certscore-scan-core/src/gpc-observation-finalization.test.ts",
    "packages/certscore-scan-core/src/gpc-request-header-readback.test.ts",
    "packages/certscore-scan-core/src/collector-envelope-coverage.test.ts",
    "packages/certscore-scan-core/src/index-exchange-coverage.test.ts",
    "scripts/replay-gpc-impact.test.ts",
    "scripts/run-local-v2-dag-lambda-parity.test.ts",
    "scripts/replay-gpc-impact-cohort.test.ts",
    "packages/certscore-scan-core/src/gpc-observation-completion.test.ts",
    "packages/certscore-scan-core/src/gpc-production-observation.test.ts",
    "packages/certscore-scan-core/src/gpc-pre-transmission-block.test.ts",
    "packages/certscore-contracts/src/gpc-public-contract.test.ts",
    "apps/web/lib/scans/gpc-production-observation.test.ts",
    "apps/web/components/scans/report-lab/shadow-scan-report.test.ts",
    "packages/certscore-mcp/src/tools.test.ts"],
};

const GPC_PRODUCT_PRESENTATION_CHECK: Check = {
  key: "gpc-product-presentation",
  label: "GPC optional packets, persisted handoff and evidence expanders",
  command: ["pnpm", "exec", "tsx", "--tsconfig", "apps/web/tsconfig.test.json", "--test", "--test-concurrency=1",
    "--test-name-pattern=GPC product|paired CMP",
    "scripts/gpc-product-handoff.test.ts",
    "apps/web/components/scans/gpc-activity-comparison.test.tsx",
    "apps/web/components/scans/report-lab/gpc-evidence-card.test.tsx",
    "apps/v2-dag-lambda/src/handler.test.ts"],
};

const GPC_RELEASE_TOOLS_CHECK: Check = {
  key: "gpc-release-tools-typecheck",
  label: "GPC artifact consumers and local verification tools typecheck",
  command: ["pnpm", "exec", "tsc", "--noEmit", "-p", "scripts/tsconfig.gpc-release-tools.json"],
};
const GPC_REAL_PIPELINE_CHECK: Check = {
  key: "gpc-real-pipeline",
  label: "GPC real loopback worker bytes through canonical report hydration",
  command: ["pnpm", "exec", "tsx", "--tsconfig", "apps/web/tsconfig.test.json", "--test", "--test-concurrency=1",
    "apps/v2-dag-lambda/src/gpc-release-pipeline.test.ts"],
};

const CONSENT_ACTION_SEMANTICS_CHECK: Check = {
  key: "consent-action-semantics",
  label: "multilingual consent classification and bounded Accept/Reject dispatch",
  command: ["pnpm", "exec", "tsx", "--tsconfig", "tsconfig.base.json", "--test", "--test-concurrency=2",
    "packages/certscore-contracts/src/consent-control-semantics.test.ts",
    "packages/certscore-contracts/src/consent-confirmation-diagnostics.test.ts",
    "packages/certscore-contracts/src/consent-action-stages.test.ts",
    "packages/certscore-scan-core/src/cmp-passive-diagnostics.test.ts",
    "packages/certscore-scan-core/src/action-main-document-write-coverage.test.ts",
    "scripts/cmp-stage-benchmark.test.ts",
    "scripts/cmp-retained-failure-sweep.test.ts",
    "scripts/cmp-full-cohort-audit.test.ts",
    "scripts/cmp-paired-comparison.test.ts",
    "scripts/cmp-paired-campaign.test.ts",
    "packages/certscore-scan-core/src/cookieyes-renewal-receipt.test.ts",
    "packages/certscore-scan-core/src/complianz-consent-state.test.ts",
    "packages/certscore-scan-core/src/accept-confirmation-coverage.test.ts",
    "packages/certscore-scan-core/src/reject-confirmation-coverage.test.ts",
    "packages/certscore-scan-core/src/confirmation-diagnostic-reasons.test.ts",
    "packages/certscore-scan-core/src/consent-action-resolver-diagnostics.test.ts",
    "packages/certscore-scan-core/src/cmp-control-actionability-deadline.test.ts",
    "packages/certscore-scan-core/src/cmp-action-control-proof-deadline.test.ts",
    "packages/certscore-scan-core/src/cmp-accessible-action.test.ts",
    "packages/certscore-scan-core/src/registered-contextual-accept.test.ts",
    "packages/certscore-scan-core/src/consent-control-read-budget.test.ts",
    "packages/certscore-scan-core/src/consent-request-clock.test.ts",
    "packages/certscore-scan-core/src/consent-receipt-capture.test.ts",
    "packages/certscore-contracts/src/consent-receipt-capture.test.ts",
    "packages/certscore-scan-core/src/public-network-guard.test.ts",
    "packages/certscore-scan-core/src/consent-geometry-backpressure.test.ts",
    "packages/certscore-scan-core/src/cmp-api-consent-state.test.ts",
    "packages/certscore-scan-core/src/cmp-api-confirmation.test.ts",
    "packages/certscore-scan-core/src/cmp-action-semantic-proof.test.ts",
    "packages/certscore-scan-core/src/cmp-control-actionability.test.ts",
    "packages/certscore-scan-core/src/consent-action-binding.test.ts",
    "packages/certscore-scan-core/src/consent-action-late-label.test.ts",
    "packages/certscore-scan-core/src/consent-action-opacity-settling.test.ts",
      "packages/certscore-scan-core/src/consent-resolver-scope-readiness.test.ts",
    "packages/certscore-scan-core/src/consent-action-chain.test.ts",
    "packages/certscore-scan-core/src/consent-navigation-budget.test.ts",
    "packages/certscore-scan-core/src/consent-paired-geometry-readiness.test.ts",
    "packages/certscore-scan-core/src/consent-reject-eligibility.test.ts",
    "packages/certscore-scan-core/src/onetrust-consent-state.test.ts",
    "packages/certscore-scan-core/src/onetrust-sdk-applicability.test.ts",
    "packages/certscore-scan-core/src/onetrust-document-binding.test.ts",
    "packages/certscore-contracts/src/onetrust-applicability.test.ts",
    "packages/certscore-contracts/src/notification-acknowledgment.test.ts",
    "packages/certscore-scan-core/src/onetrust-confirmation-readback.test.ts",
    "packages/certscore-scan-core/src/onetrust-control-resolution.test.ts",
    "packages/certscore-scan-core/src/onetrust-loading-resolution.test.ts",
    "packages/certscore-scan-core/src/registered-cmp-loading.test.ts",
    "packages/certscore-scan-core/src/consent-action-discovery.test.ts",
    "packages/certscore-scan-core/src/consent-search-readiness.test.ts",
    "packages/certscore-scan-core/src/action-dom-storage-capture.test.ts",
    "packages/certscore-scan-core/src/action-request-retention.test.ts",
    "packages/certscore-scan-core/src/consent-action-reliability.test.ts",
    "packages/certscore-contracts/src/onetrust-group-evidence.test.ts",
    "packages/certscore-scan-core/src/post-accept-observer.test.ts",
    "packages/certscore-scan-core/src/post-accept-unconfirmed-freeze.test.ts",
    "packages/certscore-scan-core/src/post-action-owned-canary-pages.test.ts",
    "packages/certscore-scan-core/src/post-refusal-observer.test.ts",
    "packages/certscore-scan-core/src/action-retained-failure-regression.test.ts",
    "packages/certscore-contracts/src/retained-unconfirmed-actions.test.ts",
    "apps/v2-dag-lambda/src/evidence-validation-failure.test.ts",
    "packages/certscore-contracts/src/retained-german-choice-labels.test.ts",
    "packages/certscore-scan-core/src/action-stalled-storage.test.ts",
    "packages/certscore-scan-core/src/action-operation-boundary.test.ts",
    "packages/certscore-scan-core/src/osano-instance-confirmation.test.ts",
    "packages/certscore-scan-core/src/osano-consent-receipt.test.ts",
    "apps/v2-dag-lambda/src/action-worker-checkpoints.test.ts",
    "packages/certscore-scan-core/src/action-geometry-retained-regression.test.ts",
  ],
};

const ACCESSIBILITY_AUDIT_CHECK: Check = {
  key: "accessibility-audit",
  label: "required accessibility capture, evidence isolation, persistence and API/MCP contracts",
  command: ["pnpm", "exec", "tsx", "--tsconfig", "tsconfig.base.json", "--test",
    "packages/certscore-contracts/src/accessibility-audit.test.ts",
    "packages/certscore-contracts/src/gpc-public-contract.test.ts",
    "packages/certscore-scan-core/src/accessibility-audit.test.ts",
    "packages/certscore-api-contracts/src/pulse-v1.test.ts",
    "packages/certscore-scan-core/src/pre-consent-deadline.test.ts",
    "apps/web/server/scans/accessibility-audit-projection.test.ts",
    "apps/web/lib/api-v2/report-evidence-selection.test.ts",
    "apps/web/lib/api-v2/scan-resource.test.ts",
    "apps/web/server/scans/scan-status-projection.test.ts",
    "packages/certscore-sdk/src/client.test.ts",
    "packages/certscore-mcp/src/review-navigation.test.ts",
    "packages/certscore-mcp/src/tools.test.ts"],
};

const ACCESSIBILITY_SCORING_CHECK: Check = {
  key: "accessibility-scoring",
  label: "canonical accessibility scoring, caps, persistence and API parity",
  command: ["pnpm", "exec", "tsx", "--tsconfig", "apps/web/tsconfig.test.json", "--test",
    "apps/web/lib/scans/accessibility-score-policy.test.ts",
    "apps/web/lib/scans/site-integrity-shared-scoring.test.ts",
    "apps/web/lib/scans/scoring-policy.test.ts",
    "apps/web/server/scans/accessibility-audit-projection.test.ts",
    "apps/web/server/scans/persisted-canonical-report-projection.test.ts",
    "apps/web/server/scans/full-site-score.test.ts",
    "apps/web/lib/api-v2/scan-report-summary.test.ts"],
};

const CMP_RUNTIME_VISITOR_CHECK: Check = {
  key: "cmp-runtime-visitor", label: "CMP visitor canonical-error stop and navigation safety",
  command: ["node", "--test", "scripts/cmp-paired-runtime-visit.test.cjs"],
};
const CMP_RUNTIME_COORDINATOR_CHECK: Check = {
  key: "cmp-runtime-coordinator", label: "CMP durable contact limits, no retry and global halt",
  command: ["python3", "scripts/cmp-paired-runtime-runner.test.py"],
};

const POST_ACCEPT_FORMS_CHECK: Check = {key:"post-accept-forms",label:"Delayed Accept forms, safe images and report delivery",
  command:["pnpm","test:post-accept-forms"]};
const BOOTSTRAP_CHECK: Check = {
    key: "workspace-package-build",
    label: "bootstrap workspace package exports for clean-checkout tests and typechecks",
    command: ["node", "scripts/release-node.mjs", "scripts/bootstrap-release.ts"]
  };

const RELEASE_PERFORMANCE_CHECK: Check = { key: "release-performance", label: "release scheduling, receipts, scanner barrier and deployment selection", command: ["pnpm", "test:release-performance"] };

const ROOT_FULL_CHECKS: Check[] = [
  BOOTSTRAP_CHECK,
  RELEASE_PERFORMANCE_CHECK,
  POST_ACCEPT_FORMS_CHECK,
  REPORT_PRESENTATION_CHECK,
  ASSESSMENT_HIGHLIGHTS_CHECK,
  RELEASE_REGRESSION_REVIEW_CHECK,
  CMP_RUNTIME_VISITOR_CHECK,
  CMP_RUNTIME_COORDINATOR_CHECK,
  MCP_RELEASE_ASSET_CHECK,
  MCP_RELEASE_GUARD_CHECK,
  {
    key: "deploy-latency-contracts",
    label: "deploy cache, runtime base and exact-SHA typecheck reuse guards",
    command: ["node", "--import", "tsx", "--test", "scripts/deploy-latency.test.ts", "scripts/lib/deployment-consumer-barrier.test.ts", "scripts/web-deployment-skew-protection.test.ts"]
  },
  CONSENT_ACTION_SEMANTICS_CHECK,
  ACCESSIBILITY_AUDIT_CHECK,
  ACCESSIBILITY_SCORING_CHECK,
  GPC_OBSERVATION_RELEASE_CHECK,
  GPC_PRODUCT_PRESENTATION_CHECK,
  GPC_RELEASE_TOOLS_CHECK,
  GPC_REAL_PIPELINE_CHECK,
  SCAN_NO_GO_RELEASE_CHECK,
  REPORT_PUBLICATION_CHECK,
  EVIDENCE_RECOVERY_CHECK,
  RUNTIME_GRAPH_RELEASE_CHECK,
  RUNTIME_GRAPH_CAPTURE_CHECK,
  CALIFORNIA_REVIEW_CHECK,
  CMP_INITIALIZATION_CAPTURE_CHECK,
  REPRESENTATIVE_PROOF_CHECK,
  POLICY_SOURCE_WITNESS_CHECK,
  {
    key: "deploy-topology",
    label: "deployment topology check",
    command: ["pnpm", "ops:check:deploy"]
  },
  {
    key: "workspace-typecheck",
    label: "workspace typecheck",
    command: ["pnpm", "turbo", "run", "typecheck", "--concurrency=2"]
  },
  {
    key: "workspace-build",
    label: "workspace build",
    command: ["node", "scripts/release-node.mjs", "scripts/bootstrap-release.ts", "--workspace"]
  },
  {
    key: "validation-scan-pipeline",
    label: "validation scan pipeline",
    command: ["pnpm", "test:scan-pipeline"]
  },
  {
    key: "lambda-typecheck",
    label: "v2 DAG Lambda typecheck",
    command: ["pnpm", "--filter", "@website-signal-risk-scanner/v2-dag-lambda", "typecheck"]
  },
  {
    key: "scan-core-typecheck",
    label: "v2 scan-core typecheck",
    command: ["pnpm", "--filter", "@certscore/scan-core", "typecheck"]
  },
  {
    key: "scan-core-consent-quality",
    label: "v2 late-consent quality fixtures",
    command: ["pnpm", "--filter", "@certscore/scan-core", "test:integration-fixtures:consent"]
  },
  {
    key: "scan-core-policy-full",
    label: "v2 policy scanner full suite",
    command: ["pnpm", "--filter", "@certscore/scan-core", "test:policy:full"]
  },
  {
    key: "lambda-tests",
    label: "v2 DAG Lambda tests",
    command: ["pnpm", "--filter", "@website-signal-risk-scanner/v2-dag-lambda", "test"]
  },
  CANONICAL_PROJECTION_CHECK,
  {
    key: "post-refusal-release",
    label: "post-refusal release contracts",
    command: ["pnpm", "test:post-refusal-release"]
  }
];

const TARGETS: Target[] = [
  {key:"post-accept-form-lifecycle",label:"Post-Accept form capture and delivery",
    matches:file=>["packages/certscore-scan-core/","packages/certscore-contracts/","apps/v2-dag-lambda/","apps/web/","apps/validation-worker/"].some(prefix=>file.startsWith(prefix)) ||
      /scripts\/(?:post-accept-form|local-isolated-lambda|local-policy-lambda|run-local-v2-dag-lambda-parity|verify-form-canary)/.test(file) || file==="package.json" || file==="scripts/predeploy.ts",
    checks:[POST_ACCEPT_FORMS_CHECK]},
  {
    key: "report-presentation-scope",
    label: "report contracts and local PDF presentation",
    matches: file => file.startsWith("packages/certscore-api-contracts/") || file.startsWith("scripts/report-pdf-v2/") || file === "scripts/preview-report-pdf-v2.ts" || file === "scripts/preview-report-docx.ts" || file === "scripts/report-score-glyphs.py" || file === "apps/web/server/scans/assets/report-score-glyphs.json" || file === "scripts/report-evidence-framework-route.test.ts" || file === "scripts/report-cross-surface-parity.test.mts" || file === "scripts/audit-report-export-parity.ts",
    checks: [REPORT_PRESENTATION_CHECK],
  },
  {
    key: "cmp-runtime-harness", label: "CMP paired runtime harness safety",
    matches: file => file.startsWith("scripts/cmp-paired-runtime-"),
    checks: [CMP_RUNTIME_VISITOR_CHECK, CMP_RUNTIME_COORDINATOR_CHECK],
  },
  {
    key: "mcp-http", label: "MCP public contracts and HTTP transport",
    matches: file => file.startsWith("apps/mcp/") || file.startsWith("packages/certscore-mcp/") ||
      file.startsWith("packages/certscore-api-contracts/") || file.startsWith("packages/certscore-sdk/") ||
      ["scripts/lib/mcp-release-asset.ts", "scripts/mcp-release-asset.test.ts", "scripts/npm-release-runtime.test.ts", ".github/workflows/certscore-sdk-release.yml", ".github/workflows/certscore-mcp-npm-release.yml", "scripts/verify-certscore-mcp-release-guards.ts",
        ".github/workflows/certscore-mcp-release-guards.yml"].includes(file),
    checks: [
      CANONICAL_PROJECTION_CHECK,
      { key: "mcp-http-typecheck", label: "MCP dependency build and HTTP typecheck", command: ["pnpm", "--filter", "@certscore/mcp-http", "typecheck"] },
      { key: "mcp-http-tests", label: "MCP HTTP integration and telemetry", command: ["pnpm", "--filter", "@certscore/mcp-http", "test"] },
      MCP_RELEASE_ASSET_CHECK,
      MCP_RELEASE_GUARD_CHECK,
    ],
  },
  {
    key: "consent-action-semantics",
    label: "consent action semantics and dispatch",
    matches: file => file.startsWith("packages/certscore-contracts/src/") || file.startsWith("scripts/cmp-stage-benchmark") || file.startsWith("scripts/cmp-retained-failure-sweep") || file.startsWith("scripts/cmp-full-cohort-audit") ||
      file.startsWith("scripts/cmp-paired-comparison") || file.startsWith("scripts/cmp-paired-campaign") ||
      file === "packages/certscore-scan-core/src/public-network-guard.ts" || file === "packages/certscore-scan-core/src/public-network-guard.test.ts" ||
      /^packages\/certscore-scan-core\/src\/(?:post-accept-|post-refusal-|cmp-action-|cmp-api-|cmp-passive-|cmp-control-|cmp-accessible-|custom-accept-|action-dom-storage-|action-main-document-write-coverage|consent-|registered-|onetrust-|accept-confirmation-|notification-acknowledgment|confirmation-diagnostic)/.test(file),
    checks: [CONSENT_ACTION_SEMANTICS_CHECK],
  },
  {
    key: "gpc-observation", label: "GPC bounded observation",
    matches: file => file === "scripts/tsconfig.gpc-release-tools.json" || file === "scripts/run-local-v2-dag-lambda-parity.ts" || file.includes("/gpc-") || file.startsWith("packages/certscore-contracts/src/canonical-evidence-artifact") || file === "packages/certscore-contracts/src/test-fixtures/canonical-wide-journeys.ts" || file.startsWith("packages/certscore-scan-core/src/artifact-writer") || file === "scripts/run-gpc-observation-local.ts" || file === "scripts/sync-gpc-observation-contract.ts" || file === "apps/v2-dag-lambda/src/handler.ts" || file === "packages/certscore-scan-core/src/index.ts",
    checks: [GPC_OBSERVATION_RELEASE_CHECK, GPC_PRODUCT_PRESENTATION_CHECK, GPC_RELEASE_TOOLS_CHECK, GPC_REAL_PIPELINE_CHECK],
  },
  {
    key: "runtime-graph-operations",
    label: "runtime graph rollout controls",
    matches: file => file === "scripts/runtime-graph-rollout.ts" || file === "scripts/runtime-graph-rollout.test.ts" || file.startsWith("scripts/lib/scanner-image-provenance") || file.startsWith("scripts/lib/scanner-configuration-scope") || file === "scripts/repair-scanner-image-provenance.ts" || file === "scripts/deploy-fast.ts" || file.startsWith("scripts/deploy-verified-ecs-settings.") || file === "scripts/check-regional-scanner-parity.ts",
    checks: [
      RUNTIME_GRAPH_RELEASE_CHECK,
      {
        key: "verified-ecs-settings",
        label: "settings-only ECS image verification",
        command: ["node", "--experimental-strip-types", "--test", "scripts/deploy-verified-ecs-settings.test.mjs"],
      }
    ],
  },
  {
    key: "web",
    label: "public web",
    matches: (file) =>
      isGlobalBuildInput(file) ||
      file === ".dockerignore" ||
      file === ".github/workflows/web-aws-ecs-deploy.yml" ||
      file === "scripts/assert-forward-web-deploy.ts" ||
      file.startsWith("apps/web/") ||
      file.startsWith("packages/certscore-contracts/") ||
      file.startsWith("packages/certscore-vendor-resolver/") ||
      file.startsWith("packages/db/") ||
      file.startsWith("packages/shared/") ||
      file.startsWith("packages/ui/") ||
      file.startsWith("packages/validation-shared/"),
    checks: [
      POLICY_SOURCE_WITNESS_CHECK,
      ASSESSMENT_HIGHLIGHTS_CHECK,
      REPORT_PRESENTATION_CHECK,
      CALIFORNIA_REVIEW_CHECK,
      RUNTIME_GRAPH_RELEASE_CHECK,
      SCAN_NO_GO_RELEASE_CHECK,
      ACCESSIBILITY_SCORING_CHECK,
      REPORT_PUBLICATION_CHECK,
      EVIDENCE_RECOVERY_CHECK,
      {
        key: "web-typecheck",
        label: "public web typecheck",
        command: ["pnpm", "--filter", "@website-signal-risk-scanner/web", "typecheck"]
      },
      {
        key: "web-scan-source-contracts",
        label: "scan-source and forward-deploy contracts",
        command: [
          "pnpm", "exec", "tsx", "--tsconfig", "apps/web/tsconfig.test.json", "--test",
          "apps/web/components/marketing/domain-scan-form.test.ts",
          "apps/web/components/scans/scan-from-select.test.tsx",
          "apps/web/server/scans/recent-scan-reuse.test.ts",
          "apps/web/server/scans/restricted-scan-options.test.ts",
          "scripts/assert-forward-web-deploy.test.ts",
          "scripts/deploy-latency.test.ts",
          "scripts/lib/deployment-consumer-barrier.test.ts",
          "scripts/web-deploy-migration-order.test.ts"
        ]
      },
      CANONICAL_PROJECTION_CHECK,
      {
        key: "post-refusal-release",
        label: "post-refusal release contracts",
        command: ["pnpm", "test:post-refusal-release"]
      }
    ]
  },
  {
    key: "validation-worker",
    label: "validation worker",
    matches: (file) =>
      isGlobalBuildInput(file) ||
      file === ".dockerignore" ||
      file === ".github/workflows/validation-aws-deploy.yml" ||
      file.startsWith("apps/validation-worker/") ||
      file.startsWith("apps/web/lib/scans/") ||
      file.startsWith("apps/web/server/") ||
      file.startsWith("infra/aws/validation/") ||
      file.startsWith("packages/db/") ||
      file.startsWith("packages/shared/") ||
      file.startsWith("packages/validation-shared/") ||
      file.startsWith("packages/web-bot-auth/"),
    checks: [
      RUNTIME_GRAPH_RELEASE_CHECK,
      SCAN_NO_GO_RELEASE_CHECK,
      REPORT_PUBLICATION_CHECK,
      EVIDENCE_RECOVERY_CHECK,
      CANONICAL_PROJECTION_CHECK,
      {
        key: "validation-worker-typecheck",
        label: "validation worker typecheck",
        command: ["pnpm", "--filter", "@website-signal-risk-scanner/validation-worker", "typecheck"]
      },
      {
        key: "validation-scan-pipeline",
        label: "validation scan pipeline",
        command: ["pnpm", "test:scan-pipeline"]
      }
    ]
  },
  {
    key: "v2-dag-lambda",
    label: "v2 DAG Lambda",
    matches: (file) =>
      isGlobalBuildInput(file) ||
      file.startsWith("apps/v2-dag-lambda/") ||
      file.startsWith("infra/aws/v2-dag-lambda/") ||
      file.startsWith("packages/certscore-contracts/") ||
      file.startsWith("packages/certscore-scan-core/") ||
      file.startsWith("packages/certscore-vendor-resolver/") ||
      file.startsWith("packages/shared/") ||
      file.startsWith("scripts/local-v2-dag-lambda/") ||
      file === ".github/workflows/v2-regulatory-gold-corpus.yml",
    checks: [
      POLICY_SOURCE_WITNESS_CHECK,
      SCAN_NO_GO_RELEASE_CHECK,
      REPORT_PUBLICATION_CHECK,
      EVIDENCE_RECOVERY_CHECK,
      CANONICAL_PROJECTION_CHECK,
      CALIFORNIA_REVIEW_CHECK,
      ACCESSIBILITY_AUDIT_CHECK,
      RUNTIME_GRAPH_CAPTURE_CHECK,
      CMP_INITIALIZATION_CAPTURE_CHECK,
      REPRESENTATIVE_PROOF_CHECK,
      {
        key: "scan-core-typecheck",
        label: "v2 scan-core typecheck",
        command: ["pnpm", "--filter", "@certscore/scan-core", "typecheck"]
      },
      {
        key: "scan-core-consent-quality",
        label: "v2 late-consent quality fixtures",
        command: ["pnpm", "--filter", "@certscore/scan-core", "test:integration-fixtures:consent"]
      },
      {
        key: "scan-core-policy-full",
        label: "v2 policy scanner full suite",
        command: ["pnpm", "--filter", "@certscore/scan-core", "test:policy:full"]
      },
      {
        key: "policy-negative-search",
        label: "policy discovery proof, missing-policy priority and nine-point deduction",
        command: ["pnpm", "exec", "tsx", "--tsconfig", "tsconfig.base.json", "--test",
          "packages/certscore-contracts/src/policy-surface-inspection.test.ts",
          "packages/certscore-scan-core/src/policy-negative-search.test.ts",
          "apps/web/lib/scans/checklist-concern-top-findings.test.ts"]
      },
      {
        key: "lambda-typecheck",
        label: "v2 DAG Lambda typecheck",
        command: ["pnpm", "--filter", "@website-signal-risk-scanner/v2-dag-lambda", "typecheck"]
      },
      {
        key: "lambda-tests",
        label: "v2 DAG Lambda tests",
        command: ["pnpm", "--filter", "@website-signal-risk-scanner/v2-dag-lambda", "test"]
      },
      {
        key: "post-refusal-release",
        label: "post-refusal release contracts",
        command: ["pnpm", "test:post-refusal-release"]
      }
    ]
  },
  {
    key: "db",
    label: "database package and migrations",
    matches: (file) =>
      isGlobalBuildInput(file) ||
      file.startsWith("packages/db/") ||
      file === "scripts/apply-db-migrations.ts" ||
      file === "scripts/apply-db-migrations.mjs" ||
      file === "scripts/web-deploy-migration-order.test.ts" ||
      file === ".github/workflows/prod-db-migrate.yml",
    checks: [
      {
        key: "db-migration-contracts",
        label: "database migration compatibility and deploy ordering",
        command: ["node", "--import", "tsx", "--test", "scripts/web-deploy-migration-order.test.ts"]
      },
      {
        key: "db-typecheck",
        label: "database package typecheck",
        command: ["pnpm", "--filter", "@website-signal-risk-scanner/db", "typecheck"]
      }
    ]
  }
];

function isGlobalBuildInput(file: string) {
  return file.startsWith("scripts/lib/release-") || ["scripts/release-node.mjs", "scripts/lib/scanner-artifact.ts", "scripts/lib/deployment-inputs.mjs", "scripts/lib/deployed-image.mjs", "scripts/select-workflow-deployment.mjs", "scripts/web-compiler-cache.mjs"].includes(file) || [
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "scripts/predeploy.ts",
    "scripts/lib/scan-release-regressions.ts",
    "scripts/review-scan-release-regressions.ts",
    "scripts/scan-release-regressions.test.ts",
    "docs/certscore-v2/scan-release-regressions.json",
    "docs/certscore-v2/scan-quality-calibration-manifest.json",
    "scripts/verify-scan-quality-calibration-registry.ts",
    "tsconfig.base.json",
    "turbo.json"
  ].includes(file);
}

/** The same plan is inspected by the calibration coverage review and executed below. */
export function getPredeployPlan(changedFiles: string[], options: { full?: boolean; allTargets?: boolean; targetKeys?: string[] } = {}) {
  if (options.full) return { targets: ["full"], checks: ROOT_FULL_CHECKS };
  if (options.targetKeys?.some(key => !TARGETS.some(target => target.key === key))) throw new Error("Unknown preflight target.");
  const targets = options.allTargets ? TARGETS : TARGETS.filter(target => options.targetKeys?.includes(target.key) || changedFiles.some(target.matches));
  return { targets: targets.map(target => target.key), checks: targets.length
    ? dedupeChecks([BOOTSTRAP_CHECK, RELEASE_PERFORMANCE_CHECK, RELEASE_REGRESSION_REVIEW_CHECK, ...targets.flatMap(target => target.checks)]) : [] };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.staged && !args.inventory) {
    await run(["node", "scripts/release-node.mjs", "scripts/deploy-fast.ts", "all", "--check-staging", "--base", args.baseRef!], { quiet: false });
  }

  if (args.mode === "full") {
    await runChecks(getPredeployPlan([], { full: true }).checks, args);
    return;
  }

  const changedFiles = await collectChangedFiles(args.baseRef);
  if (changedFiles.length === 0 && !args.allTargets && !args.targetKeys.length) {
    console.log("No changed files detected; fast predeploy has nothing to run.");
    return;
  }

  console.log("Fast predeploy changed files:");
  for (const file of changedFiles) {
    console.log(`  - ${file}`);
  }

  const selectedTargets = args.allTargets
    ? TARGETS
    : TARGETS.filter((target) => args.targetKeys.includes(target.key) || changedFiles.some(target.matches));
  if (selectedTargets.length === 0) {
    console.log("No deploy-targeted changes detected; fast predeploy has nothing to run.");
    return;
  }

  console.log("");
  console.log(`${args.allTargets ? "Fast deploy-all" : "Fast predeploy"} targets: ${selectedTargets.map((target) => target.label).join(", ")}`);

  const checks = getPredeployPlan(changedFiles, { allTargets: args.allTargets, targetKeys: args.targetKeys }).checks;
  await runChecks(checks, args);
}

function parseArgs(argv: string[]): Args {
  let baseRef: string | null = process.env.PREDEPLOY_BASE_REF ?? "origin/main";
  let mode: Args["mode"] = "fast";
  let allTargets = false;
  let inventory = false, requireReceipts = false, staged = false;
  const targetKeys: string[] = [];
  let receiptDir = process.env.PREDEPLOY_RECEIPT_DIR ?? path.join(tmpdir(), `certscore-preflight-${randomUUID()}`);
  let reuseDir: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === "--") {
      continue;
    }
    if (arg === "--target") {
      const value = argv[++index];
      if (!value || !TARGETS.some(target => target.key === value)) throw new Error("--target requires a known preflight target");
      targetKeys.push(value); continue;
    }
    if (arg === "--inventory") { inventory = true; continue; }
    if (arg === "--require-receipts") { requireReceipts = true; continue; }
    if (arg === "--staged") { staged = true; continue; }
    if (arg === "--receipt-dir" || arg === "--reuse-receipts") {
      const value = argv[++index];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a directory`);
      if (arg === "--receipt-dir") receiptDir = path.resolve(value); else reuseDir = path.resolve(value);
      continue;
    }
    if (arg === "--full") {
      mode = "full";
      continue;
    }
    if (arg === "--fast") {
      mode = "fast";
      continue;
    }
    if (arg === "--all") {
      allTargets = true;
      continue;
    }
    if (arg === "--base") {
      const value = argv[index + 1];
      if (!value?.trim()) {
        throw new Error("--base requires a nonempty git ref");
      }
      baseRef = value;
      index += 1;
      continue;
    }
    if (arg.startsWith("--base=")) {
      baseRef = arg.slice("--base=".length);
      if (!baseRef.trim()) throw new Error("--base requires a nonempty git ref");
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (staged && (mode !== "fast" || !allTargets || !baseRef || !/^[a-f0-9]{40}$/.test(baseRef))) {
    throw new Error("--staged requires preflight:all and the full live-base SHA.");
  }
  return { allTargets, baseRef, mode, inventory, receiptDir, reuseDir, requireReceipts, staged, targetKeys };
}

async function collectChangedFiles(baseRef: string | null) {
  const files = new Set<string>();

  if (baseRef) {
    if (!await gitRefExists(baseRef)) {
      throw new Error(`Preflight base is not available locally: ${baseRef}. Fetch the revision or supply an available --base ref.`);
    }
    const mergeBase = await git(["merge-base", baseRef, "HEAD"]);
    addLines(files, await git(["diff", "--name-only", `${mergeBase.trim()}..HEAD`]));
  }

  addLines(files, await git(["diff", "--name-only"]));
  addLines(files, await git(["diff", "--name-only", "--cached"]));
  addLines(files, await git(["ls-files", "--others", "--exclude-standard"]));

  return [...files].filter(Boolean).sort();
}

async function gitRefExists(ref: string) {
  const result = await run(["git", "cat-file", "-e", `${ref}^{commit}`], { quiet: true, reject: false });
  return result.exitCode === 0;
}

async function git(args: string[]) {
  const result = await run(["git", ...args], { quiet: true });
  return result.stdout;
}

function addLines(target: Set<string>, text: string) {
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed) {
      target.add(trimmed);
    }
  }
}

function dedupeChecks(checks: Check[]) {
  return deduplicateExecutions(checks);
}

async function runChecks(checks: Check[], args: Args) {
  checks = deduplicateExecutions(checks);
  if (args.inventory) { console.log(JSON.stringify(inventoryChecks(checks), null, 2)); return; }
  await checkReleasePrerequisites();
  let availableMb = freemem() / 1024 / 1024;
  if (process.platform === "darwin") {
    // macOS free pages exclude reclaimable/compressed memory; use its pressure probe.
    const report = execFileSync("memory_pressure", ["-Q"], { encoding: "utf8" });
    const percent = report.match(/System-wide memory free percentage: (\d+)%/);
    if (!percent) throw new Error("Available release memory could not be verified.");
    const { totalmem } = await import("node:os");
    availableMb = totalmem() / 1024 / 1024 * Number(percent[1]) / 100;
  } else if (process.platform === "linux") {
    const report = await readFile("/proc/meminfo", "utf8");
    const available = report.match(/^MemAvailable:\s+(\d+) kB/m);
    if (available) availableMb = Number(available[1]) / 1024;
  }
  const limits = releaseResourceLimits({ availableMb, cpus: availableParallelism(),
    requestedLanes: process.env.PREDEPLOY_LANES ? Number(process.env.PREDEPLOY_LANES) : undefined,
    requestedMemoryMb: process.env.PREDEPLOY_MEMORY_MB ? Number(process.env.PREDEPLOY_MEMORY_MB) : undefined });
  console.log(`Release resources: ${limits.lanes} lanes; ${limits.memoryMb} MiB shared cap. Browser/build/unknown groups run exclusively.`);
  console.log(`Immutable verification receipts: ${args.receiptDir}`);
  const previous: unknown[] = [];
  if (args.reuseDir) {
    for (const file of await readdir(args.reuseDir)) {
      if (!file.endsWith(".json")) continue;
      try { previous.push(JSON.parse(await readFile(path.join(args.reuseDir, file), "utf8"))); } catch { /* Malformed attempts are never reusable. */ }
    }
  }
  const initial = await releaseInputs();
  const started = performance.now();
  const stagingSmoke = "web-scan-source-contracts";
  const timings = await scheduleReleaseTasks(checks.map(check => ({
    key: check.key,
    dependencies: check.key === BOOTSTRAP_CHECK.key ? [] : [
      BOOTSTRAP_CHECK.key,
      ...(args.staged && check.key !== stagingSmoke ? [stagingSmoke] : [])
    ],
    ...checkResources(check),
    run: async () => {
      const inputs = await releaseInputs();
      if (inputs.sha !== initial.sha || inputs.fingerprint !== initial.fingerprint || inputs.environment !== initial.environment) {
        throw new Error("Release inputs changed since gate start; remaining checks were not started.");
      }
      const expected = { key: check.key, command: check.command, inputs };
      const matching = previous.filter(receipt => receiptMatches(receipt, expected));
      let outputsFingerprint: string | undefined;
      if (matching.length) {
        let outputsMatch = true;
        if (check.key === BOOTSTRAP_CHECK.key) {
          try { outputsFingerprint = await workspaceExportsFingerprint(); }
          catch { outputsMatch = false; }
          outputsMatch &&= matching.some(receipt => receipt.outputsFingerprint === outputsFingerprint);
        }
        if (outputsMatch) {
          if (check.key === BOOTSTRAP_CHECK.key) await run(["node", "scripts/release-node.mjs", "scripts/check-regional-web-bot-auth.ts", "--check-imports"]);
          console.log(`Verified exact-source receipt reused: ${check.key}`); return;
        }
      }
      if (args.requireReceipts) throw new Error(`No successful matching receipt for ${check.key}; rerun the applicable preflight.`);
      const startedAt = new Date().toISOString(), start = performance.now();
      let exitStatus = 1;
      console.log(`\n> ${check.label}\n$ ${check.command.join(" ")}`);
      try {
        await run(check.command, { quiet: false });
        if (check.key === BOOTSTRAP_CHECK.key) {
          outputsFingerprint = await workspaceExportsFingerprint();
          await run(["node", "scripts/release-node.mjs", "scripts/check-regional-web-bot-auth.ts", "--check-imports"]);
        }
        const after = await releaseInputs();
        if (after.fingerprint !== inputs.fingerprint || after.sha !== inputs.sha) throw new Error("Release inputs changed during verification; result is invalid.");
        exitStatus = 0;
      } catch (error) {
        exitStatus = typeof (error as { exitCode?: unknown }).exitCode === "number" ? (error as { exitCode: number }).exitCode : 1;
        throw error;
      } finally {
        await writeCheckReceipt(args.receiptDir, { version: 1, ...expected, outputsFingerprint, cwd: ".", startedAt,
          completedAt: new Date().toISOString(), exitStatus, durationMs: performance.now() - start });
      }
    },
  })), limits);
  const final = await releaseInputs();
  if (initial.fingerprint !== final.fingerprint || initial.sha !== final.sha) throw new Error("Release inputs changed during the gate.");
  console.log(`Preflight critical-path wall: ${((performance.now() - started) / 1000).toFixed(1)}s; parallel task total: ${(timings.reduce((sum, value) => sum + value.durationMs, 0) / 1000).toFixed(1)}s`);
}

function run(command: string[], options: { quiet?: boolean; reject?: boolean } = {}) {
  const [bin, ...args] = command;
  if (!bin) {
    throw new Error("Missing command");
  }

  return new Promise<{ exitCode: number; stdout: string }>((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const child = spawn(bin, args, {
      stdio: options.quiet ? ["ignore", "pipe", "pipe"] : "inherit"
    });

    if (child.stdout) {
      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });
    }
    if (child.stderr) {
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });
    }

    child.on("error", reject);
    child.on("close", (exitCode) => {
      const code = exitCode ?? 1;
      if (code !== 0 && options.reject !== false) {
        reject(Object.assign(new Error(`${command.join(" ")} failed with exit code ${code}${stderr ? `\n${stderr}` : ""}`), { exitCode: code }));
        return;
      }
      resolve({ exitCode: code, stdout });
    });
  });
}

if (process.argv[1] && existsSync(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
