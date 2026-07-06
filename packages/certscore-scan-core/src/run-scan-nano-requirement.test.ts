import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { runScan } from "./index.js";

test("runScan blocks post-consent consent-flow runtime even when explicitly requested", async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-v2-consent-flow-disabled-"));
  const outDir = path.join(tempRoot, "consent-out");

  try {
    await assert.rejects(
      () => runScan({
        url: "https://example.com",
        profile: "consent_flow",
        outDir,
        postConsentFlowsEnabled: true,
      }),
      /Post-consent consent-flow runtime is intentionally disabled/,
    );
    await assert.rejects(() => stat(path.join(outDir, "CanonicalEvidenceBundle.json")));
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("runScan escalates before policy scan when Nano policy credentials are missing", async () => {
  const previousOpenAiApiKey = process.env.OPENAI_API_KEY;
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-v2-nano-required-"));
  const outDir = path.join(tempRoot, "policy-out");
  delete process.env.OPENAI_API_KEY;

  try {
    await assert.rejects(
      () => runScan({
        url: "https://example.com",
        profile: "policy",
        outDir,
      }),
      /Nano policy assist is required for CertScore v2 policy-surface profiles/,
    );
    await assert.rejects(() => stat(path.join(outDir, "CanonicalEvidenceBundle.json")));
  } finally {
    if (previousOpenAiApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = previousOpenAiApiKey;
    }
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("runScan bounds planned-parallel policy output instead of waiting unbounded", async () => {
  const source = await readFile(new URL("./index.ts", import.meta.url), "utf8");
  const requiredExpression = source.match(/const policyRequiredForOutput = ([^;]+);/)?.[1] ?? "";

  assert.match(requiredExpression, /!plannedParallel/);
  assert.match(requiredExpression, /input\.captureReplay/);
  assert.doesNotMatch(requiredExpression, /!consentFlowEnabled/);
  assert.match(source, /planned_parallel_policy_output_deadline_elapsed/);
  assert.match(source, /policyOutputGraceMs/);
  assert.match(source, /policy_surface_output_budget_elapsed/);
  assert.match(source, /canonicalPathPrefetchRan/);
});
