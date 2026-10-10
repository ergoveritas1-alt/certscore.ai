import assert from "node:assert/strict";
import test from "node:test";
import { chromium, type Page } from "playwright";
import { runAccessibilityAudit } from "./accessibility-audit.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createArtifactWriter } from "./artifact-writer.js";
import { preConsentRuntimeScanner } from "./scanners/pre-consent-runtime-scanner.js";

const html = (body: string) => `<!doctype html><html lang="en"><head><title>Fixture</title></head><body><main><h1>Fixture</h1>${body}</main></body></html>`;
async function withPage(body: string, run: (page: Page) => Promise<void>) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route("**/*", route => route.fulfill({ contentType: "text/html", body: html(body) }));
    await page.goto("https://example.com/");
    await run(page);
  } finally { await browser.close(); }
}
const audit = (page: Page, extra: Partial<Parameters<typeof runAccessibilityAudit>[0]> = {}) =>
  runAccessibilityAudit({ page, scanId: "fixture-scan", documentIdentity: () => ({ token: "loader-a" }), ...extra });

test("bundled axe detects concrete WCAG failures and strips page text and attribute values", async () => {
  await withPage('<img id="broken-image" src="data:image/png;base64,AA=="><input id="unlabelled" value="private-secret"><button id="empty"></button><p style="color:#aaa;background:#fff">Private text private@example.com</p>', async page => {
    const result = await audit(page);
    assert.ok(result.rulesEvaluated.length > 20);
    for (const rule of ["image-alt", "label", "button-name", "color-contrast"]) {
      assert.ok(result.violations.some(row => row.ruleId === rule), rule);
    }
    assert.ok(result.violations.every(rule => rule.nodeCount > 0 && rule.representativeNodes.length > 0));
    assert.doesNotMatch(JSON.stringify(result), /private-secret|private@example.com|Private text/);
    assert.equal(result.engineVersion, "4.11.3");
  });
});

test("an evaluated page with no failures completes without a fabricated accessibility score", async () => {
  await withPage('<p>Readable content</p><button>Continue</button>', async page => {
    const result = await audit(page);
    assert.equal(result.status, "completed");
    assert.equal(result.violations.length, 0);
    assert.ok(result.rulesEvaluated.length);
    assert.equal("score" in result, false);
  });
});

test("image-only links retain shared DOM identity without private content or selector inference", async () => {
  await withPage('<p><a href="/private?secret=1" target="_blank"><img src="data:image/png;base64,AA=="></a></p><img src="data:image/png;base64,AA=="><a href="/other"></a>', async page => {
    const result = await audit(page);
    const images = result.violations.find(rule => rule.ruleId === "image-alt")!.representativeNodes;
    const links = result.violations.find(rule => rule.ruleId === "link-name")!.representativeNodes;
    assert.equal(images.length, 2);
    assert.equal(links.length, 2);
    const linkedImage = images.find(node => node.imageLinkIdentity?.imageOnlyLinkId !== null)!;
    const imageLink = links.find(node => node.imageLinkIdentity?.imageOnlyLinkId !== null)!;
    assert.ok(linkedImage.imageLinkIdentity);
    assert.ok(imageLink.imageLinkIdentity);
    assert.equal(linkedImage.imageLinkIdentity.imageOnlyLinkId, imageLink.imageLinkIdentity.nodeId);
    assert.equal(imageLink.imageLinkIdentity.imageOnlyLinkId, imageLink.imageLinkIdentity.nodeId);
    assert.notEqual(linkedImage.imageLinkIdentity.nodeId, imageLink.imageLinkIdentity.nodeId);
    assert.equal(images.filter(node => node.imageLinkIdentity?.imageOnlyLinkId === null).length, 1);
    assert.equal(links.filter(node => node.imageLinkIdentity?.imageOnlyLinkId === null).length, 1);
    assert.doesNotMatch(JSON.stringify(result), /secret=1|"element":/);
  });
});

test("identity uses real child nodes even when sanitized markup would look image-only", async () => {
  await withPage('<a href="/test"> <img src="data:image/png;base64,AA==">\u200b</a>', async page => {
    const result = await audit(page);
    const image = result.violations.find(rule => rule.ruleId === "image-alt")!.representativeNodes[0]!;
    assert.equal(image.imageLinkIdentity?.imageOnlyLinkId, null, "non-whitespace text prevents image-only classification");
  });
});

test("image-link identity remains bounded by the existing example limit", async () => {
  await withPage('<a href="/test"><img src="data:image/png;base64,AA=="></a>'.repeat(8), async page => {
    const result = await audit(page);
    for (const rule of result.violations.filter(rule => ["image-alt", "link-name"].includes(rule.ruleId))) {
      assert.equal(rule.nodeCount, 8);
      assert.equal(rule.representativeNodes.length, 5);
    }
  });
});

test("frame selectors cannot manufacture a top-document DOM relationship", async () => {
  await withPage('<iframe title="Embedded" srcdoc="&lt;html lang=&quot;en&quot;&gt;&lt;head&gt;&lt;title&gt;Embedded&lt;/title&gt;&lt;/head&gt;&lt;body&gt;&lt;a href=&quot;/test&quot;&gt;&lt;img src=&quot;data:image/png;base64,AA==&quot;&gt;&lt;/a&gt;&lt;/body&gt;&lt;/html&gt;"></iframe>', async page => {
    const result = await audit(page);
    for (const id of ["image-alt", "link-name"]) {
      const rule = result.violations.find(rule => rule.ruleId === id)!;
      assert.ok(rule, id);
      assert.equal(rule.nodeCount, 1);
      assert.equal(rule.representativeNodes[0]!.imageLinkIdentity, undefined);
    }
  });
});

test("timeout closes the audit page and returns limited coverage with no clean result", async () => {
  await withPage('<p>Content</p>', async page => {
    const closed = page.waitForEvent("close");
    const result = await audit(page, { budgetMs: 1 });
    assert.equal(result.status, "limited");
    assert.deepEqual(result.limitations, ["audit_timeout"]);
    assert.deepEqual(result.rulesEvaluated, []);
    await closed;
    assert.equal(page.isClosed(), true);
  });
});

test("cancellation and unavailable document identity cannot produce a clean audit", async () => {
  await withPage('<p>Content</p>', async page => {
    const controller = new AbortController(); controller.abort();
    assert.equal((await audit(page, { signal: controller.signal })).status, "limited");
    assert.equal((await audit(page, { documentIdentity: () => undefined })).status, "not_testable");
  });
});

test("a substituted engine identity cannot supply projectable results", async () => {
  await withPage(`<input><script>let engine; Object.defineProperty(window,"axe",{configurable:true,get(){return engine},set(value){
    engine=value; value.version="unknown";
  }});</script>`, async page => {
    const result = await audit(page);
    assert.equal(result.status, "limited");
    assert.deepEqual(result.limitations, ["engine_identity_mismatch"]);
    assert.equal(result.violations.length, 0);
  });
});

test("a same-URL document identity change discards all results", async () => {
  await withPage('<input>', async page => {
    let reads = 0;
    const result = await audit(page, { documentIdentity: () => ({ token: ++reads === 1 ? "loader-a" : "loader-b" }) });
    assert.equal(result.status, "limited");
    assert.deepEqual(result.limitations, ["document_changed"]);
    assert.equal(result.violations.length, 0);
  });
});

test("axe injection cannot add traffic, storage or forms to the frozen privacy baseline", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "certscore-accessibility-isolation-"));
  try {
    const body = html(`<input id="unlabelled"><script>
      document.cookie='baseline=1';
      let engine;
      Object.defineProperty(window, 'axe', { configurable:true, get(){return engine}, set(value){
        engine=value; document.cookie='audit_only=1'; localStorage.setItem('audit_only','1');
        fetch('/audit-only'); const f=document.createElement('form'); f.id='audit-only'; document.body.append(f);
      }});
    </script>`);
    const result = await preConsentRuntimeScanner({ url: "https://example.com/", normalizedUrl: "https://example.com/",
      scanStartedAtMs: Date.now(), internalBudgetMs: 6000, accessibilityScanId: "isolation-fixture",
      artifactWriter: await createArtifactWriter(root), captureScope: "runtime_evidence", waitMode: "fast", screenshotMode: "never",
      routeFulfillers: [{ urlPattern: /^https:\/\/example\.com\//, body, contentType: "text/html" }],
    });
    assert.ok(result.accessibilityAudit?.rulesEvaluated.length, JSON.stringify(result.moduleRun.errors));
    assert.ok(result.cookieSnapshots.some(snapshot => snapshot.cookies.some(cookie => cookie.name === "baseline")));
    for (const part of [result.cookieSnapshots, result.cookieEvents, result.networkEvents, result.networkResponseEvents, result.collectionSurfaceInventory]) {
      assert.doesNotMatch(JSON.stringify(part), /audit_only|audit-only/);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});
