import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  inventoryConfiguration,
  inventoryHash,
  projectFullSiteInventory,
  runInventoryOnly,
} from "./full-site-inventory";

test(
  "inventory-only Chromium visits isolate storage, load resources normally, never click or fetch policy, and retain frame evidence",
  { timeout: 90000 },
  async () => {
    const requests: string[] = [];
    const receivedCookies: string[] = [];
    const server = createServer((req, res) => {
      requests.push(req.url ?? "");
      if (req.url === "/b") receivedCookies.push(req.headers.cookie ?? "");
      res.setHeader(
        "Content-Type",
        req.url === "/script.js" ? "application/javascript" : "text/html",
      );
      if (req.url === "/a")
        res.end(
          `<main>Public inventory fixture A</main><button onclick="fetch('/clicked')">Accept all</button><a href="/privacy">Privacy policy</a><a href="/b">Contact</a><script src="/script.js"></script><iframe src="/frame"></iframe><img src="/image.png"><script>document.cookie='page_a=private-cookie;path=/';localStorage.setItem('page_a','private-value');fetch('/collect?token=private-query');fetch('/collect?token=private-query');</script>`,
        );
      else if (req.url === "/b")
        res.end(
          `<main>Public inventory fixture B</main><script>fetch('/leak?cookie='+document.cookie+'&storage='+localStorage.getItem('page_a'));document.cookie='page_b=private-b;path=/';</script>`,
        );
      else if (req.url === "/frame")
        res.end(
          `<main>Embedded public content</main><script>sessionStorage.setItem('frame-key','private-frame');fetch('/frame-request')</script>`,
        );
      else if (req.url === "/script.js")
        res.end("window.inventoryScriptLoaded=true;");
      else res.end("ok");
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const origin = `http://127.0.0.1:${address.port}`,
      outDir = await mkdtemp(join(tmpdir(), "certscore-inventory-fixture-"));
    try {
      const config = inventoryConfiguration("eu-west-1", "tiny"),
        configurationHash = inventoryHash(config);
      const pageId = randomUUID(), attemptId = randomUUID();
      const a = await runInventoryOnly({
        runtimeGraph: { pageId, attemptId },
        url: origin + "/a",
        hosts: ["127.0.0.1"],
        region: "eu-west-1",
        profile: "tiny",
        configurationHash,
        outDir: join(outDir, "a"),
        signal: AbortSignal.timeout(35000),
      });
      const b = await runInventoryOnly({
        url: origin + "/b",
        hosts: ["127.0.0.1"],
        region: "eu-west-1",
        profile: "tiny",
        configurationHash,
        outDir: join(outDir, "b"),
        signal: AbortSignal.timeout(35000),
      });
      assert.deepEqual(receivedCookies, [""]);
      assert.ok(requests.some((url) => url === "/leak?cookie=&storage=null"));
      assert.equal(
        requests.some((url) => url === "/clicked" || url === "/privacy"),
        false,
      );
      assert.ok(requests.includes("/script.js"));
      assert.ok(requests.includes("/image.png"));
      assert.ok(requests.includes("/frame-request"));
      assert.equal(a.evidence.moduleRun.moduleName, "preConsentRuntimeScanner");
      assert.equal(a.evidence.consentMechanism, undefined);
      assert.ok(a.links.includes(origin + "/b"));
      assert.ok(
        !b.evidence.cookieSnapshots
          .flatMap((s) => s.cookies)
          .some((c) => c.name === "page_a"),
      );
      assert.ok(a.evidence.networkEvents.some((r) => r.isSubFrame));
      const projected = projectFullSiteInventory({
        ...a,
        parentScanId: randomUUID(),
        pageJobId: randomUUID(),
        attemptId: randomUUID(),
        configurationHash,
        requestedUrl: origin + "/a",
        profile: "inventory_only",
        sourceHash: inventoryHash(a.evidence),
        status: "completed",
        limitations: [],
      });
      const graph = a.evidence.runtimeEvidenceGraph;
      assert.ok(graph);
      assert.equal(graph.scanId, pageId);
      assert.equal(graph.captureId, `${pageId}:${attemptId}:runtime_evidence`);
      assert.ok(graph.edges.length > 0);
      assert.ok(Buffer.byteLength(JSON.stringify(graph)) <= 128 * 1024);
      assert.ok(projected.occurrences.some(row => row.graphNodeRefs?.length));
      assert.ok(projected.occurrences.every(row => row.graphNodeRefs?.every(id => graph.nodes.some(node => node.id === id)) ?? true));
      console.log(JSON.stringify({ graphBytes: Buffer.byteLength(JSON.stringify(graph)), nodes: graph.nodes.length, edges: graph.edges.length }));
      const serialized = JSON.stringify(projected);
      assert.ok(!serialized.includes("private-cookie"));
      assert.ok(!serialized.includes("private-value"));
      assert.ok(!serialized.includes("private-query"));
      assert.equal(
        projected.occurrences.filter(
          (o) => o.kind === "request" && o.label.includes("/collect"),
        ).length,
        2,
      );
      assert.ok(projected.occurrences.some((o) => o.kind === "embed"));
      assert.ok(
        projected.occurrences.some(
          (o) => o.kind === "cookie" && o.label === "page_a",
        ),
      );
      const after = {
        ...a.evidence,
        networkEvents: a.evidence.networkEvents.map((r) => ({
          ...r,
          consentStateAtTime: "post_accept" as const,
        })),
      };
      assert.equal(
        projectFullSiteInventory({
          ...a,
          evidence: after,
          parentScanId: randomUUID(),
          pageJobId: randomUUID(),
          attemptId: randomUUID(),
          configurationHash,
          requestedUrl: origin + "/a",
          profile: "homepage_baseline",
          sourceHash: inventoryHash(after),
          status: "completed",
          limitations: [],
        }).occurrences.filter((o) => o.kind === "request").length,
        0,
      );
      await assert.rejects(
        () =>
          runInventoryOnly({
            url: origin + "/b",
            hosts: ["127.0.0.1"],
            region: "us-west-1",
            profile: "tiny",
            configurationHash,
            outDir: join(outDir, "bad"),
            signal: AbortSignal.timeout(5000),
          }),
        /configuration differs/,
      );
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(outDir, { recursive: true, force: true });
    }
  },
);
