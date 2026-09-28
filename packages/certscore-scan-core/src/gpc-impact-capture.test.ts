import assert from "node:assert/strict";
import test from "node:test";
import { gpcRuntimeFixture } from "../../certscore-contracts/src/test-fixtures/gpc-runtime";
import { gpcImpactCaptureSchema } from "../../certscore-contracts/src/gpc-impact";
import { createGpcImpactCapture } from "./gpc-impact-capture";

function setup() {
  const b = gpcRuntimeFixture({ enabled: true });
  let now = 0;
  const capture = createGpcImpactCapture({ expectedEnabled: true, now: () => now });
  capture.documentRequested({ type: "Document", frameId: "main", loaderId: "loader", request: { url: b.url, headers: { "Sec-GPC": "1" } } }, "main");
  now = 100;
  capture.documentCommitted({ loaderId: "loader", url: b.url });
  capture.bindReadback("loader");
  const finish = () => { now = 1500; return capture.finish({ ...b.gpcSignalObservation!, capturedAtMs: now }); };
  return { capture, finish, url: b.url };
}

test("same-URL history update preserves fixed windows and frozen evidence", () => {
  const { capture, finish, url } = setup();
  capture.navigatedWithinDocument({ url, navigationType: "historyApi" }, "loader");
  const result = finish();
  assert.equal(result.windows.length, 3);
  assert.deepEqual(result.invalidationReasons, []);
  capture.invalidate("renderer_crash");
  capture.navigatedWithinDocument({ url: `${url}changed`, navigationType: "historyApi" }, "loader");
  assert.strictEqual(finish(), result);
  const { invalidationReasons: _new, ...legacy } = result;
  assert.deepEqual(gpcImpactCaptureSchema.parse(legacy), legacy, "legacy packets remain unchanged");
});

test("changed route then return, unknown identity, fragments and recommits stay invalid", () => {
  for (const defect of ["route", "token", "missing_url", "malformed_url", "unknown_type", "fragment", "history_fragment", "recommit", "crash"] as const) {
    const { capture, finish, url } = setup();
    if (defect === "recommit") capture.documentCommitted({ loaderId: "loader", url });
    else if (defect === "crash") capture.invalidate("renderer_crash");
    else capture.navigatedWithinDocument({
      url: defect === "missing_url" ? undefined : defect === "malformed_url" ? "invalid" : defect === "route" ? `${url}changed` : defect === "fragment" || defect === "history_fragment" ? `${url}#other` : url,
      navigationType: defect === "unknown_type" ? undefined : defect === "fragment" ? "fragment" : "historyApi",
    }, defect === "token" ? "other" : "loader");
    capture.navigatedWithinDocument({ url, navigationType: "historyApi" }, "loader");
    const result = finish();
    assert.equal(result.windows.length, 0, defect);
    assert.ok(result.invalidationReasons!.length > 0, defect);
    assert.ok(result.limitationKeys.includes("document_or_readback_unverified"), defect);
  }
});

test("invalidation reasons cannot coexist with usable windows", () => {
  const result = setup().finish();
  assert.equal(gpcImpactCaptureSchema.safeParse({ ...result, invalidationReasons: ["renderer_crash"] }).success, false);
});
