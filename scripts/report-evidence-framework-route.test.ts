import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { reportRequestScanFixture } from "../apps/web/server/scans/report-forms.fixture";
import { buildTimelineReportModel } from "../apps/web/components/scans/report-lab/timeline-report-model";

test("actual evidence route preserves framework in pages/downloads and rejects cross-framework cursors", async t => {
  const mocks: Record<string, string> = {
    state: "export const state={record:null,model:null};",
    export: "export function buildCanonicalReportExport(){throw Error('Unexpected tracking export');}",
    workpaper: "export function buildTrackingWorkpaper(){throw Error('Unexpected workpaper');} export function renderTrackingWorkpaperCsv(){throw Error('Unexpected CSV');}",
    ticket: "export function issueReportDownloadTicket(){throw Error('Unexpected ticket');} export function verifyReportDownloadTicket(){return null;}",
    fullsite: "export async function loadFullSiteReport(){throw Error('Unexpected full-site read');}",
    access: "import {state} from 'test-state'; export class ReportEvidenceAccessError extends Error{} export async function loadAuthorizedReportEvidence(){return state.record;}",
    resource: "export const API_V2_SCAN_ID_PATTERN=/^[a-f0-9-]{36}$/; export function apiV2JsonResponse({body,status,headers}){return Response.json(body,{status,headers});} export function buildApiV2Error(value){return value;}",
    keys: "export function parseBearerToken(){return 'owned';} export async function validateCertScoreBearerToken(){throw Error('Unexpected credential lookup');}",
    throttle: "export async function enforceApiV2ScanReadThrottle(){return null;}",
    projection: "export async function loadPersistedScanReportProjection(){throw Error('Unexpected DB read');} export async function loadAnonymousPersistedScanReportProjection(){throw Error('Unexpected DB read');}",
    details: "export function buildDetailedEvidenceExport(){return {};}",
    model: "import {state} from 'test-state'; export async function buildVerifiedTimelineReportModel(){return state.model;}",
  };
  const suffixes: Record<string, string> = { "/detailed-evidence-report": "details", "/report-export": "export", "/tracking-workpaper": "workpaper", "/report-download-ticket": "ticket", "/full-site-report": "fullsite", "/report-evidence-access": "access", "/scan-resource": "resource", "/integrations/api-keys": "keys", "/api-v2-read-throttle": "throttle", "/scan-report-projection": "projection", "/verified-timeline-report-model": "model" };
  const output = await build({ stdin: { contents: `export {GET} from './apps/web/app/api/v2/scans/[scanId]/report-evidence/route.ts'; export {state} from 'test-state';`, resolveDir: process.cwd() }, bundle: true, write: false, format: "esm", platform: "node", plugins: [{ name: "owned-route", setup(api) {
    api.onResolve({ filter: /.*/ }, args => {
      const key = args.path === "test-state" ? "state" : Object.entries(suffixes).find(([suffix]) => args.path.endsWith(suffix))?.[1];
      return key ? { path: key, namespace: "owned" } : undefined;
    });
    api.onLoad({ filter: /.*/, namespace: "owned" }, args => ({ contents: mocks[args.path], loader: "js" }));
  } }] });
  const directory = await mkdtemp(join(tmpdir(), "certscore-evidence-framework-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, "route.mjs"); await writeFile(file, output.outputFiles[0]!.text);
  const { GET, state } = await import(pathToFileURL(file).href);
  const scan = reportRequestScanFixture(), model = buildTimelineReportModel(scan); assert.ok("findings" in model);
  state.record = scan; state.model = model;
  state.model.reviewFocus = "gdpr_eprivacy";
  state.model.gdprTransparencyRows = Array.from({ length: 100 }, (_, i) => ({ id: `owned-${i}`, label: "EU_ONLY_DISCLOSURE", status: "Observed", rationale: "Owned evidence ".repeat(100) }));
  const original = JSON.stringify(state.model), scanId = scan.scan.id;
  const get = (query: string) => GET(new Request(`https://certscore.ai/api/v2/scans/${scanId}/report-evidence?${query}`), { params: Promise.resolve({ scanId }) });
  const eu = await get("section=policy&reviewFocus=gdpr_eprivacy"), page = await eu.json();
  assert.equal(eu.status, 200); assert.equal(page.reviewFocus, "gdpr_eprivacy");
  assert.ok(page.pagination.nextCursor); assert.match(page.download.url, /reviewFocus=gdpr_eprivacy/);
  const ca = await get("section=policy&reviewFocus=ccpa_cpra"), caPage = await ca.json();
  assert.equal(ca.status, 200); assert.equal(caPage.reviewFocus, "ccpa_cpra");
  assert.doesNotMatch(JSON.stringify(caPage.entries), /EU_ONLY_DISCLOSURE/);
  const download = await get(new URL(caPage.download.url).search.slice(1));
  assert.equal(download.status, 200); assert.match(download.headers.get("Content-Disposition")!, /attachment/);
  assert.equal((await download.json()).reviewFocus, "ccpa_cpra");
  const drift = await get(`section=policy&reviewFocus=ccpa_cpra&cursor=${encodeURIComponent(page.pagination.nextCursor)}`);
  assert.equal(drift.status, 409);
  assert.equal((await get("reviewFocus=invalid")).status, 400);
  assert.equal((await get("workpaper=tracking&reviewFocus=ccpa_cpra")).status, 400);
  assert.equal(JSON.stringify(state.model), original);
});
