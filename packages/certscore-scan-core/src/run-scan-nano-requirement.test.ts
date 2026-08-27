import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
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

test("runScan rejects deterministic local policy assist on public targets", async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-v2-local-policy-provider-"));
  try {
    await assert.rejects(
      () => runScan({
        url: "https://example.com",
        evidenceLane: "policy_evidence",
        outDir: path.join(tempRoot, "policy-out"),
        localPolicyNanoAssistProvider: {
          async classifyLinks(input) {
            return { assistId: input.assistId, rankedCandidates: [] };
          },
        },
      }),
      /restricted to loopback scan targets/,
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
