import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

test("claim forwards the original deadline and leaves heavy finish projection unloaded", async () => {
  const directory = await mkdtemp(resolve("tmp/full-site-claim-route-"));
  const output = join(directory, "route.cjs");
  try {
    await build({ entryPoints: [resolve("apps/web/app/api/internal/full-site/page/route.ts")], outfile: output,
      bundle: true, platform: "node", format: "cjs", packages: "external", plugins: [{ name: "claim-fixture", setup(builder) {
        builder.onResolve({ filter: /^@website-signal-risk-scanner\/db$/ }, () => ({ path: "db", namespace: "fixture" }));
        builder.onResolve({ filter: /runtime-evidence-graph-projection$/ }, () => ({ path: "graph", namespace: "fixture" }));
        builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({ loader: "js", contents: path === "graph"
          ? `throw new Error('Finish graph loaded during claim'); export const projectCrawlRuntimeGraph=()=>null;`
          : `export const claimFullSitePage=async input=>({pageId:input.pageId,deadline:input.claimDeadlineAtMs??null});
            export const queryOne=()=>{throw new Error('Unexpected read')};
            export const completeFullSitePage=()=>{throw new Error('Unexpected finish')};
            export const readFullSiteArtifact=()=>{throw new Error('Unexpected artifact')};` }));
      } }] });
    const { POST } = createRequire(import.meta.url)(output);
    const body = { operation: "claim", contractVersion: "certscore.full-site-page-dispatch.v1", pageId: "11111111-1111-4111-8111-111111111111",
      attemptId: "22222222-2222-4222-8222-222222222222", token: "a".repeat(64), region: "eu-central-1" };
    const request = (deadline?: string) => new Request("http://localhost:3000/api/internal/full-site/page", {
      method: "POST", body: JSON.stringify(body), headers: deadline === undefined ? {} : { "x-certscore-claim-deadline-ms": deadline },
    });
    const deadline = Date.now() - 1000;
    assert.deepEqual(await (await POST(request(String(deadline)))).json(), { grant: { pageId: body.pageId, deadline } });
    assert.deepEqual(await (await POST(request())).json(), { grant: { pageId: body.pageId, deadline: null } }, "Legacy workers remain compatible");
    for (const malformed of ["", "NaN", "Infinity", "-1", "1e12", "9007199254740992"])
      assert.equal((await POST(request(malformed))).status, 400);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
