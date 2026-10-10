import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { chromium } from "playwright";
import { runAccessibilityAudit } from "./accessibility-audit.js";

const root = new URL("../../../infra/aws/ergoveritas-canary/.well-known/certscore-canary/", import.meta.url);

test("every rotating sentinel retains its declared concrete WCAG failures", { timeout: 60_000 }, async () => {
  const manifest = JSON.parse(await readFile(new URL("manifest.json", root), "utf8"));
  const { pages, accessibility } = manifest.sentinelCorpus;
  assert.equal(pages.length, 5);
  assert.equal(manifest.sentinelCorpus.cadence, "PT20M");
  assert.equal(accessibility.contractVersion, "certscore.sentinel-accessibility.v1");
  const assets = new Map<string, Buffer>();
  for (const entry of await readdir(root, { recursive: true, withFileTypes: true })) {
    if (entry.isFile()) {
      const file = new URL(entry.name, `file://${entry.parentPath}/`);
      assets.set(file.pathname.slice(root.pathname.length), await readFile(file));
    }
  }
  const server = createServer((request, response) => {
    const name = new URL(request.url ?? "/", "http://localhost").pathname.replace(/^\/\.well-known\/certscore-canary\//, "");
    const content = assets.get(name);
    response.writeHead(content ? 200 : 404, { "content-type": name.endsWith(".js") ? "text/javascript" : name.endsWith(".css") ? "text/css" : "text/html" });
    response.end(content ?? "Not found");
  });
  await new Promise<void>(resolve => server.listen(0, "localhost", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const browser = await chromium.launch({ headless: true });
  try {
    for (const fixture of pages) {
      const context = await browser.newContext();
      try {
        const page = await context.newPage();
        await page.route("https://**/*", route => route.fulfill({ status: 200, body: "" }));
        await page.goto(`http://localhost:${address.port}${fixture.url}`);
        const result = await runAccessibilityAudit({ page, scanId: fixture.key, documentIdentity: () => ({ token: fixture.key }) });
        for (const expected of accessibility.requiredRules) {
          const violation = result.violations.find(row => row.ruleId === expected.ruleId);
          assert.ok(violation, `${fixture.key}: missing ${expected.ruleId}; limitations=${result.limitations.join(",")}`);
          assert.ok(violation.representativeNodes.some(node => node.selectors.includes(expected.selector)), `${fixture.key}: missing concrete ${expected.selector} evidence`);
        }
      } finally { await context.close(); }
    }
  } finally {
    await browser.close();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
