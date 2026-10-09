import assert from "node:assert/strict";
import test from "node:test";
import { actionCaptureCoverageSchema } from "@certscore/contracts";
import { classifyActionRequestRetention, createActionRequestRetention } from "./action-request-retention.js";

const row = (url: string, resourceType = "image", id = url) => ({ id, request: { url: () => url, resourceType: () => resourceType } });
test("priority uses canonical attribution rather than image type or file extension", () => {
  assert.equal(classifyActionRequestRetention("https://images.ctfassets.net/x.png", "image").kind, "delivery_asset");
  assert.equal(classifyActionRequestRetention("https://www.google-analytics.com/collect", "image").kind, "tracking");
  assert.equal(classifyActionRequestRetention("https://unknown.test/image.png", "image").kind, "unknown");
  assert.equal(classifyActionRequestRetention("not a URL", "image").kind, "unknown");
  assert.equal(classifyActionRequestRetention("https://images.ctfassets.net/", "document").kind, "document");
});

test("late tracking pixel and unknown request displace known CDN assets within the same cap", () => {
  const rows: ReturnType<typeof row>[] = [], capture = createActionRequestRetention(rows, 3);
  for (let i = 0; i < 3; i++) capture.offer(row(`https://images.ctfassets.net/${i}.png`));
  capture.offer(row("https://www.google-analytics.com/collect"));
  capture.offer(row("https://unknown.test/pixel.gif"));
  assert.equal(rows.length, 3);
  assert.ok(rows.some(x => x.id.includes("google-analytics")));
  assert.ok(rows.some(x => x.id.includes("unknown.test")));
  assert.deepEqual(capture.summary(), { policyVersion: "priority_bounded_action_requests.v1", requestsObserved: 5,
    requestsRetained: 3, replacements: 2, priorityEvaluations: 2, omitted: { delivery_asset: 2, known_other: 0, unknown: 0, tracking: 0, consent: 0, document: 0, unclassified: 0 } });
  assert.ok(actionCaptureCoverageSchema.safeParse({ requestsDroppedBeforeAction: 0, requestsDroppedAfterAction: 2,
    postActionRetention: capture.summary() }).success);
});

test("unknown images are never evicted for same-priority or lower-priority arrivals", () => {
  const rows: ReturnType<typeof row>[] = [], capture = createActionRequestRetention(rows, 2);
  capture.offer(row("https://unknown.test/a.png")); capture.offer(row("https://unknown.test/b.png"));
  assert.equal(capture.offer(row("https://images.ctfassets.net/x.png")).retained, false);
  assert.equal(capture.offer(row("https://www.google-analytics.com/collect")).retained, false);
  assert.deepEqual(rows.map(x => x.id), ["https://unknown.test/a.png", "https://unknown.test/b.png"]);
  assert.equal(capture.summary()?.omitted.tracking, 1);
});

test("a new tracking host displaces a repeated tracker, preserving the earliest request", () => {
  const rows: ReturnType<typeof row>[] = [], capture = createActionRequestRetention(rows, 3);
  for (let i = 0; i < 3; i++) capture.offer(row("https://www.google-analytics.com/collect", "ping", String(i)));
  const incoming = row("https://bat.bing.com/action/0", "image");
  const result = capture.offer(incoming);
  assert.equal(result.evicted?.id, "2");
  assert.deepEqual(rows.map(x => x.id), ["0", "1", incoming.id]);
  assert.equal(capture.summary()?.omitted.tracking, 1);
});

test("new unknown host gets a sample before repeated known tracker traffic", () => {
  const rows: ReturnType<typeof row>[] = [], capture = createActionRequestRetention(rows, 2);
  capture.offer(row("https://www.google-analytics.com/collect", "ping", "first"));
  capture.offer(row("https://www.google-analytics.com/collect", "ping", "second"));
  capture.offer(row("https://unknown.test/event", "fetch"));
  assert.deepEqual(rows.map(x => x.id), ["first", "https://unknown.test/event"]);
});

test("without overflow selection and metadata remain unchanged", () => {
  const rows: ReturnType<typeof row>[] = [], capture = createActionRequestRetention(rows, 192);
  const first = row("https://unknown.test/a"); capture.offer(first);
  assert.equal(rows[0], first); assert.equal(capture.summary(), undefined);
  assert.ok(actionCaptureCoverageSchema.safeParse({ requestsDroppedBeforeAction: 1, requestsDroppedAfterAction: 0 }).success);
});

test("summary cannot conceal loss, inflate observed count or exceed the existing cap", () => {
  const rows: ReturnType<typeof row>[] = [], capture = createActionRequestRetention(rows, 1);
  capture.offer(row("https://unknown.test/a")); capture.offer(row("https://unknown.test/b"));
  const summary = capture.summary()!;
  for (const postActionRetention of [{ ...summary, requestsObserved: 99 }, { ...summary, replacements: 2 },
    { ...summary, requestsRetained: 193 }]) {
    assert.equal(actionCaptureCoverageSchema.safeParse({ requestsDroppedBeforeAction: 0, requestsDroppedAfterAction: 1, postActionRetention }).success, false);
  }
  assert.equal(actionCaptureCoverageSchema.safeParse({ requestsDroppedBeforeAction: 0, requestsDroppedAfterAction: 0, postActionRetention: summary }).success, false);
});


test("a full unknown inventory remains protected; a late tracker is explicitly omitted", () => {
  const rows: ReturnType<typeof row>[] = [], capture = createActionRequestRetention(rows, 192);
  for (let i = 0; i < 192; i++) capture.offer(row(`https://unknown-${i}.test/pixel.gif`));
  assert.equal(capture.offer(row("https://www.google-analytics.com/collect")).retained, false);
  assert.equal(capture.summary()?.omitted.tracking, 1);
  assert.equal(rows.length, 192);
});

test("priority CPU work stops at its fixed bound without concealing further loss", () => {
  const rows: ReturnType<typeof row>[] = [], capture = createActionRequestRetention(rows, 192);
  for (let i = 0; i < 1000; i++) capture.offer(row(`https://images.ctfassets.net/${i}.png`));
  assert.equal(capture.summary()?.priorityEvaluations, 256);
  assert.equal(capture.summary()?.omitted.unclassified, 552);
  assert.equal(capture.summary()?.requestsObserved, 1000);
  assert.ok(actionCaptureCoverageSchema.safeParse({ requestsDroppedBeforeAction: 0, requestsDroppedAfterAction: 808, postActionRetention: capture.summary() }).success);
});
