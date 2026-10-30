import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

test("document exports share workspace branding gates while public Word downloads remain unbranded", async () => {
  const route = fileURLToPath(new URL("../../app/api/scans/[scanId]/report-export/route.ts", import.meta.url));
  const mocks: Record<string, string> = {
    state: `export const state={signedIn:true,role:'advanced',accessible:true,logo:true,failLogo:false,loaded:[],rendered:[],theme:"white",settings:[],ready:true,projection:true,canonical:true,fullSite:false,builds:[],word:[]};`,
    next: `export class NextResponse extends Response { static json(body,options){return new NextResponse(JSON.stringify(body),options);} }`,
    auth: `import {state} from 'test-state'; export async function getCurrentUser(){return state.signedIn ? {id:'viewer'} : null;} export async function getDashboardContext(){return {membership:{role:state.role},organization:{id:'viewer-workspace'},user:{email:'viewer@example.test'}};}`,
    admin: `export function isPlatformAdminEmail(){return false;}`,
    status: `import {state} from 'test-state'; export async function getPublicScanStatusProjection(){return {reportReady:state.ready,reportGeneration:'v1',organizationId:'different-owner-workspace'};} export async function getOrganizationScanStatusProjection(){return state.accessible ? {id:'scan'} : null;}`,
    projection: `import {state} from 'test-state'; export async function loadPersistedScanReportProjection(){return state.projection ? {scan:{scanConfigJson:{fullSite:state.fullSite}},runtimeArtifacts:[]} : null;}`,
    export: `import {state} from 'test-state'; export function buildCanonicalReportExport(scan,fullSite,focus){state.builds.push({fullSite,focus}); return state.canonical ? {scan:{domainHostname:'example.test'},reviewFocus:focus,fullSite} : null;}`,
    pdf: `import {state} from 'test-state'; export function renderCanonicalReportPdf(report,options){state.rendered.push(options);return Buffer.from('%PDF-1.4');}`,
    docx: `import {state} from 'test-state'; export const REPORT_DOCX_CONTENT_TYPE="application/vnd.openxmlformats-officedocument.wordprocessingml.document"; export async function renderCanonicalReportDocx(report,options){state.word.push({report,options});return Buffer.from("PK");}`,
    branding: `import {state} from 'test-state'; export async function getWorkspaceBrandingRecord(id){state.settings.push(id);return {name:'Viewer Agency',headerTheme:state.theme};} export async function loadWorkspaceReportLogo(id){state.loaded.push(id);if(state.failLogo)throw new Error('unavailable');return state.logo ? {name:'Viewer Agency',image:{body:Buffer.from('logo'),contentType:'image/png'}} : null;}`,
    visual: `export function getVisualEvidenceArtifacts(){return [];}`,
    object: `export async function loadVisualEvidenceObject(){return null;}`,
    options: `import {state} from 'test-state'; export async function readFullSiteOptions(){return {allowed:state.fullSite};}`,
    fullSite: `export async function loadFullSiteExport(){return {scope:'full-site'};}`,
    workpaper: `export function buildTrackingWorkpaper(report){return report;} export function renderTrackingWorkpaperCsv(){return '';}`,
  };
  const output = await build({ stdin: { contents: `export {GET} from ${JSON.stringify(route)}; export {state} from 'test-state';`, resolveDir: process.cwd() },
    bundle: true, write: false, format: "esm", platform: "node", plugins: [{ name: "branding-isolation", setup(api) {
      const entries: Record<string, string> = { "next/server": "next", "test-state": "state" };
      const suffixes: Record<string, string> = { "/server/auth": "auth", "/platform-admin": "admin", "/scan-status-projection": "status", "/scan-report-projection": "projection", "/report-export": "export", "/report-export-pdf": "pdf", "/report-export-docx": "docx", "/report-branding": "branding", "/visual-evidence": "visual", "/visual-evidence-object": "object", "/full-site-options": "options", "/full-site-report": "fullSite", "/tracking-workpaper": "workpaper" };
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
  assert.equal(state.rendered.at(-1).brandName, "Viewer Agency");
  assert.equal(state.rendered.at(-1).brandLogo.body.toString(), "logo");
  state.logo = false;
  assert.equal((await request("format=pdf")).status, 200);
  assert.equal(state.rendered.at(-1).brandName, undefined);
  assert.equal((await request()).status, 409);
  state.logo = true; state.failLogo = true;
  assert.equal((await request("format=pdf")).status, 409);
  assert.equal((await request("format=json&branding=workspace")).status, 400);
  assert.equal((await request("format=pdf&branding=other-workspace")).status, 400);

  state.signedIn = false; state.role = "user"; state.accessible = false;
  const brandingReads = state.loaded.length, settingReads = state.settings.length;
  const word = await request("format=docx&reviewFocus=ccpa_cpra&timeZone=Pacific%2FHonolulu");
  assert.equal(word.status, 200);
  assert.equal(word.headers.get("content-type"), "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  assert.equal(word.headers.get("content-disposition"), 'attachment; filename="certscore-example.test.docx"');
  assert.equal(word.headers.get("cache-control"), "private, no-store");
  assert.equal(word.headers.get("x-content-type-options"), "nosniff");
  assert.equal(await word.text(), "PK");
  assert.equal(state.word.at(-1).report.reviewFocus, "ccpa_cpra");
  assert.equal(state.word.at(-1).options.timeZone, "Pacific/Honolulu");
  assert.equal(state.loaded.length, brandingReads); assert.equal(state.settings.length, settingReads);
  assert.equal((await request("format=docx")).status, 200);
  assert.equal(state.word.at(-1).report.reviewFocus, "gdpr_eprivacy");
  assert.equal((await request("format=docx&branding=workspace")).status, 401);
  state.signedIn = true;
  assert.equal((await request("format=docx&branding=workspace")).status, 403);
  state.role = "advanced";
  const inaccessibleReads = state.loaded.length;
  assert.equal((await request("format=docx&branding=workspace")).status, 404);
  assert.equal((await request("format=docx")).status, 200);
  assert.equal(state.word.at(-1).options.brandName, undefined);
  assert.equal(state.loaded.length, inaccessibleReads);
  state.accessible = true; state.logo = false; state.failLogo = false;
  assert.equal((await request("format=docx&branding=workspace")).status, 409);
  assert.equal((await request("format=docx")).status, 200);
  assert.equal(state.word.at(-1).options.brandName, undefined);
  state.logo = true; state.failLogo = true;
  assert.equal((await request("format=docx")).status, 409);
  state.failLogo = false;
  const brandedWord = await request("format=docx&reviewFocus=ccpa_cpra");
  assert.equal(brandedWord.status, 200);
  assert.equal(brandedWord.headers.get("content-disposition"), 'attachment; filename="report-example.test.docx"');
  assert.equal(state.word.at(-1).options.brandName, "Viewer Agency");
  assert.equal(state.word.at(-1).options.brandLogo.body.toString(), "logo");
  assert.equal(state.word.at(-1).options.headerTheme, "black");
  assert.ok(state.loaded.every((id: string) => id === "viewer-workspace"));
  state.signedIn = false; state.role = "user"; state.accessible = false;
  assert.equal((await request("format=docx&timeZone=invalid%2Fzone")).status, 400);
  assert.equal((await request("format=docx&reviewFocus=invalid")).status, 400);
  assert.equal((await request("format=docx&scope=full-site")).status, 409);
  state.fullSite = true;
  assert.equal((await request("format=docx&scope=full-site&reviewFocus=ccpa_cpra")).status, 200);
  assert.equal(state.word.at(-1).report.fullSite.scope, "full-site");
  state.ready = false; assert.equal((await request("format=docx")).status, 404);
  state.ready = true; state.projection = false; assert.equal((await request("format=docx")).status, 404);
  state.projection = true; state.canonical = false; assert.equal((await request("format=docx")).status, 409);
  state.canonical = true;
  assert.equal((await request("format=json")).headers.get("content-type"), "application/json; charset=utf-8");
});
