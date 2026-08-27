#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { runScan } from "../index.js";
import {
  runPostRefusalObserver,
} from "../post-refusal-observer.js";
import {
  POST_REFUSAL_LAB_CASES,
  postRefusalLabRecipe,
  type PostRefusalLabCase,
} from "../post-refusal-lab-cases.js";
import {
  decidePostRefusalCooperativeAbort,
  decidePostRefusalReportPublication,
  POST_REFUSAL_CANONICAL_BARRIER_MAX_TAIL_WAIT_MS,
} from "../post-refusal-orchestration.js";
import { buildPostRefusalReconciliationEnvelope } from "../post-refusal-reconciliation.js";
import { startStaticFixtureServer } from "../test-fixtures/static-server.js";

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const server = args.url ? undefined : await startStaticFixtureServer();
  const targetUrl = args.url ?? server!.urlFor(POST_REFUSAL_LAB_CASES[args.fixture]);
  const actionRecipe = postRefusalLabRecipe(args.fixture);
  const runId = `post-refusal-lab-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const outDir = args.out ?? path.join(process.cwd(), "artifacts", "post-refusal-lab", runId);
  const scanStartedAtMs = Date.now();
  const abortController = new AbortController();
  let consentProofReadyAtMs = 0;
  let rejectActionDispatched = false;
  let abortSignal: {
    requestedAtMs: number;
    reason: string;
  } | undefined;

  await mkdir(outDir, { recursive: true });
  try {
    const consentProofPromise = runScan({
      url: targetUrl,
      profile: "tiny",
      evidenceLane: "consent_proof",
      outDir: path.join(outDir, "consent-proof"),
      preConsentScreenshotMode: "always",
    }).then((bundle) => {
      consentProofReadyAtMs = Math.max(0, Date.now() - scanStartedAtMs);
      const inventoryComplete = bundle.consentUiObservations.some((observation) =>
        observation.inventoryOutcome === "complete_with_controls" ||
        observation.inventoryOutcome === "complete_empty"
      );
      const rejectControlObserved = bundle.consentUiObservations.some((observation) =>
        observation.controls.some((control) =>
          control.actionType === "reject_all" &&
          control.visible !== false
        )
      );
      const decision = decidePostRefusalCooperativeAbort({
        consentInventoryComplete: inventoryComplete,
        rejectControlObserved,
        rejectActionDispatched,
      });
      if (decision.abortRequested && !abortController.signal.aborted) {
        abortSignal = {
          requestedAtMs: consentProofReadyAtMs,
          reason: decision.reason,
        };
        abortController.abort(new Error(decision.reason));
      }
      return { bundle, inventoryComplete, rejectControlObserved, abortDecision: decision };
    });

    const rejectPromise = runPostRefusalObserver({
      scanId: `${runId}-reject-only`,
      parentScanId: runId,
      url: targetUrl,
      recipe: actionRecipe,
      scanStartedAtMs,
      dispatchDelayMs: args.delayMs,
      observationWindowMs: args.observationMs,
      confirmationTimeoutMs: args.confirmationMs,
      actionSearchTimeoutMs: args.actionSearchMs,
      interactionAuthorization: {
        authorizationId: "loopback_local_lab",
        kind: "loopback",
      },
      fulfillThirdPartyRequestsLocally: true,
      signal: abortController.signal,
      onLifecycleEvent: (event) => {
        if (event.type === "action_dispatched") rejectActionDispatched = true;
      },
      outDir: path.join(outDir, "reject-only"),
    });

    const [consentProof, rejectPacket] = await Promise.all([consentProofPromise, rejectPromise]);
    const publicationDecision = decidePostRefusalReportPublication({
      primaryReadyAtMs: consentProofReadyAtMs,
      rejectReadyAtMs: rejectPacket.timing.readyAtMs,
      approvedJoinWaitMs: args.joinWaitMs,
      maxTailWaitMs: POST_REFUSAL_CANONICAL_BARRIER_MAX_TAIL_WAIT_MS,
    });
    const reconciliationEnvelope = buildPostRefusalReconciliationEnvelope({
      parentScanId: runId,
      baseEvidence: consentProof.bundle,
      packet: rejectPacket,
      publicationDecision,
    });
    const reconciliationPath = path.join(outDir, "PostRefusalReconciliationEnvelope.json");
    await writeFile(reconciliationPath, `${JSON.stringify(reconciliationEnvelope, null, 2)}\n`, "utf8");
    const report = {
      artifactVersion: "certscore.post_refusal_timing_lab.v1",
      artifactOnly: true,
      productionProjectable: false,
      generatedAt: new Date().toISOString(),
      runId,
      targetUrl,
      fixture: args.fixture,
      configuration: {
        dispatchDelayMs: args.delayMs,
        observationWindowMs: args.observationMs,
        confirmationTimeoutMs: args.confirmationMs,
        actionSearchTimeoutMs: args.actionSearchMs,
        approvedJoinWaitMs: args.joinWaitMs,
        primaryComparisonScope: "consent_proof_lane_only",
      },
      consentProof: {
        readyAtMs: consentProofReadyAtMs,
        durationMs: consentProofReadyAtMs,
        inventoryComplete: consentProof.inventoryComplete,
        rejectControlObserved: consentProof.rejectControlObserved,
        abortDecision: consentProof.abortDecision,
      },
      rejectOnly: {
        readyAtMs: rejectPacket.timing.readyAtMs,
        durationMs: rejectPacket.timing.totalMs,
        resolverFound: rejectPacket.resolver.found,
        registrationStatus: rejectPacket.refusalRegistration.status,
        refusalExercised: rejectPacket.refusalRegistration.refusalExercised,
        observationCount: rejectPacket.observations.length,
        postRefusalNonEssentialRequestCount: rejectPacket.network.postRefusalNonEssentialRequests.length,
        timing: rejectPacket.timing,
      },
      publicationDecision,
      reconciliation: {
        path: reconciliationPath,
        status: reconciliationEnvelope.status,
        disposition: reconciliationEnvelope.disposition,
      },
      cooperativeAbortSignal: abortSignal ?? null,
      limitations: [
        "localhost_only_experimental_timing",
        "consent_proof_lane_is_not_the_complete_three_lane_primary_ready_time",
        "lambda_cold_start_queue_and_s3_latency_not_represented",
      ],
    };
    const reportPath = path.join(outDir, "PostRefusalTimingLab.json");
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(JSON.stringify({
      reportPath,
      reconciliationPath,
      consentProofReadyAtMs,
      rejectReadyAtMs: rejectPacket.timing.readyAtMs,
      rejectReadyDeltaMs: publicationDecision.rejectReadyDeltaMs,
      publicationMode: publicationDecision.mode,
      registrationStatus: rejectPacket.refusalRegistration.status,
      observations: rejectPacket.observations.length,
      reconciliationDisposition: reconciliationEnvelope.disposition,
    }, null, 2));
  } finally {
    await server?.close();
  }
}

function parseArgs(argv: string[]) {
  const parsed: {
    fixture: PostRefusalLabCase;
    url?: string;
    out?: string;
    delayMs: number;
    observationMs: number;
    confirmationMs: number;
    actionSearchMs: number;
    joinWaitMs: number;
  } = {
    fixture: "ignored",
    delayMs: 500,
    observationMs: 8_000,
    confirmationMs: 1_500,
    actionSearchMs: 1_500,
    joinWaitMs: 0,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === "--fixture" && value && value in POST_REFUSAL_LAB_CASES) {
      parsed.fixture = value as PostRefusalLabCase;
      index += 1;
    } else if (key === "--url" && value) {
      parsed.url = value;
      index += 1;
    } else if (key === "--out" && value) {
      parsed.out = path.resolve(value);
      index += 1;
    } else if (key === "--delay-ms" && value) {
      parsed.delayMs = numberArg(value, 0, 10_000);
      index += 1;
    } else if (key === "--observation-ms" && value) {
      parsed.observationMs = numberArg(value, 0, 30_000);
      index += 1;
    } else if (key === "--confirmation-ms" && value) {
      parsed.confirmationMs = numberArg(value, 50, 5_000);
      index += 1;
    } else if (key === "--action-search-ms" && value) {
      parsed.actionSearchMs = numberArg(value, 0, 10_000);
      index += 1;
    } else if (key === "--join-wait-ms" && value) {
      parsed.joinWaitMs = numberArg(value, 0, 5_000);
      index += 1;
    }
  }
  return parsed;
}

function numberArg(value: string, min: number, max: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, Math.round(number)));
}
