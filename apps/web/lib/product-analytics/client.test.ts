import assert from "node:assert/strict";
import test from "node:test";
import { trackProductEvent } from "./client";
import { ANALYTICS_CONSENT_STORAGE_KEY } from "../analytics/consent";

test("declined analytics still delivers scan IDs for authenticated app activity without browser tracking IDs", async () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const originalFetch = globalThis.fetch;
  const scanId = "bbbfc77a-a9b2-48a2-8afe-e5f0b1f2eb1c";
  const requests: Array<{ body: Record<string, unknown>; headers: Record<string, string> }> = [];
  let writes = 0;
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    localStorage: { getItem: (key: string) => key === ANALYTICS_CONSENT_STORAGE_KEY ? "denied" : null, setItem: () => { writes++; } },
    location: { pathname: `/app/scans/${scanId}`, search: "?utm_source=secret" }, innerWidth: 1200,
  } });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { language: "de" } });
  globalThis.fetch = async (_url, init) => {
    requests.push({ body: JSON.parse(String(init?.body)), headers: init?.headers as Record<string, string> });
    return new Response(null, { status: 201 });
  };
  try {
    trackProductEvent({ eventName: "scan_viewed", category: "scan", feature: "route", outcome: "observed" });
    trackProductEvent({ eventName: "page_viewed", category: "navigation", feature: "route", outcome: "observed", route: `/scans/${scanId}` });
    assert.equal(requests[0]?.body.scanId, scanId);
    assert.equal(requests[0]?.headers["x-certscore-analytics-consent"], "denied");
    assert.ok(requests[0]?.body.eventId);
    assert.equal(requests[1]?.body.scanId, undefined);
    for (const key of ["actorId", "sessionId", "campaignSource"]) assert.equal(requests[0]?.body[key], undefined);
    assert.equal(writes, 0);
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow); else Reflect.deleteProperty(globalThis, "window");
    if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator); else Reflect.deleteProperty(globalThis, "navigator");
    globalThis.fetch = originalFetch;
  }
});


test("delivery retries reuse the original event UUID and body", async () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const originalFetch = globalThis.fetch;
  const bodies: string[] = [];
  let delivered!: () => void;
  const complete = new Promise<void>((resolve) => { delivered = resolve; });
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    localStorage: { getItem: () => "denied" },
    location: { pathname: "/app", search: "" }, innerWidth: 1200,
    setTimeout: (callback: () => void) => { callback(); return 0; },
  } });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { language: "en" } });
  globalThis.fetch = async (_url, init) => {
    bodies.push(String(init?.body));
    if (bodies.length === 1) return new Response(null, { status: 503 });
    delivered();
    return new Response(null, { status: 201 });
  };
  try {
    trackProductEvent({ eventName: "action_clicked", category: "interaction", feature: "ui_control", outcome: "observed" });
    await complete;
    assert.equal(bodies.length, 2);
    assert.equal(bodies[0], bodies[1]);
    assert.match(JSON.parse(bodies[0]!).eventId, /^[0-9a-f-]{36}$/);
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow); else Reflect.deleteProperty(globalThis, "window");
    if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator); else Reflect.deleteProperty(globalThis, "navigator");
    globalThis.fetch = originalFetch;
  }
});
