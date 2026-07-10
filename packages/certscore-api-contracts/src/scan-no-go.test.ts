import assert from "node:assert/strict";
import test from "node:test";
import sharedNoGoModule from "../../shared/src/scan-no-go-reasons.js";
import { publicScanNoGoReasonCodes, scanNoGoResultSchema } from "./scan-no-go.js";

const { SCAN_NO_GO_REASON_CODES } = sharedNoGoModule as typeof import("../../shared/src/scan-no-go-reasons.js");

test("public no-go reason schema stays in parity with the canonical registry", () => {
  assert.deepEqual(publicScanNoGoReasonCodes.filter((code) => code !== "unknown"), SCAN_NO_GO_REASON_CODES);
  for (const reasonCode of SCAN_NO_GO_REASON_CODES) {
    assert.equal(scanNoGoResultSchema.parse({
      reasonCode,
      title: "Friendly title",
      explanation: "Friendly explanation",
      summary: "Friendly summary",
      limitationKind: "target_site_state",
      recommendedNextAction: "Retry later.",
      retryLikelyToHelp: true
    }).reasonCode, reasonCode);
  }
});
