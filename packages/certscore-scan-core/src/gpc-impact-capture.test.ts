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

test("extended checkpoints require explicit diagnostics and preserve default horizons", () => {
  for (const diagnostic15Seconds of [false, true]) {
    const bundle = gpcRuntimeFixture({enabled: true});
    let now = 0;
    const capture = createGpcImpactCapture({expectedEnabled: true, now: () => now, diagnostic15Seconds});
    capture.documentRequested({type: "Document", frameId: "main", loaderId: "loader", request: {url: bundle.url, headers: {"Sec-GPC": "1"}}}, "main");
    now = 100;
    capture.documentCommitted({loaderId: "loader", url: bundle.url});
    capture.bindReadback("loader");
    assert.equal(capture.remainingObservationMs(15000), 15000);
    for (const offset of [4999, 5000, 7999, 8000, 9999, 10000, 14999, 15000]) {
      capture.recordRequest({eventId: `event-${offset}`, timestampMs: 100 + offset, requestUrl: `${bundle.url}?offset=${offset}`});
    }
    now = 15101;
    const result = capture.finish({...bundle.gpcSignalObservation!, capturedAtMs: now});
    assert.deepEqual(result.windows.map(window => window.durationMs), diagnostic15Seconds ? [250, 500, 1000, 3000, 5000, 8000, 10000, 15000] : [250, 500, 1000, 3000, 5000]);
    if (diagnostic15Seconds) assert.deepEqual(result.windows.slice(-4).map(window => window.requestCount), [1, 3, 5, 7]);
    assert.equal(capture.remainingObservationMs(15000), 0);
  }
});

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

test("minimum observation is anchored to the verified commit and stops on invalidation or freeze", () => {
  const { capture, finish } = setup();
  assert.equal(capture.remainingObservationMs(5000), 5000);
  finish();
  assert.equal(capture.remainingObservationMs(5000), 0);
  const invalid = setup().capture;
  invalid.invalidate("renderer_crash");
  assert.equal(invalid.remainingObservationMs(5000), 0);
  let now = 0;
  const fresh = createGpcImpactCapture({ expectedEnabled: false, now: () => now });
  assert.equal(fresh.remainingObservationMs(5000), 0);
  fresh.documentRequested({type:"Document",frameId:"main",loaderId:"loader",request:{url:"https://example.com/"}},"main");
  now = 100;
  fresh.documentCommitted({loaderId:"loader",url:"https://example.com/"});
  now = 3100;
  assert.equal(fresh.remainingObservationMs(5000), 2000);
  now = 5100;
  assert.equal(fresh.remainingObservationMs(5000), 0);
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

test("quiet checkpoint freezes existing activity at the signal readback without a wait", () => {
  const b=gpcRuntimeFixture({enabled:true});let now=0;
  const capture=createGpcImpactCapture({expectedEnabled:true,now:()=>now,
    quietSnapshot:()=>({quietForMs:400,inFlightRequestCount:0})});
  capture.documentRequested({type:"Document",frameId:"main",loaderId:"loader",request:{url:b.url,headers:{"Sec-GPC":"1"}}},"main");
  now=100;capture.documentCommitted({loaderId:"loader",url:b.url});capture.bindReadback("loader");
  now=1100;
  const result=capture.finish({...b.gpcSignalObservation!,capturedAtMs:1000});
  assert.deepEqual(result.quietCheckpoint,{contractVersion:"certscore.gpc-comparison-quiet.v1",documentToken:"loader",signalReadbackAtMs:1000,quietForMs:300,inFlightRequestCount:0});
  assert.strictEqual(capture.finish(),result);
  assert.equal(gpcImpactCaptureSchema.safeParse({...result,quietCheckpoint:{...result.quietCheckpoint,documentToken:"other"}}).success,false);
});
