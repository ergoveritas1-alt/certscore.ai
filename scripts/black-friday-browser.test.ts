import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { chromium, type BrowserContext, type Page } from "playwright";
import { Pool } from "pg";
import { createCampaignStore, type Sql } from "../apps/web/server/promotions/repository";
import { drainCampaignEmails } from "../apps/web/server/promotions/email";
import { campaignDashboard } from "../apps/web/server/promotions/dashboard";

const origin = process.env.BF26_BROWSER_ORIGIN;
const databaseUrl = process.env.BF26_BROWSER_DATABASE_URL;
const enabled = Boolean(origin && databaseUrl);
const secret = "bf26-disposable-qa-only-secret-20261110";
const password = "Local-QA-fixture-only-742!";
const adminEmail = "qa-admin@example.test";

test("Black Friday isolated browser and database QA", { skip: !enabled, timeout: 180_000 }, async t => {
  const app = new URL(origin!);
  const url = new URL(databaseUrl!);
  assert.equal(app.hostname, "localhost");
  assert.equal(app.port, "3018");
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.port, "55432");
  assert.match(url.pathname, /^\/bf26_qa_[a-z0-9_]+$/);
  const artifactDir = process.env.BF26_QA_ARTIFACT_DIR!;
  assert.ok(artifactDir);
  await mkdir(artifactDir, { recursive: true });
  const db = new Pool({ connectionString: databaseUrl });
  const sql: Sql = { query: (text, values) => db.query(text, values) };
  const transaction = async <T>(run: (connection: Sql) => Promise<T>) => {
    const connection = await db.connect();
    try {
      await connection.query("begin");
      const result = await run(connection);
      await connection.query("commit");
      return result;
    } catch (error) {
      await connection.query("rollback");
      throw error;
    } finally {
      connection.release();
    }
  };
  const store = createCampaignStore(transaction, sql);
  const browser = await chromium.launch();
  const external: string[] = [];
  const errors: string[] = [];

  async function context(gpc = false, consent: string | null = "denied") {
    const session = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      extraHTTPHeaders: gpc ? { "Sec-GPC": "1" } : {}
    });
    await session.addInitScript(({ gpc, consent }) => {
      Object.defineProperty(navigator, "globalPrivacyControl", { value: gpc });
      if (location.protocol === "http:" && consent !== null) localStorage.setItem("certscore:analytics-consent:v1", consent);
    }, { gpc, consent });
    await session.route("**/*", route => {
      if (new URL(route.request().url()).origin !== app.origin) {
        external.push(new URL(route.request().url()).origin);
        return route.abort();
      }
      return route.continue();
    });
    session.on("page", page => page.on("pageerror", error => errors.push(error.message)));
    return session;
  }
  async function reset() {
    await db.query("truncate promotion_usage,promotion_events,promotion_audit_log,promotion_email_outbox,promotion_applications,promotion_aggregate_events,promotion_request_receipts,promotion_rate_limits cascade");
  }
  function application(index: number) {
    return {
      requestId: randomUUID(), fullName: "Local QA Applicant", email: `qa-${index}@agency-${index}.test`,
      company: `QA Agency ${index}`, website: `https://agency-${index}.test`,
      businessType: "Independent web developer / marketer", clientSites: "0–5",
      intendedUse: "Local fixture review", terms: true, marketingOptIn: false, analyticsConsent: false
    };
  }
  async function signup(session: BrowserContext, email: string) {
    let response = await session.request.post(app.origin + "/api/auth/sign-up/email", {
      headers: { Origin: app.origin }, data: { name: "Local QA", email, password }
    });
    if (response.status() !== 200) {
      response = await session.request.post(app.origin + "/api/auth/sign-in/email", {
        headers: { Origin: app.origin }, data: { email, password }
      });
    }
    assert.equal(response.status(), 200, await response.text());
  }
  async function login(page: Page, email: string, next: string, create = false) {
    await page.goto(`${app.origin}/login?next=${encodeURIComponent(next)}${create ? "&mode=create_account" : ""}`);
    await page.locator('input[name="email"]').fill(email);
    if (create) await page.locator('button[type="submit"]').filter({ hasText: "Continue" }).click();
    await page.locator('input[name="password"]').fill(password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(url => url.pathname === next);
  }
  function token(id: string, revision = 1) {
    const payload = `${id}.${revision}`;
    return `${payload}.${createHmac("sha256", secret).update(`bf26-invite:${payload}`).digest("base64url")}`;
  }
  async function settleEvents(page: Page) {
    await page.waitForTimeout(200);
  }
  let admin: BrowserContext;
  let actor: string;
  try {
    admin = await context();
    await signup(admin, adminEmail);
    const adminPage = await admin.newPage();
    await adminPage.goto(app.origin + "/app/admin/promotions/black-friday-2026");
    await adminPage.getByRole("heading", { name: "Black Friday 2026 applications" }).waitFor();
    actor = (await db.query("select id from users where email=$1", [adminEmail])).rows[0].id;

    await t.test("navigation counts new visits once, preserves transport dedup and bounds GPC attribution", async () => {
      for (const gpc of [false, true]) {
        await reset();
        const session = await context(gpc, gpc ? "granted" : "denied");
        const page = await session.newPage();
        const sent: Record<string, unknown>[] = [];
        page.on("request", request => {
          if (request.url().endsWith("/api/promotions/black-friday/events")) sent.push(request.postDataJSON());
        });
        await page.goto(app.origin + "/black-friday?utm_source=theadminbar&utm_medium=referral&utm_campaign=black_friday_2026");
        await page.getByRole("link", { name: "Apply for 3 Free Months", exact: true }).first().click();
        await page.getByLabel("Full name", { exact: true }).fill("Local QA");
        await page.getByLabel("Business email", { exact: true }).focus();
        await settleEvents(page);
        await page.getByRole("link", { name: "Back to the offer" }).click();
        await settleEvents(page);
        assert.equal(sent.filter(event => event.event === "bf26_landing_view").length, 2);
        await page.getByRole("link", { name: "Apply for 3 Free Months", exact: true }).first().click();
        await page.getByLabel("Full name", { exact: true }).fill("Another interaction");
        await settleEvents(page);
        assert.equal(sent.filter(event => event.event === "bf26_form_start").length, 2);
        for (const event of sent) {
          assert.equal(event.consent, false);
          assert.deepEqual(event.attribution, {});
          assert.equal(event.actorId, undefined);
          assert.equal(event.sessionId, undefined);
        }
        const event = sent[0];
        for (let repeat = 0; repeat < 2; repeat++) {
          assert.equal((await session.request.post(app.origin + "/api/promotions/black-friday/events", { headers: { Origin: app.origin }, data: event })).status(), 204);
        }
        const counts = (await db.query("select event,sum(count)::int n from promotion_aggregate_events group by event")).rows;
        assert.deepEqual(Object.fromEntries(counts.map(row => [row.event, row.n])), { bf26_form_start: 2, bf26_landing_view: 2 });
        assert.equal((await session.cookies()).length, 0);
        await session.close();
      }
    });

    await t.test("invitation verification retains a failed token, supports retry and refresh, and clears it after success", async () => {
      await reset();
      const record = await store.submit(application(10), false);
      await store.review(record.id!, actor, "approve", "Local verification", "qa-retry", true);
      const session = await context(true);
      const page = await session.newPage();
      let attempts = 0;
      await page.route("**/api/promotions/black-friday/invite", route => {
        attempts++;
        if (attempts === 1) return route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"Temporary fixture failure"}' });
        return route.continue();
      });
      await page.goto(app.origin + "/black-friday/activate#" + token(record.id!));
      await page.getByRole("button", { name: "Retry invitation verification" }).waitFor();
      assert.ok(new URL(page.url()).hash);
      await page.getByRole("button", { name: "Retry invitation verification" }).click();
      await page.getByRole("link", { name: "Create an account", exact: true }).waitFor();
      assert.equal(new URL(page.url()).hash, "");
      assert.ok((await session.cookies()).some(cookie => cookie.name === "bf26-invite" && cookie.httpOnly));
      await page.reload();
      await page.getByRole("link", { name: "Create an account", exact: true }).waitFor();
      await session.close();

      const offlineSession = await context();
      const offlinePage = await offlineSession.newPage();
      let offline = true;
      await offlinePage.route("**/api/promotions/black-friday/invite", route => offline ? route.abort("connectionfailed") : route.continue());
      await offlinePage.goto(app.origin + "/black-friday/activate#" + token(record.id!));
      await offlinePage.getByRole("button", { name: "Retry invitation verification" }).waitFor();
      await offlinePage.reload();
      await offlinePage.getByRole("button", { name: "Retry invitation verification" }).waitFor();
      assert.ok(new URL(offlinePage.url()).hash);
      offline = false;
      await offlinePage.getByRole("button", { name: "Retry invitation verification" }).click();
      await offlinePage.getByRole("link", { name: "Create an account", exact: true }).waitFor();
      assert.equal(new URL(offlinePage.url()).hash, "");
      await offlineSession.close();

      for (const invalid of [token(record.id!).slice(0, -1) + "!", token(record.id!, 2)]) {
        const invalidSession = await context();
        const invalidPage = await invalidSession.newPage();
        await invalidPage.goto(app.origin + "/black-friday/activate#" + invalid);
        await invalidPage.getByRole("alert").filter({ hasText: "invalid or expired" }).waitFor();
        assert.equal(await invalidPage.getByRole("link", { name: "Create an account", exact: true }).count(), 0);
        await invalidSession.close();
      }
      await db.query("update promotion_applications set activation_deadline=now()-interval '1 second' where id=$1", [record.id]);
      const expiredSession = await context();
      const expiredPage = await expiredSession.newPage();
      await expiredPage.goto(app.origin + "/black-friday/activate#" + token(record.id!));
      await expiredPage.getByRole("alert").filter({ hasText: "invalid or expired" }).waitFor();
      await expiredSession.close();
    });

    await t.test("complete application, approval, mock invitation, signup, activation, first-scan fixture and CSV journey", async () => {
      await reset();
      const session = await context(false, null);
      await session.route("https://cloud.umami.is/**", route => route.abort());
      const page = await session.newPage();
      const funnelRequests: Record<string, unknown>[] = [];
      page.on("request", request => {
        if (request.url().endsWith("/api/promotions/black-friday/events")) funnelRequests.push(request.postDataJSON());
      });
      await page.goto(app.origin + "/black-friday?utm_source=theadminbar&utm_medium=referral&utm_campaign=black_friday_2026");
      await page.screenshot({ path: path.join(artifactDir, "landing-desktop.png"), fullPage: true });
      await page.setViewportSize({ width: 375, height: 812 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: path.join(artifactDir, "landing-mobile.png"), fullPage: true });
      await page.getByRole("button", { name: "Allow analytics" }).click();
      await page.getByRole("link", { name: "Apply for 3 Free Months", exact: true }).first().click();
      await page.keyboard.press("Tab");
      assert.ok(await page.evaluate(() => document.activeElement !== document.body));
      assert.equal(await page.locator('[name="terms"]').isChecked(), false);
      assert.equal(await page.locator('[name="marketingOptIn"]').isChecked(), false);
      await page.getByRole("button", { name: "Submit Application" }).click();
      assert.equal(await page.locator("input:invalid").count() > 0, true);
      const data = application(Date.now());
      await page.getByLabel("Full name", { exact: true }).fill(data.fullName);
      await page.getByLabel("Business email", { exact: true }).fill(data.email);
      await page.getByLabel("Organization name", { exact: true }).fill("=QA Formula Fixture");
      await page.getByLabel("Organization website", { exact: true }).fill(data.website);
      await page.getByLabel("Organization type", { exact: true }).selectOption(data.businessType);
      await page.getByLabel("Websites you manage, oversee or advise on", { exact: true }).selectOption(data.clientSites);
      await page.getByLabel("Primary intended use of CertScore.ai").fill(data.intendedUse);
      await page.locator('[name="terms"]').check();
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({ path: path.join(artifactDir, "application-mobile.png"), fullPage: true });
      await page.getByRole("button", { name: "Submit Application" }).click();
      await page.getByRole("status").filter({ hasText: "Thank you" }).waitFor();
      assert.equal(await page.getByText("Look for a confirmation email", { exact: false }).count(), 0);
      const record = (await db.query("select * from promotion_applications where email=$1", [data.email])).rows[0];
      assert.equal(record.status, "submitted");
      const tab = { utm_source: "theadminbar", utm_medium: "referral", utm_campaign: "black_friday_2026" };
      assert.deepEqual(record.attribution, tab);
      assert.deepEqual(funnelRequests.map(request => request.event), ["bf26_landing_view", "bf26_form_start"]);
      for (const request of funnelRequests) {
        assert.deepEqual(Object.keys(request).sort(), ["attribution", "consent", "event", "id"]);
        const isLanding = request.event === "bf26_landing_view";
        assert.equal(request.consent, !isLanding);
        assert.deepEqual(request.attribution, isLanding ? {} : tab);
      }
      assert.deepEqual((await db.query("select distinct source from promotion_aggregate_events order by source")).rows, [{ source: "Direct/unknown" }, { source: "The Admin Bar" }]);
      assert.equal(record.allocation, null);
      assert.equal((await db.query("select count(*)::int n from promotion_email_outbox")).rows[0].n, 2);
      const duplicate = await session.request.post(app.origin + "/api/promotions/black-friday/applications", { headers: { Origin: app.origin }, data: { ...data, requestId: randomUUID() } });
      assert.equal(duplicate.status(), 202);
      assert.equal((await db.query("select count(*)::int n from promotion_email_outbox")).rows[0].n, 2);
      assert.equal((await session.request.get(app.origin + "/api/admin/promotions/black-friday-2026")).status(), 403);

      const adminPage = await admin.newPage();
      await adminPage.goto(app.origin + "/app/admin/promotions/black-friday-2026");
      await adminPage.getByRole("button", { name: "Open =QA Formula Fixture", exact: true }).click();
      await adminPage.getByLabel("Commonly controlled business group").fill("qa-complete");
      await adminPage.getByLabel("I verified the organization", { exact: false }).check();
      await adminPage.getByRole("button", { name: "Approve + queue invitation" }).click();
      await adminPage.getByRole("status").filter({ hasText: /Saved|updated|completed/i }).waitFor();
      const messages: { to: string; text: string }[] = [];
      const delivery = await drainCampaignEmails(record.id, {
        query: (text: string, values: unknown[]) => db.query(text, values), transaction,
        config: () => ({ appUrl: app.origin, fromEmail: "mock@example.test", appPassword: "unused" }),
        transport: () => ({
          close() {},
          async sendMail(message: { to: string; text: string }) {
            messages.push(message);
            return { accepted: [message.to] };
          }
        })
      } as never);
      assert.ok(messages.some(message => message.to === "ben@certscore.ai"), JSON.stringify({
        delivery, nodeEnv: process.env.NODE_ENV, flag: process.env.CERTSCORE_BF26_EMAIL_DELIVERY,
        outbox: (await db.query("select kind,status,last_error from promotion_email_outbox")).rows
      }));
      const invitation = messages.find(message => message.text.includes("/black-friday/activate#"))!;
      assert.equal(invitation.to, data.email);
      const activationUrl = invitation.text.match(/http:\/\/localhost:3018\/black-friday\/activate#[^\s]+/)![0];
      await page.goto(activationUrl);
      await page.getByRole("link", { name: "Create an account", exact: true }).waitFor();
      await login(page, data.email, "/black-friday/activate", true);
      await page.getByRole("button", { name: "Activate my three months of Pro" }).click();
      await page.getByRole("heading", { name: "Your Pro access is active." }).waitFor();
      await page.screenshot({ path: path.join(artifactDir, "activated.png"), fullPage: true });
      const activated = (await db.query("select * from promotion_applications where id=$1", [record.id])).rows[0];
      const organization = (await db.query("select plan,stripe_subscription_id,promotion_effective_plan(id,plan) effective from organizations where id=$1", [activated.organization_id])).rows[0];
      assert.deepEqual(organization, { plan: "free", stripe_subscription_id: null, effective: "pro" });
      assert.equal((await db.query("select entitlement_end=promotion_month(activated_at,3) exact from promotion_applications where id=$1", [record.id])).rows[0].exact, true);
      assert.equal((await session.request.get(app.origin + "/api/admin/promotions/black-friday-2026")).status(), 403);

      // This is a database-backed scanner fixture. It never dispatches a worker.
      const scan = (await db.query("insert into scans(organization_id,scan_type,status) values($1,'full','queued') returning id", [activated.organization_id])).rows[0];
      await db.query("update scans set status='completed',completed_at=now() where id=$1", [scan.id]);
      const events = (await db.query("select event from promotion_events where application_id=$1", [record.id])).rows.map(row => row.event);
      for (const name of ["bf26_form_submit","bf26_approved","bf26_invite_sent","bf26_activated","bf26_first_scan"]) assert.ok(events.includes(name), name);
      assert.equal((await db.query("select pages from promotion_usage where application_id=$1", [record.id])).rows[0].pages, 1);
      const csv = await admin.request.get(app.origin + "/api/admin/promotions/black-friday-2026");
      assert.equal(csv.status(), 200);
      assert.ok((await csv.text()).includes("'=QA Formula Fixture"));
      const today = new Date().toISOString().slice(0, 10);
      const dashboard = await campaignDashboard("2026-11-09", today, { query: (text: string, values?: unknown[]) => db.query(text, values), list: store.list });
      for (const name of events) assert.equal(dashboard.totals[name], 1, name);
      assert.equal(dashboard.sources["Direct/unknown"]?.bf26_landing_view, 1);
      for (const name of ["bf26_form_start", "bf26_form_submit"]) {
        assert.equal(dashboard.sources["The Admin Bar"]?.[name], 1, name);
      }
      assert.ok((await db.query("select 1 from promotion_audit_log where application_id=$1 and action='approve'", [record.id])).rowCount);
      await adminPage.goto(app.origin + "/app/admin/promotions/black-friday-2026/dashboard");
      await adminPage.getByRole("heading", { name: "Black Friday 2026 funnel", exact: true }).waitFor();
      await adminPage.screenshot({ path: path.join(artifactDir, "funnel.png"), fullPage: true });

      await page.goto(activationUrl);
      await page.getByRole("button", { name: "Activate my three months of Pro" }).click();
      await page.getByRole("heading", { name: "Your Pro access is active." }).waitFor();
      const reused = (await db.query("select activated_at,entitlement_end from promotion_applications where id=$1", [record.id])).rows[0];
      assert.equal(reused.entitlement_end.getTime(), activated.entitlement_end.getTime());
      assert.equal(reused.activated_at.getTime(), activated.activated_at.getTime());
      await session.close();
      await adminPage.close();
    });

    await t.test("existing free user signs in under GPC; a different account cannot redeem the invitation", async () => {
      await reset();
      const data = application(30);
      const existing = await context(true);
      await signup(existing, data.email);
      await existing.close();
      const session = await context(true);
      const submitted = await session.request.post(app.origin + "/api/promotions/black-friday/applications", {
        headers: { Origin: app.origin, "Sec-GPC": "1" }, data: { ...data, analyticsConsent: true, attribution: { utm_source: "linkedin" } }
      });
      assert.equal(submitted.status(), 202);
      const record = (await db.query("select * from promotion_applications where email=$1", [data.email])).rows[0];
      assert.deepEqual(record.attribution, {});
      await store.review(record.id, actor, "approve", "Local verification", "qa-existing", true);
      const wrong = await context();
      await signup(wrong, "wrong-identity@example.test");
      assert.equal((await wrong.request.post(app.origin + "/api/promotions/black-friday/invite", { headers: { Origin: app.origin }, data: { token: token(record.id) } })).status(), 200);
      assert.equal((await wrong.request.post(app.origin + "/api/promotions/black-friday/activate", { headers: { Origin: app.origin } })).status(), 403);
      await wrong.close();
      const page = await session.newPage();
      await page.goto(app.origin + "/black-friday/activate#" + token(record.id));
      await page.locator('a[href="/login?next=%2Fblack-friday%2Factivate"]').waitFor();
      await login(page, data.email, "/black-friday/activate");
      await page.getByRole("button", { name: "Activate my three months of Pro" }).click();
      await page.getByRole("heading", { name: "Your Pro access is active." }).waitFor();
      assert.equal((await db.query("select count(*)::int n from promotion_events where application_id=$1 and event='bf26_activated'", [record.id])).rows[0].n, 1);
      await session.close();
    });

    await t.test("ten-place limit and closed presentation preserve existing invitations", async () => {
      await reset();
      for (let index = 100; index < 111; index++) await store.submit(application(index), false);
      // Use the authoritative timestamp/UUID tie-break order, including when
      // fast local inserts share a millisecond.
      const records = await store.list();
      for (let index = 0; index < 9; index++) await store.review(records[index]!.id!, actor, "approve", "Local verification", `qa-group-${index}`, true);
      const responses = await Promise.all(records.slice(9).map((record, index) => admin.request.post(app.origin + "/api/admin/promotions/black-friday-2026", {
        headers: { Origin: app.origin }, data: { id: record.id, action: "approve", group: `qa-concurrent-${index}`, verified: true }
      })));
      assert.deepEqual(responses.map(response => response.status()).sort(), [200, 409]);
      assert.equal((await store.availability()).allocated, 10);
      const session = await context();
      const page = await session.newPage();
      await page.goto(app.origin + "/black-friday");
      assert.equal(await page.getByRole("link", { name: "Apply for 3 Free Months", exact: true }).count(), 0);
      await page.getByText("All ten places have been allocated.", { exact: true }).waitFor();
      await page.screenshot({ path: path.join(artifactDir, "closed-offer.png"), fullPage: true });
      await page.goto(app.origin + "/black-friday/apply");
      await page.getByRole("status").filter({ hasText: "Applications are currently closed" }).waitFor();
      const approved = await store.invitation(token(records[0]!.id!), secret);
      assert.ok(approved.approved_at);
      await session.close();
    });
    assert.deepEqual(external, []);
    assert.deepEqual(errors, []);
    await writeFile(path.join(artifactDir, "browser-summary.json"), JSON.stringify({ externalRequests: external, pageErrors: errors, firstScan: "Disposable SQL fixture only" }, null, 2));
  } finally {
    await browser.close();
    await db.end();
  }
});

// Run separately against the loopback preview whose Node clock is frozen after
// the deadline. This intentionally clears only the dedicated disposable QA DB.
test("expired offer has no interactive application CTA", { skip: !process.env.BF26_EXPIRY_ORIGIN }, async () => {
  assert.equal(process.env.BF26_EXPIRY_ORIGIN, "http://localhost:3019");
  const url = new URL(databaseUrl!);
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.port, "55432");
  assert.match(url.pathname, /^\/bf26_qa_[a-z0-9_]+$/);
  const db = new Pool({ connectionString: databaseUrl });
  const browser = await chromium.launch();
  try {
    await db.query("truncate promotion_applications cascade");
    const page = await browser.newPage();
    await page.route("**/*", route => new URL(route.request().url()).origin === process.env.BF26_EXPIRY_ORIGIN ? route.continue() : route.abort());
    await page.goto(process.env.BF26_EXPIRY_ORIGIN + "/black-friday");
    await page.getByText("Applications are currently closed.", { exact: true }).first().waitFor();
    assert.equal(await page.getByRole("link", { name: "Apply for 3 Free Months", exact: true }).count(), 0);
    await page.screenshot({ path: path.join(process.env.BF26_QA_ARTIFACT_DIR!, "expired-offer.png"), fullPage: true });
    await page.goto(process.env.BF26_EXPIRY_ORIGIN + "/black-friday/apply");
    await page.getByRole("status").filter({ hasText: "Applications are currently closed" }).waitFor();
  } finally {
    await browser.close();
    await db.end();
  }
});
