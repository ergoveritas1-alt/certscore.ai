import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { runScan } from "./index.js";

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
