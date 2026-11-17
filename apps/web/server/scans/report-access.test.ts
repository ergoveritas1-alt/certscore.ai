import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
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

test("current and legacy report pages authenticate before metadata, fixture and report reads", async () => {
  for (const route of ["scan", "scano"]) {
    const source = await readFile(`apps/web/app/(marketing)/${route}/[scanId]/page.tsx`, "utf8");
    for (const [start, end] of [[source.indexOf("export async function generateMetadata"), source.indexOf("export default async function")], [source.indexOf("export default async function"), source.length]]) {
      const body = source.slice(start, end);
      const guard = body.indexOf("await requireReportUser(");
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
