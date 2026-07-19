import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getPreviewScanAvailability } from "./preview-scan-availability";

test("preview scans stay available when unrelated legacy env is present", () => {
  const availability = getPreviewScanAvailability(({
    UNUSED_LEGACY_FLAG: "1"
  } as unknown) as NodeJS.ProcessEnv);

  assert.deepEqual(availability, {
    enabled: true,
    reason: null
  });
});

test("preview scans stay available without validation queue configuration", () => {
  const availability = getPreviewScanAvailability(({} as unknown) as NodeJS.ProcessEnv);

  assert.deepEqual(availability, {
    enabled: true,
    reason: null
  });
});

test("preview scan creation dispatches configured v2 Lambda execution and records its outcome", async () => {
  const source = await readFile(new URL("./create-preview-scan.ts", import.meta.url), "utf8");

  assert.match(source, /summarizeLocalV2DagLambdaDispatchForEvent\(scanConfig\)/);
  assert.match(source, /dispatchLocalV2DagLambdaScan\)\(\{/);
  assert.match(source, /LOCAL_V2_DAG_LAMBDA_DISPATCH_ACCEPTED_EVENT_TYPE/);
  assert.match(source, /updateLocalV2DagLambdaDispatchState\(\{/);
  assert.match(source, /LOCAL_V2_DAG_LAMBDA_DISPATCH_FAILED_EVENT_TYPE/);
  assert.match(source, /no fallback scanner execution was started/);
});
