import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

test("white-label PDF export authenticates and uses only the viewer workspace branding", async () => {
  const route = fileURLToPath(new URL("../../app/api/scans/[scanId]/report-export/route.ts", import.meta.url));
  const mocks: Record<string, string> = {
    state: `export const state={signedIn:true,role:'advanced',accessible:true,logo:true,failLogo:false,loaded:[],rendered:[],theme:"white",settings:[]};`,
    next: `export class NextResponse extends Response { static json(body,options){return new NextResponse(JSON.stringify(body),options);} }`,
    auth: `import {state} from 'test-state'; export async function getCurrentUser(){return state.signedIn ? {id:'viewer'} : null;} export async function getDashboardContext(){return {membership:{role:state.role},organization:{id:'viewer-workspace'},user:{email:'viewer@example.test'}};}`,
    admin: `export function isPlatformAdminEmail(){return false;}`,
    status: `import {state} from 'test-state'; export async function getPublicScanStatusProjection(){return {reportReady:true,reportGeneration:'v1',organizationId:'different-owner-workspace'};} export async function getOrganizationScanStatusProjection(){return state.accessible ? {id:'scan'} : null;}`,
    projection: `export async function loadPersistedScanReportProjection(){return {scan:{scanConfigJson:{fullSite:false}},runtimeArtifacts:[]};}`,
    export: `export function buildCanonicalReportExport(){return {scan:{domainHostname:'example.test'}};}`,
    pdf: `import {state} from 'test-state'; export function renderCanonicalReportPdf(report,options){state.rendered.push(options);return Buffer.from('%PDF-1.4');}`,
    branding: `import {state} from 'test-state'; export async function getWorkspaceBrandingRecord(id){state.settings.push(id);return {name:'Viewer Agency',headerTheme:state.theme};} export async function loadWorkspaceReportLogo(id){state.loaded.push(id);if(state.failLogo)throw new Error('unavailable');return state.logo ? {name:'Viewer Agency',image:{body:Buffer.from('logo'),contentType:'image/png'}} : null;}`,
    visual: `export function getVisualEvidenceArtifacts(){return [];}`,
    object: `export async function loadVisualEvidenceObject(){return null;}`,
    options: `export async function readFullSiteOptions(){return {allowed:false};}`,
    fullSite: `export async function loadFullSiteExport(){return null;}`,
    workpaper: `export function buildTrackingWorkpaper(report){return report;} export function renderTrackingWorkpaperCsv(){return '';}`,
  };
  const output = await build({ stdin: { contents: `export {GET} from ${JSON.stringify(route)}; export {state} from 'test-state';`, resolveDir: process.cwd() },
    bundle: true, write: false, format: "esm", platform: "node", plugins: [{ name: "branding-isolation", setup(api) {
      const entries: Record<string, string> = { "next/server": "next", "test-state": "state" };
      const suffixes: Record<string, string> = { "/server/auth": "auth", "/platform-admin": "admin", "/scan-status-projection": "status", "/scan-report-projection": "projection", "/report-export": "export", "/report-export-pdf": "pdf", "/report-branding": "branding", "/visual-evidence": "visual", "/visual-evidence-object": "object", "/full-site-options": "options", "/full-site-report": "fullSite", "/tracking-workpaper": "workpaper" };
      api.onResolve({ filter: /.*/ }, args => {
        const key = entries[args.path] ?? Object.entries(suffixes).find(([suffix]) => args.path.endsWith(suffix))?.[1];
        return key ? { path: key, namespace: "mock" } : undefined;
      });
      api.onLoad({ filter: /.*/, namespace: "mock" }, args => ({ contents: mocks[args.path], loader: "js" }));
    } }] });
  const { GET, state } = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0]!.text).toString("base64")}`);
  const params = Promise.resolve({ scanId: "00000000-0000-0000-0000-000000000001" });
  const request = (query = "format=pdf&branding=workspace") => GET({ nextUrl: new URL(`https://certscore.ai/api/scans/id/report-export?${query}`) }, { params });
  state.signedIn = false;
  assert.equal((await request()).status, 401);
  assert.equal(state.loaded.length, 0);
  assert.equal((await request("format=pdf")).status, 401);
  state.signedIn = true; state.role = "user";
  assert.equal((await request()).status, 403);
  assert.equal(state.loaded.length, 0);
  assert.equal((await request("format=pdf")).status, 403);
  assert.equal((await request("format=json")).status, 200);
  state.role = "advanced"; state.accessible = false;
  assert.equal((await request()).status, 404);
  assert.equal(state.loaded.length, 0);
  assert.equal((await request("format=pdf")).status, 404);
  state.accessible = true; state.logo = false;
  assert.equal((await request()).status, 409);
  state.logo = true; state.failLogo = true;
  assert.equal((await request()).status, 409);
  state.failLogo = false;
  const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  let response: Response;
  try {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    response = await request();
  } finally {
    if (originalAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
  }
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.match(response.headers.get("content-disposition")!, /report-example.test.pdf/);
  assert.deepEqual(state.loaded, ["viewer-workspace", "viewer-workspace", "viewer-workspace"]);
  assert.equal(state.rendered[0].brandName, "Viewer Agency");
  assert.equal(state.rendered[0].brandLogo.body.toString(), "logo");
  assert.equal(state.rendered[0].headerTheme, "white");
  assert.equal(state.rendered[0].appUrl, "http://localhost:3000");
  assert.equal(state.rendered[0].timeZone, "UTC");
  assert.equal((await request("format=pdf&timeZone=America%2FLos_Angeles")).status, 200);
  assert.equal(state.rendered.at(-1).timeZone, "America/Los_Angeles");
  assert.equal((await request("format=pdf&timeZone=unknown%2Fzone")).status, 400);
  assert.ok(state.settings.every((id: string) => id === "viewer-workspace"));
  state.theme = "black";
  assert.equal((await request("format=pdf")).status, 200);
  assert.equal(state.rendered.at(-1).headerTheme, "black");
  assert.equal(state.rendered.at(-1).brandName, undefined);
  assert.equal((await request("format=json&branding=workspace")).status, 400);
  assert.equal((await request("format=pdf&branding=other-workspace")).status, 400);
});
