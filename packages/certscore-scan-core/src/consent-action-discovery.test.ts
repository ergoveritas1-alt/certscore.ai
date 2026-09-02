import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { chromium } from "playwright";
import { installConsentActionDiscovery } from "./consent-action-discovery.js";

test("consent action discovery wakes on late CMP runtime and DOM controls", async () => {
  const server = createServer((request, response) => {
    if (request.url === "/cmp-runtime.js") {
      response.setHeader("content-type", "application/javascript; charset=utf-8");
      response.end("window.__cmpRuntimeLoaded = true;");
      return;
    }
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(`<!doctype html><html><body><div id="root"></div><script>
      setTimeout(() => {
        const runtime = document.createElement('script');
        runtime.src = '/cmp-runtime.js';
        document.head.appendChild(runtime);
        document.querySelector('#root').innerHTML =
          '<section role="dialog"><button>Accept</button><button>Reject</button></section>';
      }, 100);
    </script></body></html>`);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const discovery = await installConsentActionDiscovery(page);
  try {
    await page.goto(`http://127.0.0.1:${address.port}/`, { waitUntil: "commit" });
    const revision = discovery.revision;
    await discovery.waitForSignal(revision, 1_000);
    await page.waitForFunction(() => Boolean((window as any).__cmpRuntimeLoaded));
    assert.ok(discovery.revision > revision);
    assert.ok(discovery.runtimeUrls().some((url) => url.endsWith("/cmp-runtime.js")));
    assert.equal(await page.getByRole("button", { name: "Reject" }).count(), 1);
    await new Promise((resolve) => setTimeout(resolve, 50));
    const quietRevision = discovery.revision;
    const quietWaitStartedAt = Date.now();
    await discovery.waitForSignal(quietRevision, 40);
    const quietWaitMs = Date.now() - quietWaitStartedAt;
    assert.ok(quietWaitMs >= 30, `quiet wait returned too early: ${quietWaitMs}ms`);
    assert.ok(quietWaitMs < 500, `quiet wait exceeded its bounded timer: ${quietWaitMs}ms`);
  } finally {
    discovery.dispose();
    await browser.close();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve())
    );
  }
});
