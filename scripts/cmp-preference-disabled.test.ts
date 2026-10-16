import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("AWS deployment keeps the owner-disabled preference lane off", async () => {
  const deployment = await readFile(new URL("./deploy-fast.ts", import.meta.url), "utf8");
  assert.match(deployment, /CERTSCORE_CMP_PREFERENCE_INSPECTION_ENABLED:\s*"0"/);
  assert.doesNotMatch(deployment, /CERTSCORE_CMP_PREFERENCE_INSPECTION_ENABLED:\s*"1"/);
  assert.match(deployment, /CERTSCORE_POST_ACCEPT_WORKER_ENABLED:\s*"1"/);
  assert.match(deployment, /CERTSCORE_POST_REFUSAL_REJECT_WORKER_ENABLED:\s*"1"/);
});
