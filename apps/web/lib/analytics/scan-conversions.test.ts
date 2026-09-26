import assert from "node:assert/strict";
import test from "node:test";
import { trackAcceptedScan, trackCompletedScan, trackFullSiteCompletion } from "./scan-conversions";
import { consumeScanCompletion, rememberScanSubmission, SCAN_CONVERSION_STORAGE_KEY, SCAN_CONVERSION_TTL_MS } from "./scan-conversion-state";
import { ANALYTICS_CONSENT_STORAGE_KEY, saveAnalyticsConsent } from "./consent";
import { CAMPAIGN_ATTRIBUTION_STORAGE_KEY } from "../attribution/campaign-attribution";
import { AUTHENTIC_SAMPLE_REPORT_SCAN_ID } from "../marketing/sample-report";
import { extractScanIdFromPath } from "../product-analytics/contract";

const a = "11111111-1111-4111-8111-111111111111";
const b = "22222222-2222-4222-8222-222222222222";
const c = "33333333-3333-4333-8333-333333333333";
function memory() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
}

async function browser(choice: "granted" | "denied" | null, run: (ctx: { location: { pathname: string; search: string }; events: Record<string, unknown>[]; ga: unknown[]; session: ReturnType<typeof memory> }) => Promise<void> | void) {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const originalFetch = globalThis.fetch;
  const local = memory(), session = memory(), ga: unknown[] = [], events: Record<string, unknown>[] = [];
  if (choice) local.setItem(ANALYTICS_CONSENT_STORAGE_KEY, choice);
  local.setItem(CAMPAIGN_ATTRIBUTION_STORAGE_KEY, JSON.stringify({ utm_source: "test" }));
  const location = { pathname: "/solutions/cookie-consent-scanner", search: "?utm_source=test" };
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    localStorage: local, sessionStorage: session, location, innerWidth: 1000, dataLayer: ga,
    setTimeout: (fn: () => void) => setTimeout(fn, 0), clearTimeout,
    dispatchEvent: () => true,
  } });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { language: "en" } });
  globalThis.fetch = async (_url, init) => { events.push(JSON.parse(String(init?.body))); return new Response(null, { status: 201 }); };
  try { await run({ location, events, ga, session }); } finally {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow); else Reflect.deleteProperty(globalThis, "window");
    if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator); else Reflect.deleteProperty(globalThis, "navigator");
    globalThis.fetch = originalFetch;
  }
}
const submit = (scanId: string, reusedExistingScan = false) => trackAcceptedScan({ scanId, reusedExistingScan, source: "homepage", targetType: "domain" });

test("fresh submission retains canonical scan ID and completes once across repeat report visits", async () => {
  await browser("granted", async ({ location, events, ga }) => {
    await submit(a);
    await submit(a); // idempotent recovery
    assert.equal(events.length, 1);
    assert.equal(events[0]?.scanId, a);
    assert.equal(events[0]?.route, "/solutions/cookie-consent-scanner");
    location.pathname = `/scan/${a}`;
    location.search = "";
    trackCompletedScan(a, "example.com");
    trackCompletedScan(a, "example.com"); // strict effects / refresh
    await submit(a);
    assert.deepEqual(events.map(event => event.eventName), ["scan_started", "scan_completed"]);
    assert.equal(events[1]?.scanId, a);
    assert.equal(events[1]?.campaignSource, "test");
    assert.deepEqual(ga.map(event => (event as { event: string }).event), ["scan_started", "scan_completed", "first_scan_completed"]);
  });
});

test("shared reports, sample reports, reused results and missing freshness do not convert", async () => {
  await browser("granted", async ({ location, events, ga }) => {
    location.pathname = `/scan/${a}`;
    trackCompletedScan(a, "example.com");
    await submit(a, true);
    await trackAcceptedScan({ scanId: a, source: "homepage", targetType: "domain" });
    trackCompletedScan(a, "example.com");
    await submit(AUTHENTIC_SAMPLE_REPORT_SCAN_ID);
    location.pathname = `/scan/${AUTHENTIC_SAMPLE_REPORT_SCAN_ID}`;
    trackCompletedScan(AUTHENTIC_SAMPLE_REPORT_SCAN_ID, "example.com");
    assert.deepEqual(events, []); assert.deepEqual(ga, []);
  });
});

test("a mismatched report cannot consume another scan's journey", async () => {
  await browser(null, async ({ location, events, ga }) => {
    await submit(a);
    location.pathname = `/scan/${b}`;
    trackCompletedScan(a, "example.com");
    assert.equal(events.length, 1);
    location.pathname = `/app/scans/${a}`;
    trackCompletedScan(a, "example.com");
    assert.equal(events.length, 2);
    assert.deepEqual(ga, []); // optional analytics still requires grant
  });
});

test("opt-out suppresses conversion identity and revocation removes pending journeys", async () => {
  await browser("denied", async ({ events, session }) => {
    await submit(a); trackCompletedScan(a, "example.com");
    assert.deepEqual(events, []); assert.equal(session.getItem(SCAN_CONVERSION_STORAGE_KEY), null);
  });
  await browser("granted", async ({ location, events, session }) => {
    await submit(a);
    saveAnalyticsConsent("denied");
    assert.equal(session.getItem(SCAN_CONVERSION_STORAGE_KEY), null);
    saveAnalyticsConsent("granted");
    location.pathname = `/scan/${a}`; trackCompletedScan(a, "example.com");
    assert.equal(events.length, 1);
  });
});

test("domain milestones fire only for newly completed distinct domains", async () => {
  await browser("granted", async ({ location, ga }) => {
    for (const [id, domain] of [[a, "example.com"], [b, "example.com"], [c, "second.example"]] as const) {
      await submit(id); location.pathname = `/scan/${id}`; trackCompletedScan(id, domain);
    }
    const milestones = ga.map(event => (event as { event: string }).event).filter(event => event === "first_scan_completed" || event === "second_distinct_domain_scanned");
    assert.deepEqual(milestones, ["first_scan_completed", "second_distinct_domain_scanned"]);
  });
});

test("journey storage fails closed for stale, malformed or unavailable storage", () => {
  const storage = memory();
  assert.equal(rememberScanSubmission(storage, a, "homepage", 100), true);
  assert.equal(consumeScanCompletion(storage, a, 100 + SCAN_CONVERSION_TTL_MS), null);
  storage.setItem(SCAN_CONVERSION_STORAGE_KEY, "not json");
  assert.equal(consumeScanCompletion(storage, a), null);
  const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
  assert.equal(rememberScanSubmission(blocked, a, "homepage"), false);
  assert.equal(consumeScanCompletion(blocked, a), null);
  assert.equal(rememberScanSubmission(memory(), "invalid", "homepage"), false);
});

test("public and authenticated report paths resolve the same canonical scan ID", () => {
  for (const prefix of ["/scan/", "/scano/", "/app/scans/", "/app/scanso2/"]) assert.equal(extractScanIdFromPath(`${prefix}${a}`), a);
  assert.equal(extractScanIdFromPath("/scan/invalid"), undefined);
});


test("full-site completion requires the matching terminal crawl with no active pages", async () => {
  await browser(null, async ({ location, events }) => {
    await submit(a); location.pathname = `/app/scans/${a}`;
    for (const [scanId, status, active] of [[a, "running", 1], [a, "stopped", 0], [a, "completed", 1], [b, "completed", 0]] as const) {
      trackFullSiteCompletion(a, { state: { scanId, status }, counts: { active } }, "https://example.com/");
    }
    assert.equal(events.length, 1);
    trackFullSiteCompletion(a, { state: { scanId: a, status: "completed" }, counts: { active: 0 } }, "https://example.com/");
    assert.equal(events.length, 2);
    assert.equal(events[1]?.eventName, "scan_completed");
  });
});
