import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { retainedWorkerDiscoveredClick } from "./lib/retained-worker-discovered-click.mjs";

const actions = ["accept", "reject"];
const regions = ["eu-west-1", "us-west-1", "eu-central-1"];
const hex64 = /^[a-f0-9]{64}$/;
const stages = new Set(["not_started", "gate_declined", "not_dispatched", "worker_failed",
  "worker_deadline_exceeded", "packet_deadline_exceeded", "packet_not_joined", "exact_recheck_failed", "packet_joined"]);

/** Reads previously frozen local evidence only. The plan supplies independently reviewed eligibility. */
export function reviewConsentActionCanary(plan, observations) {
  assert.equal(plan.version, "certscore.consent-action-canary-review.v1");
  assert.match(plan.buildGitSha, /^[a-f0-9]{40}$/);
  assert.ok([undefined, "worker_discovery"].includes(plan.executionMode), "Unsupported canary execution mode");
  const workerDiscovery = plan.executionMode === "worker_discovery";
  assert.ok(Array.isArray(plan.cases) && plan.cases.length > 0 && plan.cases.length <= 24);
  assert.ok(Array.isArray(observations) && observations.length === plan.cases.length);
  const known = new Map();
  for (const entry of observations) {
    assert.ok(entry.event?.scanId && !known.has(entry.event.scanId), "Duplicate or missing canary observation");
    known.set(entry.event.scanId, entry);
  }
  const summaries = Object.fromEntries(actions.map(action => [action, { eligible: 0, completed: 0,
    terminalStages: {}, missingProof: 0 }]));
  const failures = [];
  const cases = [];
  const seen = new Set();
  for (const item of plan.cases) {
    assert.ok(!seen.has(item.scanId) && regions.includes(item.region), "Duplicate or invalid planned scan");
    seen.add(item.scanId);
    assert.ok(Array.isArray(item.eligible) && item.eligible.length && item.eligible.length <= 2 &&
      new Set(item.eligible).size === item.eligible.length && item.eligible.every(x => actions.includes(x)));
    const entry = known.get(item.scanId);
    assert.ok(entry);
    const { event, manifest } = entry;
    assert.equal(event.event, workerDiscovery ? "consent_worker_discovery.v1" : "consent_gate_enforced.v1");
    if (workerDiscovery) assert.equal(item.region, "us-west-1");
    assert.equal(event.buildGitSha, plan.buildGitSha);
    assert.equal(event.region, item.region);
    assert.equal(event.manifestSha256, entry.manifestSha256);
    assert.equal(manifest.contractVersion, "certscore.v2.lambda-dag-artifact-manifest.v1");
    assert.equal(manifest.scanId, item.scanId);
    assert.equal(manifest.targetUrl, item.targetUrl);
    assert.equal(manifest.targetEnvironment, "production");
    assert.equal(manifest.artifactOnly, true);
    const target = new URL(item.targetUrl);
    assert.ok(["https:", "http:"].includes(target.protocol) && !target.username && !target.password);
    target.hash = "";
    const targetSha256 = createHash("sha256").update(target.href).digest("hex");
    const stage = manifest.consentActionStages;
    assert.equal(stage?.version, "certscore.consent-action-stages.v1");
    assert.equal(stage.scanId, item.scanId);
    assert.deepEqual(event.consentActionStages, stage);
    for (const action of actions) {
      if (workerDiscovery) {
        const eligible = item.eligible.includes(action);
        const enabled = event.discoveryActions?.[action];
        const reported = event[action + "Verified"];
        const receipt = manifest.workerDiscoveredClicks?.[action];
        const verified = retainedWorkerDiscoveredClick(manifest, item.scanId, action);
        assert.equal(typeof enabled, "boolean");
        assert.equal(typeof reported, "boolean");
        if (eligible || reported || receipt !== undefined) assert.equal(enabled, true);
        if (!enabled) continue;
        assert.ok(stages.has(stage[action]), "Unknown action stage");
        const out = summaries[action];
        cases.push({scanId:item.scanId,action,eligible,stage:stage[action],click:verified ? "completed" : "unverified"});
        if (eligible) {
          out.eligible++;
          out.terminalStages[stage[action]] = (out.terminalStages[stage[action]] ?? 0) + 1;
        }
        if ((receipt !== undefined && !verified) || reported !== verified || (verified && stage[action] !== "packet_joined")) {
          out.missingProof++;
          failures.push({scanId:item.scanId,action,reason:"invalid_worker_discovered_receipt"});
        } else if (verified && !eligible) {
          failures.push({scanId:item.scanId,action,reason:"completed_outside_eligible_cohort"});
        } else if (verified) out.completed++;
        continue;
      }
      const actual = event[action];
      const eligible = item.eligible.includes(action);
      const checkpoint = manifest[action + "ClickCheckpoint"];
      assert.deepEqual(event[action + "ClickCheckpoint"], checkpoint);
      if (!actual?.enforcementActive && !eligible && checkpoint === undefined) continue;
      assert.equal(actual?.enforcementActive, true, "An eligible action must have an enforced receipt");
      assert.ok(["unverified", "completed", "not_attempted", "incomplete"].includes(actual.click));
      const receipt = manifest[action + "GateShadowReceipt"];
      assert.equal(receipt?.version, `certscore.${action}-gate-shadow-receipt.v1`);
      assert.equal(receipt.scanId, item.scanId);
      assert.equal(receipt.enforcementActive, true);
      assert.deepEqual(receipt.passive, actual.passive);
      assert.deepEqual(receipt.dispatch, actual.dispatch);
      assert.deepEqual(receipt.finalRecheck, actual.finalRecheck);
      assert.ok(stages.has(stage[action]), "Unknown action stage");
      const out = summaries[action];
      cases.push({ scanId: item.scanId, action, eligible, stage: stage[action], click: actual.click });
      if (eligible) {
        out.eligible++;
        out.terminalStages[stage[action]] = (out.terminalStages[stage[action]] ?? 0) + 1;
      }
      if (checkpoint !== undefined) {
        const deadline = Date.parse(manifest.laneTimingSummary?.passiveLaneBarrierCompletedAt) + (action === "accept" ? 6000 : 8000);
        const timing = receipt.timing;
        const times = [timing?.proofIssuedAtMs, timing?.dispatchObservedAtMs, checkpoint.recheckedAtMs,
          checkpoint.dispatchedAtMs, checkpoint.completedAtMs, checkpoint.verifiedAtMs, deadline];
        const checkpointValid = checkpoint.version === `certscore.${action}-click-checkpoint.v1` &&
          checkpoint.scanId === item.scanId && hex64.test(checkpoint.gateProofSha256) &&
          hex64.test(checkpoint.receiptSha256) && receipt.binding?.requestedTargetSha256 === targetSha256 &&
          ["worker_deadline_exceeded", "packet_deadline_exceeded"].includes(stage[action]) &&
          actual.click === "unverified" && receipt.passive?.outcome === "qualified" &&
          receipt.dispatch?.outcome === "would_allow" && receipt.finalRecheck?.outcome === "unavailable" &&
          times.every((time, i) => Number.isSafeInteger(time) && (i === 0 || time >= times[i - 1])) &&
          checkpoint.dispatchedAtMs < timing?.proofExpiresAtMs && checkpoint.verifiedAtMs < deadline;
        if (!checkpointValid || !eligible) {
          out.missingProof += Number(!checkpointValid);
          failures.push({ scanId: item.scanId, action, reason: eligible ? "invalid_click_checkpoint" : "completed_outside_eligible_cohort" });
        } else out.checkpointOnly = (out.checkpointOnly ?? 0) + 1;
      }
      if (actual.click !== "completed") continue;
      const timing = receipt.timing;
      const recheckedAt = receipt.finalRecheck?.observedAtMs;
      const proofPassed = stage[action] === "packet_joined" && receipt.dispatch?.outcome === "would_allow" &&
        receipt.passive?.outcome === "qualified" && receipt.finalRecheck?.outcome === "passed" &&
        actual.boundControl === true && receipt.binding?.selectorEvidence === "verified_geometry" &&
        receipt.binding?.labelMatch === "exact" && receipt.binding?.requestedTargetSha256 === targetSha256 &&
        ["geometrySha256", "selectorSha256", "sourceSha256", "parentDispatchSha256", "documentTokenSha256"]
          .every(key => hex64.test(receipt.binding?.[key])) &&
        Number.isSafeInteger(recheckedAt) && Number.isSafeInteger(timing?.proofIssuedAtMs) &&
        Number.isSafeInteger(timing?.proofExpiresAtMs) && Number.isSafeInteger(timing?.dispatchObservedAtMs) &&
        timing.dispatchObservedAtMs >= timing.proofIssuedAtMs && timing.dispatchObservedAtMs <= recheckedAt &&
        recheckedAt < timing.proofExpiresAtMs;
      if (!proofPassed || !eligible) {
        out.missingProof += Number(!proofPassed);
        failures.push({ scanId: item.scanId, action, reason: eligible ? "completed_without_exact_proof" : "completed_outside_eligible_cohort" });
      } else out.completed++;
    }
  }
  for (const action of actions) {
    const gate = plan.thresholds?.[action], out = summaries[action];
    assert.ok(Number.isInteger(gate?.minEligible) && gate.minEligible > 0 &&
      Number.isFinite(gate?.minCompletionRate) && gate.minCompletionRate > 0 && gate.minCompletionRate <= 1 &&
      Number.isFinite(gate?.maxDeadlineLossRate) && gate.maxDeadlineLossRate >= 0 && gate.maxDeadlineLossRate <= 1,
    "An operator-reviewed threshold is required for each action");
    out.completionRate = out.eligible ? out.completed / out.eligible : null;
    if (out.checkpointOnly !== undefined) out.verifiedClicks = out.completed + out.checkpointOnly;
    const deadlineLosses = (out.terminalStages.worker_deadline_exceeded ?? 0) +
      (out.terminalStages.packet_deadline_exceeded ?? 0);
    out.deadlineLossRate = out.eligible ? deadlineLosses / out.eligible : null;
    if (out.eligible && out.deadlineLossRate > gate.maxDeadlineLossRate) {
      failures.push({action, reason: "deadline_loss_above_threshold"});
    }
    if (out.eligible < gate.minEligible) failures.push({action, reason: "insufficient_eligible_coverage"});
    else if (out.completionRate < gate.minCompletionRate) failures.push({action, reason: "completion_below_threshold"});
  }
  return { status: failures.length ? "stop" : "passed", buildGitSha: plan.buildGitSha, actions: summaries, cases, failures };
}

function readJson(file, cap = 2_000_000, receipt) {
  assert.ok(path.isAbsolute(file) && statSync(file).size <= cap);
  const bytes = readFileSync(file);
  if (receipt) {
    assert.equal(bytes.length, receipt.bytes);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), receipt.sha256);
  }
  return JSON.parse(bytes);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [planFile, indexFile, outputFile, ...extra] = process.argv.slice(2);
  assert.ok(planFile && indexFile && outputFile && path.isAbsolute(outputFile) && !extra.length);
  const plan = readJson(planFile, 64_000);
  const refs = readJson(indexFile, 64_000);
  assert.ok(Array.isArray(refs) && refs.length <= 24);
  const observations = refs.map(({ event, manifest }) => ({
    event: readJson(event.file, 64_000, event),
    manifest: readJson(manifest.file, 512 * 1024, manifest),
    manifestSha256: manifest.sha256,
  }));
  const result = reviewConsentActionCanary(plan, observations);
  writeFileSync(outputFile, JSON.stringify(result, null, 2) + "\n", {flag:"wx"});
  if (result.status !== "passed") process.exitCode = 2;
}
