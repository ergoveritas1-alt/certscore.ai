#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { runScan } from "../index.js";
import {
  POST_REFUSAL_LAB_CASES,
  postRefusalLabRecipe,
  type PostRefusalLabCase,
} from "../post-refusal-lab-cases.js";
import { runPostRefusalObserver } from "../post-refusal-observer.js";
import {
  comparePostRefusalLaneReadiness,
  decidePostRefusalReportPublication,
} from "../post-refusal-orchestration.js";
import { buildPostRefusalSupplementEnvelope } from "../post-refusal-supplement.js";
import {
  authorizePostRefusalTarget,
  ERGOVERITAS_POST_REFUSAL_CANARY_AUTHORIZATION_ID,
  getOwnedPostRefusalCanaryRecipeCase,
  isLoopbackPostRefusalTarget,
  type PostRefusalInteractionAuthorization,
} from "../post-refusal-target-authorization.js";
import { startStaticFixtureServer } from "../test-fixtures/static-server.js";

const DEFAULT_CASES: PostRefusalLabCase[] = [
  "ignored",
  "tcf",
  "contradiction",
  "cookiebot",
  "usercentrics",
];

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const server = args.targetUrl ? undefined : await startStaticFixtureServer();
  const targetAuthorization = interactionAuthorization(
    args.targetUrl,
    args.ownedErgoCanary,
    args.publicAllowlistId,
  );
  if (args.targetUrl) {
    const decision = authorizePostRefusalTarget(args.targetUrl, targetAuthorization);
    if (!decision.authorized) {
      throw new Error(`Target authorization failed before cohort dispatch: ${decision.reason}.`);
    }
  }
  const generatedAt = new Date().toISOString();
  const outDir = args.out ?? path.join(
    process.cwd(),
    "artifacts",
    "post-refusal-cohort",
    generatedAt.replace(/[:.]/g, "-"),
  );
  await mkdir(outDir, { recursive: true });
  const runs: Array<Awaited<ReturnType<typeof runCase>>> = [];

  try {
    for (let repetition = 1; repetition <= args.repetitions; repetition += 1) {
      for (const fixture of args.fixtures) {
        const run = await runCase({
          actionSearchMs: args.actionSearchMs,
          dispatchDelayMs: args.dispatchDelayMs,
          fixture,
          joinWaitMs: args.joinWaitMs,
          observationMs: args.observationMs,
          outDir: path.join(outDir, `${fixture}-${repetition}`),
          policyProvider: args.policyProvider,
          repetition,
          interactionAuthorization: targetAuthorization,
          targetUrl: args.targetUrl ?? server!.urlFor(POST_REFUSAL_LAB_CASES[fixture]),
        });
        runs.push(run);
        console.log(JSON.stringify({
          event: "post_refusal_cohort_case_completed",
          fixture,
          repetition,
          primaryReadyAtMs: run.primaryReadyAtMs,
          consentProofReadyAtMs: run.laneReadyAtMs.consent_proof,
          rejectReadyAtMs: run.rejectReadyAtMs,
          rejectReadyVsConsentProofDeltaMs: run.laneTimingComparison.consentProofDeltaMs,
          rejectReadyDeltaMs: run.publicationDecision.rejectReadyDeltaMs,
          mode: run.publicationDecision.mode,
          observations: run.observationCount,
        }));
      }
    }
  } finally {
    await server?.close();
  }

  const report = {
    artifactVersion: "certscore.post_refusal_three_lane_cohort.v2",
    artifactOnly: true,
    productionProjectable: false,
    generatedAt,
    targetProfile: args.targetUrl
      ? args.ownedErgoCanary
        ? "ergoveritas_owned_live_canary"
        : args.publicAllowlistId
          ? "explicit_public_calibration"
        : "explicit_loopback_canary"
      : "ergoveritas_owned_canary_local_fixture_model",
    configuration: {
      fixtures: args.fixtures,
      repetitions: args.repetitions,
      dispatchDelayMs: args.dispatchDelayMs,
      observationWindowMs: args.observationMs,
      actionSearchTimeoutMs: args.actionSearchMs,
      approvedJoinWaitMs: args.joinWaitMs,
      policyProvider: args.policyProvider,
      targetUrl: args.targetUrl ?? null,
      primaryBarrier: "all_three_local_evidence_lanes_completed",
      laneSpecificTiming: "reject_ready_compared_with_each_required_lane",
    },
    summary: summarize(runs),
    runs,
    limitations: [
      args.publicAllowlistId ? "single_exact_target_public_calibration" : "loopback_or_owned_canary_only",
      ...(args.publicAllowlistId
        ? ["single_deterministic_first_layer_reject_action_only"]
        : ["models_ergoveritas_owned_canary_patterns"]),
      "local_three_lane_completion_barrier_excludes_lambda_cold_start_queue_s3_and_worker_merge_overhead",
      "artifact_only_no_wc01_projection_or_scoring",
    ],
  };
  const reportPath = path.join(outDir, "PostRefusalThreeLaneCohort.json");
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ reportPath, summary: report.summary }, null, 2));
}

async function runCase(input: {
  actionSearchMs: number;
  dispatchDelayMs: number;
  fixture: PostRefusalLabCase;
  interactionAuthorization: PostRefusalInteractionAuthorization;
  joinWaitMs: number;
  observationMs: number;
  outDir: string;
  policyProvider: "deterministic" | "real";
  repetition: number;
  targetUrl: string;
}) {
  await mkdir(input.outDir, { recursive: true });
  const scanStartedAtMs = Date.now();
  const laneReadyAtMs: Record<"consent_proof" | "runtime_evidence" | "policy_evidence", number> = {
    consent_proof: 0,
    runtime_evidence: 0,
    policy_evidence: 0,
  };
  const runLane = async (lane: keyof typeof laneReadyAtMs) => {
    const bundle = await runScan({
      url: input.targetUrl,
      profile: "tiny",
      evidenceLane: lane,
      outDir: path.join(input.outDir, lane.replaceAll("_", "-")),
      ...(lane === "consent_proof" ? { preConsentScreenshotMode: "always" as const } : {}),
      ...(lane === "policy_evidence" && input.policyProvider === "deterministic"
        ? {
            localPolicyNanoAssistProvider: {
              async classifyLinks(classificationInput) {
                return {
                  assistId: classificationInput.assistId,
                  rankedCandidates: [],
                };
              },
            },
          }
        : {}),
    });
    laneReadyAtMs[lane] = Date.now() - scanStartedAtMs;
    return bundle;
  };

  const consentPromise = runLane("consent_proof");
  const runtimePromise = runLane("runtime_evidence");
  const policyPromise = runLane("policy_evidence");
  const rejectPromise = runPostRefusalObserver({
    scanId: `post-refusal-${input.fixture}-${input.repetition}`,
    parentScanId: `three-lane-${input.fixture}-${input.repetition}`,
    url: input.targetUrl,
    recipe: postRefusalLabRecipe(input.fixture),
    scanStartedAtMs,
    dispatchDelayMs: input.dispatchDelayMs,
    observationWindowMs: input.observationMs,
    confirmationTimeoutMs: 1_500,
    actionSearchTimeoutMs: input.actionSearchMs,
    interactionAuthorization: input.interactionAuthorization,
    fulfillThirdPartyRequestsLocally: isLoopbackPostRefusalTarget(input.targetUrl),
    outDir: path.join(input.outDir, "reject-only"),
  });

  const [consentProof, runtimeEvidence, policyEvidence, rejectPacket] = await Promise.all([
    consentPromise,
    runtimePromise,
    policyPromise,
    rejectPromise,
  ]);
  const laneTimingComparison = comparePostRefusalLaneReadiness({
    laneReadyAtMs,
    rejectReadyAtMs: rejectPacket.timing.readyAtMs,
  });
  const primaryReadyAtMs = laneTimingComparison.primaryReadyAtMs;
  const publicationDecision = decidePostRefusalReportPublication({
    primaryReadyAtMs,
    rejectReadyAtMs: rejectPacket.timing.readyAtMs,
    approvedJoinWaitMs: input.joinWaitMs,
  });
  const supplement = buildPostRefusalSupplementEnvelope({
    parentScanId: `three-lane-${input.fixture}-${input.repetition}`,
    baseEvidence: { consentProof, runtimeEvidence, policyEvidence },
    packet: rejectPacket,
    publicationDecision,
  });
  await writeFile(
    path.join(input.outDir, "PostRefusalSupplementEnvelope.json"),
    `${JSON.stringify(supplement, null, 2)}\n`,
    "utf8",
  );
  return {
    fixture: input.fixture,
    repetition: input.repetition,
    laneReadyAtMs,
    laneTimingComparison,
    primaryReadyAtMs,
    rejectReadyAtMs: rejectPacket.timing.readyAtMs,
    refusalRegistrationStatus: rejectPacket.refusalRegistration.status,
    observationCount: rejectPacket.observations.length,
    observationExitReason: rejectPacket.timing.observationExitReason ?? null,
    publicationDecision,
    supplementDisposition: supplement.disposition,
  };
}

function summarize(runs: Array<Awaited<ReturnType<typeof runCase>>>) {
  const deltas = runs.map((run) => run.publicationDecision.rejectReadyDeltaMs).sort((a, b) => a - b);
  const consentProofDeltas = runs
    .map((run) => run.laneTimingComparison.consentProofDeltaMs)
    .sort((a, b) => a - b);
  return {
    runCount: runs.length,
    rejectReadyBeforeConsentProofCount: runs.filter(
      (run) => run.laneTimingComparison.rejectReadyBeforeConsentProof,
    ).length,
    rejectReadyBeforePrimaryCount: runs.filter((run) => run.rejectReadyAtMs <= run.primaryReadyAtMs).length,
    initialReportCount: runs.filter((run) => run.publicationDecision.mode !== "late_generation").length,
    lateGenerationCount: runs.filter((run) => run.publicationDecision.mode === "late_generation").length,
    medianRejectReadyDeltaMs: median(deltas),
    minimumRejectReadyDeltaMs: deltas[0] ?? 0,
    maximumRejectReadyDeltaMs: deltas.at(-1) ?? 0,
    medianRejectReadyVsConsentProofDeltaMs: median(consentProofDeltas),
    minimumRejectReadyVsConsentProofDeltaMs: consentProofDeltas[0] ?? 0,
    maximumRejectReadyVsConsentProofDeltaMs: consentProofDeltas.at(-1) ?? 0,
  };
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const middle = Math.floor(values.length / 2);
  return values.length % 2 === 0
    ? Math.round(((values[middle - 1] ?? 0) + (values[middle] ?? 0)) / 2)
    : values[middle] ?? 0;
}

function parseArgs(argv: string[]) {
  const parsed: {
    actionSearchMs: number;
    dispatchDelayMs: number;
    fixtures: PostRefusalLabCase[];
    joinWaitMs: number;
    observationMs: number;
    ownedErgoCanary: boolean;
    out?: string;
    policyProvider: "deterministic" | "real";
    publicAllowlistId?: string;
    repetitions: number;
    targetUrl?: string;
  } = {
    actionSearchMs: 1_500,
    dispatchDelayMs: 2_000,
    fixtures: DEFAULT_CASES,
    joinWaitMs: 0,
    observationMs: 8_000,
    ownedErgoCanary: false,
    policyProvider: "deterministic",
    repetitions: 2,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === "--fixtures" && value) {
      const fixtures = value.split(",").filter((item): item is PostRefusalLabCase =>
        item in POST_REFUSAL_LAB_CASES
      );
      if (fixtures.length === 0) throw new Error("--fixtures did not include a known local case.");
      parsed.fixtures = fixtures;
      index += 1;
    } else if (key === "--repetitions" && value) {
      parsed.repetitions = numberArg(value, 1, 20);
      index += 1;
    } else if (key === "--delay-ms" && value) {
      parsed.dispatchDelayMs = numberArg(value, 0, 10_000);
      index += 1;
    } else if (key === "--observation-ms" && value) {
      parsed.observationMs = numberArg(value, 0, 30_000);
      index += 1;
    } else if (key === "--action-search-ms" && value) {
      parsed.actionSearchMs = numberArg(value, 0, 10_000);
      index += 1;
    } else if (key === "--join-wait-ms" && value) {
      parsed.joinWaitMs = numberArg(value, 0, 5_000);
      index += 1;
    } else if (key === "--policy-provider" && (value === "deterministic" || value === "real")) {
      parsed.policyProvider = value;
      index += 1;
    } else if (key === "--target-url" && value) {
      parsed.targetUrl = normalizeTargetUrl(value);
      index += 1;
    } else if (key === "--owned-ergo-canary") {
      parsed.ownedErgoCanary = true;
    } else if (key === "--public-allowlist-id" && value) {
      parsed.publicAllowlistId = value.trim().slice(0, 160);
      index += 1;
    } else if (key === "--out" && value) {
      parsed.out = path.resolve(value);
      index += 1;
    }
  }
  if (parsed.targetUrl && parsed.fixtures.length !== 1) {
    throw new Error("--target-url requires exactly one --fixtures recipe selection.");
  }
  if (parsed.ownedErgoCanary && parsed.publicAllowlistId) {
    throw new Error("Choose either --owned-ergo-canary or --public-allowlist-id, not both.");
  }
  if (parsed.ownedErgoCanary && parsed.targetUrl) {
    const requiredRecipeCase = getOwnedPostRefusalCanaryRecipeCase(parsed.targetUrl);
    if (!requiredRecipeCase) {
      throw new Error("--owned-ergo-canary requires one exact registered owned-canary page URL.");
    }
    if (parsed.fixtures[0] !== requiredRecipeCase) {
      throw new Error(
        `Owned ErgoVeritas canaries require --fixtures ${requiredRecipeCase} for their canonical CMP recipe.`,
      );
    }
  }
  if (
    parsed.targetUrl &&
    !isLoopbackPostRefusalTarget(parsed.targetUrl) &&
    !parsed.ownedErgoCanary &&
    !parsed.publicAllowlistId
  ) {
    throw new Error("A non-loopback --target-url requires an explicit owned-canary or public calibration authorization.");
  }
  if (parsed.targetUrl && !isLoopbackPostRefusalTarget(parsed.targetUrl) && parsed.policyProvider !== "real") {
    throw new Error("A public cohort requires --policy-provider real.");
  }
  return parsed;
}

function interactionAuthorization(
  targetUrl: string | undefined,
  ownedErgoCanary: boolean,
  publicAllowlistId: string | undefined,
): PostRefusalInteractionAuthorization {
  if (!targetUrl || isLoopbackPostRefusalTarget(targetUrl)) {
    return { authorizationId: "loopback_local_lab", kind: "loopback" };
  }
  if (ownedErgoCanary) {
    return {
      authorizationId: ERGOVERITAS_POST_REFUSAL_CANARY_AUTHORIZATION_ID,
      kind: "owned_canary",
    };
  }
  if (!publicAllowlistId) throw new Error("Public calibration authorization was not explicitly enabled.");
  const target = new URL(targetUrl);
  return {
    authorizationId: publicAllowlistId,
    kind: "explicit_allowlist",
    targets: [{
      hostname: target.hostname,
      pathPrefix: target.pathname || "/",
    }],
  };
}

function normalizeTargetUrl(value: string): string {
  const parsed = new URL(value);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("--target-url must use HTTP or HTTPS.");
  }
  parsed.hash = "";
  return parsed.toString();
}

function numberArg(value: string, min: number, max: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, Math.round(number)));
}
