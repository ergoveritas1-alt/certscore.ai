import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { chromium } from "playwright";
import { startRegisteredPostAcceptFormSnapshots } from "./post-accept-form-snapshots.js";
import { runPostAcceptObserver } from "./post-accept-observer.js";
import { CERTSCORE_OWNED_ANALYTICS_ACCEPT_RECIPE } from "./post-accept-cmp-recipes.js";
import { projectPostAcceptEvidenceForReport, postAcceptEvidencePacketSchema } from "@certscore/contracts";

test("registered Accept captures two delayed forms, masks entered values, and projects metadata without bytes", async () => {
  let submissions = 0;
  const server = createServer((request, response) => {
    if (request.method === "POST") submissions++;
    response.setHeader("Content-Type", "text/html");
    response.end(`<section aria-label="Cookie and analytics preferences"><p>We use cookies for analytics.</p>
      <button data-certscore-consent-action="accept">Accept</button></section><script>
      document.querySelector('button').onclick=()=>{localStorage.setItem('certscore:analytics-consent:v1','granted');
        document.cookie='_ga=afteraccept;path=/';document.querySelector('section').remove();
        setTimeout(()=>document.body.insertAdjacentHTML('beforeend',
        '<form action="/submit" method="post" aria-label="Contact"><label>Name<input name="name" value="entered-secret"></label>'+
        '<label>Email<input name="email" type="email"></label></form>'+
        '<form action="/subscribe" method="post" aria-label="Newsletter"><input name="email" type="email"></form>'),650);};
      </script>`);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}/`;
  try {
    const packet = await runPostAcceptObserver({ url, scanId: "image-fixture", parentScanId: "image-fixture-parent",
      interactionAuthorization: { authorizationId: "loopback_local_lab", kind: "loopback" },
      recipe: CERTSCORE_OWNED_ANALYTICS_ACCEPT_RECIPE, actionSearchTimeoutMs: 500, confirmationTimeoutMs: 500,
      observationWindowMs: 3000, productionProjectable: true,
      formSnapshotReviewer: async () => ({ safeForDisplay: true }),
    });
    assert.equal(packet.acceptanceRegistration.status, "confirmed");
    const images = packet.formSnapshotCapture; assert.ok(images);
    assert.equal(images.inventory.sourceLane, "accept_observation");
    assert.equal(images.phase, "after_accept");
    assert.equal(images.snapshots.filter(snapshot => snapshot.status === "available").length, 2);
    assert.ok(images.capturedAtMs <= images.acceptanceRegisteredAtMs + packet.observationWindowMs);
    assert.equal(JSON.stringify(images.inventory).includes("entered-secret"), false);
    assert.equal(submissions, 0);
    assert.ok(postAcceptEvidencePacketSchema.safeParse(packet).success);
    const projection = projectPostAcceptEvidenceForReport({ packet, packetSha256: "a".repeat(64) });
    assert.equal(projection.formSnapshotCapture?.snapshots.length, 2);
    assert.ok(projection.formSnapshotCapture?.snapshots.every(snapshot => !("data" in snapshot)));
    assert.equal(projectPostAcceptEvidenceForReport({ packet }).formSnapshotCapture, undefined);
    assert.equal(postAcceptEvidencePacketSchema.safeParse({ ...packet, formSnapshotCapture: { ...images, exactTargetSha256: "b".repeat(64) } }).success, false);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test("optional form images freeze without extending deadlines or retaining navigation-mismatched pixels", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.goto("about:blank");
    const handle = startRegisteredPostAcceptFormSnapshots({ page, exactTargetUrl: "about:blank", parentScanStartedAtMs: Date.now(),
      actionDispatchedAtMs: 0, acceptanceRegisteredAtMs: 0, deadlineAtMs: Date.now() + 100,
      reviewer: async () => ({safeForDisplay:true}) });
    const before = performance.now();
    assert.equal(handle.finish(), undefined);
    assert.ok(performance.now() - before < 30);
    await page.setContent('<form><input name="email" type="email"></form>');
    await new Promise(resolve => setTimeout(resolve, 120));
    assert.equal(handle.finish(), undefined);
  } finally { await browser.close(); }
});

test("registered form discovery tolerates layout animation while retained fields remain stable", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.route("https://fixture.test/**", route => route.fulfill({ contentType: "text/html", body: `
      <style>@keyframes move { from { transform: translateY(0); } to { transform: translateY(80px); } }
      form { animation: move 1s linear infinite alternate; width: 400px; padding: 20px; }</style>
      <form><label>Email<input type="email" name="email"></label></form>` }));
    await page.goto("https://fixture.test/");
    const startedAt = Date.now();
    const capture = startRegisteredPostAcceptFormSnapshots({ page, exactTargetUrl: page.url(),
      parentScanStartedAtMs: startedAt, actionDispatchedAtMs: 0, acceptanceRegisteredAtMs: 0,
      deadlineAtMs: startedAt + 3000, reviewer: async () => ({ safeForDisplay: true }) });
    while (!capture.done() && Date.now() - startedAt < 3500) await new Promise(resolve => setTimeout(resolve, 25));
    const result = capture.finish();
    assert.ok(result, "visible fields must not wait for unrelated layout stability");
    assert.equal(result.snapshots[0]?.status, "available");
    assert.ok(result.capturedAtMs <= 3000);
  } finally { await browser.close(); }
});

test("document proof starts while independently mounted fields settle", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const context = page.context();
  const originalSession = context.newCDPSession.bind(context);
  let sessionStartedAtMs = 0;
  let sessionCount = 0;
  (context as any).newCDPSession = async (...args: Parameters<typeof originalSession>) => {
    sessionStartedAtMs ||= Date.now();
    sessionCount++;
    await new Promise(resolve => setTimeout(resolve, 500));
    return originalSession(...args);
  };
  try {
    await page.route("https://fixture.test/**", route => route.fulfill({ contentType: "text/html", body: `
      <script>setTimeout(() => document.body.insertAdjacentHTML('beforeend',
        '<form><label>Email<input type="email" name="email"></label></form>'), 650)</script>` }));
    await page.goto("https://fixture.test/");
    const startedAt = Date.now();
    const capture = startRegisteredPostAcceptFormSnapshots({ page, exactTargetUrl: page.url(),
      parentScanStartedAtMs: startedAt, actionDispatchedAtMs: 0, acceptanceRegisteredAtMs: 0,
      deadlineAtMs: startedAt + 3000, reviewer: async () => ({ safeForDisplay: true }) });
    while (!capture.done() && Date.now() - startedAt < 3500) await new Promise(resolve => setTimeout(resolve, 25));
    assert.ok(sessionStartedAtMs - startedAt < 200, "document proof should overlap the field wait");
    assert.equal(capture.finish()?.snapshots[0]?.status, "available");
    assert.equal(sessionCount, 1, "the screenshot should reuse its loader-bound document session");
  } finally {
    (context as any).newCDPSession = originalSession;
    await browser.close();
  }
});

test("navigation during image review discards all prior-document form pixels", async () => {
  const browser = await chromium.launch({headless:true});
  const page = await browser.newPage();
  let release: (() => void) | undefined;
  let reviewed: (() => void) | undefined;
  const startedReview = new Promise<void>(resolve => { reviewed = resolve; });
  const reviewGate = new Promise<void>(resolve => { release = resolve; });
  try {
    await page.route("https://fixture.test/**", route => route.fulfill({contentType:"text/html",body:'<form><label>Email<input type="email" name="email"></label></form>'}));
    await page.goto("https://fixture.test/");
    const handle = startRegisteredPostAcceptFormSnapshots({page,exactTargetUrl:page.url(),parentScanStartedAtMs:Date.now(),actionDispatchedAtMs:0,acceptanceRegisteredAtMs:0,deadlineAtMs:Date.now()+3000,
      reviewer:async()=>{reviewed!();await reviewGate;return {safeForDisplay:true};}});
    await Promise.race([startedReview,new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error("review did not start")),2000))]);
    await page.goto("https://fixture.test/changed");
    release!();
    assert.equal(handle.finish(),undefined);
  } finally {release?.();await browser.close();}
});
