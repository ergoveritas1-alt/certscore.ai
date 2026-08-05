import assert from "node:assert/strict";
import test from "node:test";
import { getChunkLoadRecoveryKey, isChunkLoadError } from "./chunk-load-recovery";

test("recognizes stale deployment chunk failures", () => {
  assert.equal(
    isChunkLoadError({
      message:
        "Loading chunk 9072 failed. (error: https://certscore.ai/_next/static/chunks/app/page-old.js?dpl=old)",
      name: "ChunkLoadError"
    }),
    true
  );
  assert.equal(
    isChunkLoadError({ message: "Failed to fetch dynamically imported module", name: "TypeError" }),
    true
  );
});

test("does not classify ordinary application errors as chunk failures", () => {
  assert.equal(isChunkLoadError({ message: "Database request failed", name: "Error" }), false);
});

test("scopes a recovery attempt to the route and failed deployment asset", () => {
  const first = getChunkLoadRecoveryKey(
    {
      message:
        "Loading chunk 9072 failed. (error: https://certscore.ai/_next/static/chunks/app/page-old.js?dpl=old)",
      name: "ChunkLoadError"
    },
    "/app/scans/scan-1"
  );
  const second = getChunkLoadRecoveryKey(
    {
      message:
        "Loading chunk 9072 failed. (error: https://certscore.ai/_next/static/chunks/app/page-new.js?dpl=new)",
      name: "ChunkLoadError"
    },
    "/app/scans/scan-1"
  );

  assert.notEqual(first, second);
  assert.match(first, /^certscore:chunk-load-recovery:\/app\/scans\/scan-1:/);
});
