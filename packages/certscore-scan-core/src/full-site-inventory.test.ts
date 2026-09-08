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
          `<main>Public inventory fixture A</main><form aria-label="Contact"><label>Email<input type="email" value="private-form-value"></label><label><input type="checkbox" checked>Send me newsletters</label><button type="button" role="switch" aria-checked="false" aria-label="Marketing updates">Updates</button><label>Passport number<input></label></form><button onclick="fetch('/clicked')">Accept all</button><a href="/privacy">Privacy policy</a><a href="/b">Contact</a><script src="/script.js"></script><iframe src="/frame"></iframe><img src="/image.png"><script>document.cookie='page_a=private-cookie;path=/';document.cookie='__utma=private-analytics;path=/';document.cookie='FCCDCF=private-consent;path=/';document.cookie='_rdt_uuid=private-unverified;path=/';document.cookie='_ga=private-existing;path=/';localStorage.setItem('page_a','private-value');fetch('/collect?token=private-query');fetch('/collect?token=private-query');</script>`,
        );
      else if (req.url === "/b") {
        // Regression: a real HTTP 500 can still render the requested document.
        res.statusCode = 500;
        res.end(
          `<main>Public inventory fixture B</main><script>fetch('/leak?cookie='+document.cookie+'&storage='+localStorage.getItem('page_a'));document.cookie='page_b=private-b;path=/';</script>`,
        );
      }
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
        formSnapshotReviewer: async () => ({ safeForDisplay: true }),
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
      const errorInput = {
        ...b, parentScanId: randomUUID(), pageJobId: randomUUID(), attemptId: randomUUID(),
        configurationHash, requestedUrl: origin + "/b", profile: "inventory_only" as const,
        sourceHash: inventoryHash(b.evidence), status: "completed" as const, limitations: [] as string[],
      };
      const partial = projectFullSiteInventory(errorInput);
      assert.equal(partial.httpStatus, 500);
      assert.equal(partial.failureKind, "http_error");
      assert.equal(partial.status, "partial");
      assert.ok(partial.limitations.includes("http_error_rendered_inventory.v1"));
      assert.ok(partial.occurrences.some(row => row.kind === "cookie" && row.label === "page_b"));
      assert.equal(partial.sourceHash, inventoryHash(b.evidence));
      const mainIds = new Set(b.evidence.networkEvents.filter(e => e.isMainFrame && e.resourceType === "document").map(e => e.requestId));
      for (const httpStatus of [401, 403, 404, 429]) {
        const result = projectFullSiteInventory({ ...errorInput, evidence: { ...b.evidence,
          networkResponseEvents: b.evidence.networkResponseEvents.map(e => mainIds.has(e.requestId!) ? { ...e, status: httpStatus } : e),
        } });
        assert.equal(result.status, httpStatus === 429 ? "blocked" : "failed");
        assert.deepEqual(result.occurrences, []);
      }
      const unsafeCaptures = [
        { ...errorInput, status: "partial" as const },
        { ...errorInput, profile: "homepage_baseline" as const },
        { ...errorInput, limitations: ["observation_deadline"] },
        { ...errorInput, evidence: { ...b.evidence, moduleRun: { ...b.evidence.moduleRun, errors: ["capture failed"] } } },
        { ...errorInput, evidence: { ...b.evidence, moduleRun: undefined } },
        { ...errorInput, evidence: { ...b.evidence, domSnapshots: [] } },
        { ...errorInput, evidence: { ...b.evidence, domSnapshots: b.evidence.domSnapshots.map(d => ({ ...d, url: origin + "/other" })) } },
        { ...errorInput, evidence: { ...b.evidence, domSnapshots: b.evidence.domSnapshots.map(d => ({ ...d, documentIdentity: undefined })) } },
        { ...errorInput, evidence: { ...b.evidence, domSnapshots: b.evidence.domSnapshots.map(d => ({ ...d, capturedAtMs: 0 })) } },
        { ...errorInput, evidence: { ...b.evidence, domSnapshots: b.evidence.domSnapshots.map(d => ({ ...d, textExcerpt: "500 Internal Server Error" })) } },
        { ...errorInput, evidence: { ...b.evidence, domSnapshots: b.evidence.domSnapshots.map(d => ({ ...d, textExcerpt: "" })) } },
      ];
      for (const candidate of unsafeCaptures) {
        const result = projectFullSiteInventory(candidate);
        assert.equal(result.status, "failed");
        assert.deepEqual(result.occurrences, []);
        assert.equal(result.collectionSurfaces, undefined);
      }
      // Fresh capture -> typed cookie event -> inventory projection: existing and
      // newly reviewed knowledge reaches the report without a display fallback.
      for (const [name, purpose] of [["_ga", "analytics"], ["__utma", "analytics"], ["FCCDCF", "consent_management"], ["_rdt_uuid", "unknown"], ["page_a", "unknown"]]) {
        assert.equal(a.evidence.cookieEvents.find(event => event.cookieName === name && event.operation === "browser_snapshot")?.cookiePurpose, purpose, name);
        assert.equal(projected.occurrences.find(row => row.kind === "cookie" && row.label === name)?.purpose, purpose, name);
      }
      assert.equal(a.evidence.cookieEvents.find(event => event.cookieName === "FCCDCF")?.cookieEssentiality, "unknown");
      assert.ok(!JSON.stringify(projected).includes("private-analytics"));
      assert.equal(projected.collectionSurfaces?.inventory.forms.length, 1);
      const fields = projected.collectionSurfaces!.inventory.forms[0]!.fields;
      assert.equal(fields.find(f => f.controlKind === "checkbox")?.checkedState, "checked");
      assert.equal(fields.find(f => f.controlKind === "checkbox")?.review?.preselectedMarketing, true);
      assert.equal(fields.find(f => f.controlKind === "switch")?.checkedState, "unchecked");
      assert.equal(fields.find(f => f.label === "Passport number")?.review?.category, "government_identifier");
      assert.equal(projected.collectionSurfaces?.snapshots[0]?.status, "available");
      assert.equal("data" in projected.collectionSurfaces!.snapshots[0]!, false);
      assert.ok(!JSON.stringify(projected.collectionSurfaces).includes("private-form-value"));
      assert.ok(a.evidence.collectionSurfaceSnapshots?.[0]?.data);
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
