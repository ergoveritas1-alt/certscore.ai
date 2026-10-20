import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

test("workspace report settings preserve the header without a logo and isolate stored logo keys", async () => {
  const modulePath = fileURLToPath(new URL("./report-branding.ts", import.meta.url));
  const mocks: Record<string, string> = {
    empty: "",
    state: `export const state={row:null,queries:[],signed:[],reads:0};`,
    react: `export const cache=fn=>fn;`,
    db: `import {state} from 'test-state'; export async function queryOne(sql,params){state.queries.push(params);return state.row;}`,
    storage: `import {state} from 'test-state'; export async function createSignedStorageUrl(key){state.signed.push(key);return 'signed:'+key;} export function getStorageBucketName(){return 'bucket';} export function getS3Client(){return {send:async()=>{state.reads++;return {};}};}`,
  };
  const built = await build({ stdin: { contents: `export * from ${JSON.stringify(modulePath)};export {state} from 'test-state';`, resolveDir: process.cwd() },
    bundle: true, write: false, format: "cjs", platform: "node", packages: "external", plugins: [{ name: "branding-record", setup(api) {
      const matches: Record<string, string> = { "server-only": "empty", "test-state": "state", react: "react", "@website-signal-risk-scanner/db": "db", "../storage/s3": "storage" };
      api.onResolve({ filter: /.*/ }, args => matches[args.path] ? { path: matches[args.path]!, namespace: "mock" } : undefined);
      api.onLoad({ filter: /.*/, namespace: "mock" }, args => ({ contents: mocks[args.path], loader: "js" }));
    } }] });
  const { createRequire } = await import("node:module");
  const compiled: { exports: Record<string, any> } = { exports: {} };
  new Function("require", "exports", "module", built.outputFiles[0]!.text)(createRequire(import.meta.url), compiled.exports, compiled);
  const { state, getWorkspaceReportBranding: getBranding, loadWorkspaceReportLogo: loadLogo } = compiled.exports;
  state.row = { name: "Agency", logo_storage_key: null, report_header_theme: "black" };
  assert.deepEqual(await getBranding("workspace-a"), { name: "Agency", logoUrl: null, headerTheme: "black" });
  assert.equal(await loadLogo("workspace-a"), null);
  assert.equal(state.reads, 0);
  for (const value of [undefined, null, "invalid", "white"]) {
    state.row.report_header_theme = value;
    assert.equal((await getBranding("workspace-a")).headerTheme, "white");
  }
  state.row.report_header_theme = "black";
  state.row.logo_storage_key = "company-logos/workspace-b/abc.png";
  assert.equal((await getBranding("workspace-a")).logoUrl, null);
  assert.equal(state.signed.length, 0);
  state.row.logo_storage_key = "company-logos/workspace-a/abc.png";
  assert.deepEqual(await getBranding("workspace-a"), { name: "Agency", logoUrl: "signed:company-logos/workspace-a/abc.png", headerTheme: "black" });
  assert.ok(state.queries.every((params: string[]) => params[0] === "workspace-a"));
});
