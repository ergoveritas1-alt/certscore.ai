import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createArtifactWriter } from "./artifact-writer.js";
import { policyIndexRecoveryFixtureOptions, policyIndexRecoveryFixtureResponse } from "./test-fixtures/policy-index-recovery.js";
import { retainPolicyPacketObservations, assessPolicyDocumentSubstance, classifyPolicyDocumentOwnership, policySurfaceScanner } from "./scanners/policy-surface-scanner.js";

test("short application-error shells are not usable privacy documents", () => {
  const result = assessPolicyDocumentSubstance({ surfaceType: "privacy_policy", title: "en-us | WBD Privacy Center", text: "Processing Error Close Privacy Center Our Privacy Approach Privacy Policy Terms of Use Cookie Settings Copyright 2026" });
  assert.equal(result.matchesExpectedSurface, false);
  assert.equal(result.reasonCode, "application_error_shell");
  assert.equal(assessPolicyDocumentSubstance({ surfaceType: "privacy_policy", text: "We collect personal data to provide services. ".repeat(25) + "Contact support if you see a processing error." }).matchesExpectedSurface, true);
});

test("three-letter policy brands require whole tokens", () => {
  const input = { targetUrl: "https://cnn.com/", documentUrl: "https://group.example/privacy", documentTitle: "Group Privacy Policy" };
  assert.equal(classifyPolicyDocumentOwnership({ ...input, text: "CNN is the data controller responsible for processing personal data." }).targetRelationship, "first_party_brand");
  assert.notEqual(classifyPolicyDocumentOwnership({ ...input, text: "ACNNEX is the data controller responsible for processing personal data." }).targetRelationship, "first_party_brand");
});

for (const [delayedNotice, renderedRecovery, multilingual, slowHtml] of [[false, false, false], [true, false, false], [false, true, false], [false, "homepage", false], [false, false, true], [true, true, false], [false, false, true, true]] as const) test(`OneTrust index recovery ${slowHtml ? "retains declared policy text after a slow HTML fetch inside the approved allowance" : multilingual ? "uses the page-declared locale inside the existing child budget" : renderedRecovery === "homepage" ? "after homepage-only browser discovery" : renderedRecovery ? delayedNotice ? "retains failed child after direct 403 and fresh prior-hint browser recovery" : "after direct 403 and fresh prior-hint browser recovery" : delayedNotice ? "fails closed at the child deadline" : "selects and resolves the Europe body"}`, async () => {
  const requests: string[] = [];
  let baseUrl = "";
  let priorHintBrowserRequests = 0;
  const server = createServer((req, res) => {
    requests.push(req.url ?? "");
    const navigation = req.headers["sec-fetch-mode"] === "navigate";
    if (req.url === "/privacy" && navigation) priorHintBrowserRequests += 1;
    const response = policyIndexRecoveryFixtureResponse({
      baseUrl, url: req.url ?? "", navigation, renderedRecovery, delayedNotice, multilingual, slowHtml,
    });
    res.statusCode = response.status;
    for (const [name, value] of Object.entries(response.headers)) res.setHeader(name, value);
    const send = () => res.end(response.body);
    if (response.delayMs > 0) setTimeout(send, response.delayMs).unref();
    else send();
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}`;
  const root = await mkdtemp(path.join(tmpdir(), "policy-index-recovery-"));
  try {
    const scanStartedAtMs = Date.now();
    const result = await policySurfaceScanner({
      url: baseUrl + "/", normalizedUrl: baseUrl + "/", region: "eu-west-1", discoveryMode: "fast",
      scanStartedAtMs, internalBudgetMs: renderedRecovery || slowHtml ? 12000 : 5000,
      artifactWriter: await createArtifactWriter(root),
      ...policyIndexRecoveryFixtureOptions(baseUrl, scanStartedAtMs, renderedRecovery),
    });
    if (renderedRecovery === true) {
      assert.ok(priorHintBrowserRequests > 0, "the fresh prior hint must exercise browser recovery after direct 403");
    }
    const europe = result.policySurfaceObservations.find(o => o.normalizedUrl === baseUrl + "/policycenter/b2c/en-emea/");
    if (delayedNotice) {
      assert.notEqual(europe?.documentEvaluationState, "usable");
      assert.ok(europe, "the failed destination remains observed");
      assert.ok(!europe.textExcerpt?.includes("contractual necessity"));
      return;
    }
    assert.equal(europe?.status, "fetched", JSON.stringify(result.policySurfaceObservations.map(o => ({ url: o.normalizedUrl, state: o.status, reasons: o.selectionReasonCodes }))));
    assert.equal(europe?.documentEvaluationState, "usable");
    assert.match(europe?.textExcerpt ?? "", /contractual necessity/);
    assert.ok(europe?.selectionReasonCodes?.includes("scan_region_policy_route_match"));
    assert.equal(result.policySurfaceObservations.find(o => o.normalizedUrl === baseUrl + "/policycenter/b2c")?.documentRole, "policy_index");
    assert.equal(requests.filter(url => url === "/europe.json").length, 1);
    assert.equal(requests.filter(url => url === "/wrong-locale.json").length, 0);
  } finally {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});


test("policy packet bounds preserve fetched governing documents ahead of index links", () => {
  const links = Array.from({ length: 40 }, (_, i) => ({ observationId: `link-${i}`, status: "observed" }));
  const policy = { observationId: "governing", status: "fetched", documentRole: "policy_document" };
  const retained = retainPolicyPacketObservations([...links, policy] as any);
  assert.equal(retained.length, 32);
  assert.ok(retained.some(item => item.observationId === "governing"));
  assert.equal(links.length, 40);
});

test("policy packet bounds retain the selected failed child ahead of unselected links", () => {
  const links = Array.from({ length: 40 }, (_, i) => ({ observationId: `link-${i}`, status: "observed", selectionReasonCodes: ["not_selected_for_bounded_fetch"] }));
  const failed = { observationId: "selected", status: "failed", parentObservationId: "index", selectionReasonCodes: ["scan_region_policy_route_match"] };
  const retained = retainPolicyPacketObservations([...links, failed] as any);
  assert.equal(retained.length, 32);
  assert.ok(retained.some(item => item.observationId === "selected"));
  assert.equal(retained.find(item => item.observationId === "selected")?.status, "failed");
});
