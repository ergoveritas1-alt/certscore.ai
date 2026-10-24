import assert from "node:assert/strict";
import test from "node:test";
import {SCAN_NO_GO_REASON_CODES, projectExternalScanNoGo, resolveScanNoGoPresentation} from "./scan-no-go-reasons";

test("all canonical no-go presentations and the unknown fallback use CertScore.ai", () => {
  for(const code of [...SCAN_NO_GO_REASON_CODES,"unknown_future_reason"]) {
    const presentation=resolveScanNoGoPresentation(code);
    const external=projectExternalScanNoGo({scan_no_go_assessment:{decision:"no_go",reasonCodes:[code]}})!;
    for(const value of [...Object.values(presentation),...Object.values(external.noGo)]) {
      if(typeof value==="string") assert.doesNotMatch(value,/\bCertScore\b(?!\.ai)/,code);
    }
    assert.equal(external.noGo.reasonCode,code==="unknown_future_reason"?"unknown":code);
  }
});
