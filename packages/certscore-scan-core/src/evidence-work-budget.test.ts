import assert from "node:assert/strict";
import test from "node:test";
import { chromium, type Page } from "playwright";
import { EVIDENCE_WORK_POLICY, optionalEvidenceAllowance } from "./evidence-work-budget.js";
import { captureConsolidatedPageEvidenceSnapshot } from "./scanners/pre-consent-runtime-scanner.js";
import { buildCollectionSurfaceInventory } from "./collection-surface-inventory.js";

async function withPage(body: string, run: (page: Page) => Promise<void>) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route("**/*", route => route.fulfill({ contentType: "text/html", body:
      `<!doctype html><html lang="en"><title>Priority fixture</title><body><h1>Fixture</h1>${body}</body></html>` }));
    await page.goto("https://example.com/");
    await run(page);
  } finally { await browser.close(); }
}

test("optional evidence cannot consume the required audit or handoff reserve", () => {
  assert.equal(optionalEvidenceAllowance({ remainingMs: 12_000, maximumMs: 2500, requiredReserveMs: 8000 }), 2500);
  assert.equal(optionalEvidenceAllowance({ remainingMs: 9000, maximumMs: 2500, requiredReserveMs: 8000 }), 750);
  assert.equal(optionalEvidenceAllowance({ remainingMs: 8000, maximumMs: 2500, requiredReserveMs: 8000 }), 0);
  for (const remainingMs of [-1, NaN, Infinity]) assert.equal(optionalEvidenceAllowance({ remainingMs, maximumMs: 2500 }), 0);
});

test("thousands of body links cannot trigger unused policy inspection in a runtime/GPC snapshot", { timeout: 20_000 }, async () => {
  await withPage('<a href="/item">Item</a>'.repeat(5_000) + '<script>window.fixture=1</script><iframe srcdoc="Fixture"></iframe>', async page => {
    await page.evaluate(() => {
      const original = window.getComputedStyle;
      (window as any).anchorStyleReads = 0;
      window.getComputedStyle = function(element, pseudo) {
        if (element.localName === "a") (window as any).anchorStyleReads++;
        return original.call(window, element, pseudo);
      };
      for (let index = 0; index < 80; index++) localStorage.setItem(`retained_${index}`, "redacted");
    });
    const snapshot = await captureConsolidatedPageEvidenceSnapshot(page, false, false);
    assert.equal(await page.evaluate(() => (window as any).anchorStyleReads), 0);
    assert.equal(snapshot.links.length, 0);
    assert.equal(snapshot.workAllocation?.inspectedPolicyLinks, 0);
    assert.equal(snapshot.workAllocation?.discoveredAnchorCount, 5000);
    assert.equal(snapshot.localStorageKeys.length, 80, "no first-20 storage cutoff");
    assert.equal(snapshot.localStorageReadComplete, true);
    assert.equal(snapshot.scripts.length, 1);
    assert.equal(snapshot.frames.length, 1);
    assert.match(snapshot.domText, /Fixture/);
  });
});

test("a prolific first form does not hide later forms or renumber their control identities", { timeout: 20_000 }, async () => {
  await withPage(`<form>${'<input aria-label="Field">'.repeat(400)}</form><form><input type="email" aria-label="Contact email"></form><form><input type="password" aria-label="Password"></form>`, async page => {
    const snapshot = await captureConsolidatedPageEvidenceSnapshot(page, false, false);
    const inventory = buildCollectionSurfaceInventory(snapshot.collectionCapture, Date.now());
    assert.equal(inventory.forms.length, 3);
    const fields = inventory.forms.flatMap(form => form.fields);
    assert.ok(fields.some(field => field.semanticCategory === "email" && field.controlIndex === 400));
    assert.ok(fields.some(field => field.semanticCategory === "password" && field.controlIndex === 401));
    assert.equal(inventory.coverage.status, "limited");
    assert.ok(snapshot.collectionCapture.inspectedFieldCandidateCount <= 250);
    for (const field of fields) {
      const type = await page.evaluate(index => document.querySelectorAll('input, textarea, select, [role="checkbox"], [role="switch"]')[index]!.getAttribute("type"), field.controlIndex!);
      if (field.semanticCategory === "email" || field.semanticCategory === "password") assert.equal(type, field.semanticCategory);
    }
  });
});

test("footer policy proof precedes repeated body-link detail under the same bounded allowance", { timeout: 20_000 }, async () => {
  await withPage('<a href="/item">Item</a>'.repeat(2000) + '<footer><a href="/privacy-policy">Privacy policy</a></footer>', async page => {
    await page.evaluate(() => {
      const original = window.getComputedStyle;
      window.getComputedStyle = function(element, pseudo) {
        if (element.localName === "a") { const until = performance.now() + 2; while (performance.now() < until) {} }
        return original.call(window, element, pseudo);
      };
    });
    const snapshot = await captureConsolidatedPageEvidenceSnapshot(page, false, true);
    const policy = snapshot.links.find(link => link.href === "/privacy-policy");
    assert.ok(policy);
    assert.equal(policy.domLocation, "footer");
    assert.equal(policy.linkVisibility, "visible");
    assert.equal(snapshot.workAllocation?.linkDiscoveryTruncated, true);
    assert.ok(snapshot.workAllocation!.inspectedPolicyLinks < EVIDENCE_WORK_POLICY.runtimeSnapshot.anchors);
    assert.ok(snapshot.scripts);
  });
});

test("a huge storage area remains explicitly incomplete without starving the other area", { timeout: 20_000 }, async () => {
  await withPage('<p>Public content</p>', async page => {
    await page.evaluate(count => {
      for (let index = 0; index < count; index++) localStorage.setItem(`key_${index}`, "x");
      sessionStorage.setItem("important_session_key", "x");
    }, EVIDENCE_WORK_POLICY.runtimeSnapshot.storageKeysPerArea + 1);
    const snapshot = await captureConsolidatedPageEvidenceSnapshot(page, false, false);
    assert.equal(snapshot.localStorageReadComplete, false);
    assert.ok(snapshot.localStorageKeys.length <= EVIDENCE_WORK_POLICY.runtimeSnapshot.storageKeysPerArea);
    assert.equal(snapshot.workAllocation?.localStorageKeyCount, 10001);
    assert.equal(snapshot.sessionStorageReadComplete, true);
    assert.deepEqual(snapshot.sessionStorageKeys, ["important_session_key"]);
  });
});

test("open shadow-root overflow preserves discovered proof and reports partial traversal", { timeout: 20_000 }, async () => {
  await withPage('<a href="/body-item">Item</a>'.repeat(2000) + '<footer><a href="/privacy-main">Privacy policy</a></footer><div id="roots"></div>', async page => {
    await page.evaluate(count => {
      for (let index = 0; index < count; index++) {
        const host = document.createElement("div"); document.getElementById("roots")!.append(host);
        host.attachShadow({ mode: "open" }).innerHTML = `<a href="/privacy-policy-${index}">Privacy policy</a>`;
      }
    }, EVIDENCE_WORK_POLICY.runtimeSnapshot.shadowRoots + 10);
    const snapshot = await captureConsolidatedPageEvidenceSnapshot(page, false, true);
    assert.ok(snapshot.links.some(link => link.href === "/privacy-policy-0"));
    assert.ok(snapshot.links.some(link => link.href === "/privacy-main"), "main footer proof survives shadow-root competition");
    assert.equal(snapshot.workAllocation?.linkDiscoveryTruncated, true);
    assert.ok(snapshot.workAllocation!.discoveredAnchorCount <= 2001 + EVIDENCE_WORK_POLICY.runtimeSnapshot.shadowRoots - 1);
  });
});

test("a stalled optional image review cannot starve the required audit or 80-cookie baseline", { timeout: 20_000 }, async t => {
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const path = await import("node:path");
  const { createServer } = await import("node:http");
  const { createArtifactWriter } = await import("./artifact-writer.js");
  const { preConsentRuntimeScanner } = await import("./scanners/pre-consent-runtime-scanner.js");
  const server = createServer((_request, response) => {
    response.setHeader("Content-Type", "text/html");
    response.end(`<!doctype html><html lang="en"><title>Priority fixture</title><body><main><h1>Contact</h1>
      <form><label>Email<input type="email"></label><button>Send</button></form><button></button>
      <script>for(let i=0;i<80;i++) document.cookie='cookie_'+i+'=x;path=/';</script></main></body></html>`);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}/`;
  const directory = await mkdtemp(path.join(tmpdir(), "certscore-priority-integration-"));
  let reviews = 0;
  let auditFinished = false;
  let reviewSawCompletedAudit = false;
  const browser = await chromium.launch({ headless: true });
  const newContext = browser.newContext.bind(browser);
  t.mock.method(browser, "newContext", async (...args) => {
    const context = await newContext(...args), newPage = context.newPage.bind(context);
    t.mock.method(context, "newPage", async () => {
      const page = await newPage(), evaluate = page.evaluate.bind(page);
      t.mock.method(page, "evaluate", async (fn, arg) => {
        const result = await evaluate(fn, arg);
        if (arg && typeof arg === "object" && "exampleLimit" in arg) auditFinished = true;
        return result;
      });
      return page;
    });
    return context;
  });
  try {
    const result = await preConsentRuntimeScanner({ url, normalizedUrl: url, scanStartedAtMs: Date.now(),
      internalBudgetMs: 6_000, browser, accessibilityScanId: "priority-fixture", artifactWriter: await createArtifactWriter(directory),
      captureScope: "runtime_evidence", screenshotMode: "never", waitMode: "fast",
      formSnapshotReviewer: async () => { reviews++; reviewSawCompletedAudit = auditFinished; return new Promise(() => undefined); } });
    assert.equal(reviews, 1);
    assert.equal(reviewSawCompletedAudit, true, "audit completes before optional review starts");
    assert.ok(result.collectionSurfaceSnapshots!.every(row => row.status === "unavailable"));
    assert.equal(result.collectionSurfaceInventory?.forms.length, 1);
    assert.equal(result.cookieSnapshots[0]?.cookies.length, 80);
    assert.ok(result.scriptEvents.length);
    assert.ok(result.networkEvents.length);
    assert.ok(result.accessibilityAudit!.rulesEvaluated.length > 20, JSON.stringify(result.accessibilityAudit));
    assert.ok(result.accessibilityAudit!.violations.some(rule => rule.ruleId === "button-name"));
    assert.ok(result.transportSecurityObservations.length, "early transport evidence remains retained");
  } finally {
    await browser.close();
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});
