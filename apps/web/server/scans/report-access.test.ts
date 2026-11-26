import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { requireReportUser, reportApiAccessError, reportReturnPath } from "./report-access";

const user = { id: "account", email: "reader@example.test", authProvider: "password", fullName: null };

test("shared report login preserves report, review focus and repeated query parameters", async () => {
  const next = reportReturnPath("/scan/scan-id", { reviewFocus: "ccpa_cpra", filter: ["a", "b"], unused: undefined });
  assert.equal(next, "/scan/scan-id?reviewFocus=ccpa_cpra&filter=a&filter=b");
  let reportReads = 0;
  await assert.rejects(async () => {
    await requireReportUser(next, async () => null);
    reportReads++;
  }, (error: any) => {
    assert.equal(error.digest, `NEXT_REDIRECT;replace;/login?${new URLSearchParams({next})};307;`);
    return true;
  });
  assert.equal(reportReads, 0);
});

test("unauthenticated and expired sessions cannot access browser report data", async () => {
  const result = await reportApiAccessError(async () => null);
  assert.equal(result?.status, 401);
  assert.equal(result?.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await result?.json(), { error: "Sign in or create an account to access this report." });
});

test("a validated account can read and share without changing account or report data", async () => {
  const unchanged = structuredClone(user);
  assert.equal(await requireReportUser("/scan/example", async () => user), user);
  assert.equal(await reportApiAccessError(async () => user), null);
  assert.deepEqual(user, unchanged);
});

test("report checks and login bypass the session cookie cache so revocation cannot loop through login", async () => {
  const [access, auth, session, login] = await Promise.all([
    readFile("apps/web/server/scans/report-access.ts", "utf8"),
    readFile("apps/web/server/auth.ts", "utf8"),
    readFile("apps/web/server/better-auth/session.ts", "utf8"),
    readFile("apps/web/app/(marketing)/login/page.tsx", "utf8"),
  ]);
  assert.match(access, /getFreshCurrentUser\(\)/);
  assert.match(auth, /getBetterAuthSessionUser\(\{ disableCookieCache: true \}\)/);
  assert.match(session, /options\.disableCookieCache \? \{ disableCookieCache: true \}/);
  assert.match(login, /await getFreshCurrentUser\(\)/);
});

test("workspace report routes keep ownership checks behind fresh session verification", async () => {
  for (const path of ["scans/[scanId]/page", "scans/[scanId]/legacy-page", "scanso2/[scanId]/page"]) {
    const source = await readFile(`apps/web/app/app/${path}.tsx`, "utf8");
    const body = source.slice(source.indexOf("export default async function"));
    assert.ok(body.indexOf("await requireReportUser(") < body.indexOf("getDashboardContext()"), path);
    assert.match(body, /getOrganizationScanStatusProjection/);
  }
});

test("auth failures fail closed and return paths cannot redirect outside the app", async () => {
  const failure = new Error("auth unavailable");
  await assert.rejects(reportApiAccessError(async () => { throw failure; }), error => error === failure);
  for (const path of ["https://example.test", "//example.test", "/\\example.test", "/scan/\ninvalid"]) {
    assert.equal(reportReturnPath(path), "/app");
    await assert.rejects(requireReportUser(path, async () => null), (error: any) => {
      assert.match(error.digest, /next=%2Fapp;/);
      return true;
    });
  }
});

test("current and legacy report pages authorize viewers before metadata, fixture and report reads", async () => {
  for (const route of ["scan", "scano"]) {
    const source = await readFile(`apps/web/app/(marketing)/${route}/[scanId]/page.tsx`, "utf8");
    for (const [start, end] of [[source.indexOf("export async function generateMetadata"), source.indexOf("export default async function")], [source.indexOf("export default async function"), source.length]]) {
      const body = source.slice(start, end);
      const guard = body.indexOf(route === "scan" ? "await loadReportViewer(" : "await requireReportUser(");
      assert.ok(guard >= 0, route);
      for (const needle of ["await loadReadyReport(", "await loadScanStatus(", "await getPublicScanStatusProjection(", 'process.env.NODE_ENV !== "production"']) {
        const access = body.indexOf(needle);
        if (access >= 0) assert.ok(guard < access, `${route}: guard before ${needle}`);
      }
    }
  }
});

test("every browser report data and export route gates its handler before any data work", async () => {
  for (const route of ["report-export", "report-details/gdpr-eprivacy", "runtime-evidence-graph", "form-snapshot", "visual-evidence/[artifactId]", "full-site", "full-site/coverage.csv"]) {
    const source = await readFile(`apps/web/app/api/scans/[scanId]/${route}/route.ts`, "utf8");
    const handler = source.slice(source.indexOf("export async function GET("));
    assert.match(handler, /\) \{\s*const accessError = await reportApiAccessError\(\);\s*if \(accessError\) return accessError;/, route);
    assert.doesNotMatch(source, /public, max-age/, route);
  }
});

test("shared report enables its PDF menu item only for viewers eligible for workspace export", async () => {
  const page = fileURLToPath(new URL("../../app/(marketing)/scan/[scanId]/page.tsx", import.meta.url));
  const fixtures: Record<string, string> = {
    "test-state": `export const state = { role: 'advanced', workspace: true, access: true, signedIn: true, admin: false, ready: true, status: 'completed', publicationRequestStatus: null, lookups: [] };`,
    "react": `export const cache = fn => fn;`,
    "react/jsx-runtime": `export const Fragment = Symbol(); export const jsx = (component, props) => ({ component, props }); export const jsxs = jsx;`,
    "next/link": `export default function Link() {}`,
    "next/navigation": `export function redirect() { throw Error('Unexpected redirect'); } export const notFound = redirect;`,
    "report-access": `import { state } from 'test-state'; export async function requireReportViewer() {
      return { signedIn: state.signedIn, scan: { status: state.status, publicationRequestStatus: state.publicationRequestStatus, reportProjectionRequired: true, reportReady: false } };
    } export const reportReturnPath = path => path;`,
    "full-site-options": `export async function readFullSiteOptions() { return { allowed: false }; }`,
    "app-shell": `export function AppHeader() {}`,
    "site-footer": `export function SiteFooter() {}`,
    "site-header": `export function SiteHeader() {}`,
    "pending-scan-detail-view": `export function PendingScanDetailView() {}`,
    "scan-progress-report-visible": `export function ScanProgressReportVisible() {}`,
    "shadow-scan-report": `export function ShadowScanReport() {}`,
    "shadow-report-actions": `export function ReportGuestShareProvider() {}`,
    "access-control": `export function isPublicAccountCreationEnabled() { return true; }`,
    "shadow-report-data": `export const SHADOW_REPORT_SCAN_ID = 'fixture'; export const SHADOW_REPORT = {};`,
    "verified-timeline-report-model": `export const buildTerminalRuntimeVisitReport = () => null; export const buildVerifiedTimelineReportModel = async report => report;`,
    "seo": `export const absoluteUrl = path => path;`,
    "auth": `import { state } from 'test-state'; export async function getDashboardContext() {
      return { user: { email: 'viewer@example.test' }, membership: state.workspace ? { role: state.role } : null,
        organization: state.workspace ? { id: 'viewer-workspace', name: 'Example workspace', plan: 'pro' } : null };
    }`,
    "platform-admin": `import { state } from 'test-state'; export const isPlatformAdminEmail = () => state.admin;`,
    "scan-report-projection": `import { state } from 'test-state'; let reads = 0;
      export async function loadPersistedScanReportProjection() { return state.ready || (state.signedIn && ++reads > 1) ? { scan: { host: 'example.test' } } : null; }`,
    "scan-status-projection": `import { state } from 'test-state';
      export async function getPublicScanStatusProjection() { return { status: 'completed', reportReady: true }; }
      export async function getOrganizationScanStatusProjection(input) { state.lookups.push(input); return state.access ? { id: input.scanId } : null; }
      export const isCompletedScanStatus = status => status === 'completed'; export const isPendingScanStatus = status => status === 'running';`,
  };
  const bundle = await build({
    stdin: { contents: `export { default as renderPage } from ${JSON.stringify(page)}; export { state } from 'test-state';`, resolveDir: process.cwd() },
    bundle: true, write: false, platform: "node", format: "esm", jsx: "automatic",
    plugins: [{ name: "shared-report-page-fixture", setup(builder) {
      builder.onResolve({ filter: /.*/ }, ({ path }) => {
        const key = path in fixtures ? path : path.split("/").at(-1)!;
        return key in fixtures ? { path: key, namespace: "fixture" } : undefined;
      });
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({ contents: fixtures[path]!, loader: "js" }));
    } }],
  });
  const { renderPage, state } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0]!.text).toString("base64")}`);
  const render = () => renderPage({ params: Promise.resolve({ scanId: "scan-1" }), searchParams: Promise.resolve({ reviewFocus: "gdpr_eprivacy" }) });
  state.ready = false;
  assert.equal((await render()).props.canExportPdf, true, "fallback ready projection");
  state.ready = true;
  const signedIn = await render();
  assert.equal(signedIn.props.canExportPdf, true, "initial ready projection");
  const header = await signedIn.props.header.component();
  assert.equal(header.component.name, "AppHeader");
  assert.deepEqual(header.props, {
    isPlatformAdmin: false,
    canManageCompany: false,
    organizationName: "Example workspace",
    plan: "pro",
    userEmail: "viewer@example.test",
  });
  assert.deepEqual(state.lookups, Array(2).fill({ organizationId: "viewer-workspace", scanId: "scan-1" }));
  state.access = false;
  assert.equal((await render()).props.canExportPdf, false, "report belongs to another workspace");
  state.access = true;
  state.role = "user";
  assert.equal((await render()).props.canExportPdf, false, "regular account");
  state.workspace = false;
  assert.equal((await render()).props.canExportPdf, false, "account without a workspace");
  state.workspace = true;
  state.admin = true;
  state.access = false;
  assert.equal((await render()).props.canExportPdf, true, "platform admin");
  state.signedIn = false;
  const guest = await render();
  assert.equal(guest.component.name, "ReportGuestShareProvider");
  assert.equal(guest.props.allowCreateAccount, true);
  assert.equal(guest.props.children.props.canExportPdf, undefined, "guest can render the report with no PDF capability");
  assert.equal(guest.props.children.props.header, undefined, "guest retains the marketing header");
  assert.equal(state.lookups.length, 3, "only eligible non-admins need a workspace scan lookup");

  state.ready = false;
  state.status = "running";
  const pending = await render();
  assert.equal(pending.props.children[1].props.children.component.name, "PendingScanDetailView");
  for (const [status, publicationRequestStatus] of [["failed", null], ["completed", "terminal_failure"]]) {
    state.status = status;
    state.publicationRequestStatus = publicationRequestStatus;
    const failed = await render();
    const failureContent = failed.props.children[1].props.children.props.children;
    assert.equal(failureContent[1].props.children, "Scan ended without a report");
    const restartLink = failureContent.find((child: { component: unknown; props: { children?: unknown } }) =>
      typeof child.component === "function" && child.component.name === "Link" && child.props.children === "Start another scan",
    );
    assert.equal(restartLink?.props.href, "/#homepage-scan");
  }
});

test("email, menu, copy and download entry points recheck sharing authorization", async () => {
  const email = await readFile("apps/web/server/scans/email-report.ts", "utf8");
  assert.ok(email.indexOf("await requireReportUser(") < email.indexOf("const gmailConfig = getGmailConfig()"));
  const action = await readFile("apps/web/server/scans/report-share-access.ts", "utf8");
  assert.match(action, /await requireReportUser\(returnPath\)/);
  for (const folder of ["scans", "scanso2"]) {
    const menu = await readFile(`apps/web/components/${folder}/report-lab/shadow-report-actions.tsx`, "utf8");
    assert.match(menu, /onClick=\{openAuthorizedReportShareMenu\}/);
    assert.match(menu, /async function copyReportLink\(\) \{\s*await authorizeCurrentReportShare\(\)/);
    assert.match(menu, /onClick=\{followAuthorizedReportShareLink\}/);
    const legacy = await readFile(`apps/web/components/${folder}/share-report-actions.tsx`, "utf8");
    assert.match(legacy, /async function copyValue\(value: string\) \{\s*await authorizeCurrentReportShare\(\)/);
    assert.match(legacy, /await authorizeCurrentReportShare\(\); setIsEmailDialogOpen\(true\)/);
  }
  const downloads = await readFile("apps/web/components/scans/report-document-download-link.tsx", "utf8");
  assert.match(downloads, /await followAuthorizedReportShareLink\(event\)/);
});
