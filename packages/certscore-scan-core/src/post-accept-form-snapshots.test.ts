import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { chromium } from "playwright";
import { startRegisteredPostAcceptFormSnapshots } from "./post-accept-form-snapshots.js";
import { capturePostAcceptFormInventory } from "./post-accept-form-inventory.js";
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
    assert.equal(images.contractVersion, "certscore.post_accept_form_snapshots.v1");
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

test("late form extends the Accept result budget once without extending consent observations", async () => {
  const server = createServer((_request, response) => {
    response.setHeader("Content-Type", "text/html");
    response.end(`<section aria-label="Cookie and analytics preferences"><p>We use analytics cookies.</p>
      <button data-certscore-consent-action="accept">Accept</button></section><script>
      document.querySelector('button').onclick=()=>{localStorage.setItem('certscore:analytics-consent:v1','granted');
        document.querySelector('section').remove();
        setTimeout(()=>document.body.insertAdjacentHTML('beforeend',
          '<form method="post"><label>Email<input type="email" name="email"></label></form>'),2450);};
      </script>`);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  try {
    const packet = await runPostAcceptObserver({ url: `http://127.0.0.1:${address.port}/`,
      scanId: "late-form-budget", parentScanId: "late-form-budget-parent",
      interactionAuthorization: { authorizationId: "loopback_local_lab", kind: "loopback" },
      recipe: CERTSCORE_OWNED_ANALYTICS_ACCEPT_RECIPE, actionSearchTimeoutMs: 500, confirmationTimeoutMs: 500,
      observationWindowMs: 3000, resultBudgetMs: 3200, productionProjectable: true,
      formSnapshotReviewer: async () => { await new Promise(resolve => setTimeout(resolve, 900)); return { safeForDisplay: true }; },
    });
    assert.equal(packet.acceptanceRegistration.status, "confirmed");
    assert.equal(packet.cancellation.requested, false);
    assert.ok(packet.timing.readyAtMs > 3200, "the late image should finish after the original result budget");
    assert.equal(packet.formSnapshotCapture?.contractVersion, "certscore.post_accept_form_snapshots.v4");
    assert.equal(packet.formSnapshotCapture?.snapshots[0]?.status, "available");
    assert.ok(postAcceptEvidencePacketSchema.safeParse(packet).success);
    const projection = projectPostAcceptEvidenceForReport({ packet, packetSha256: "a".repeat(64) });
    assert.equal(projection.formSnapshotCapture?.snapshots[0]?.status, "available");
    assert.equal(projection.observationWindowMs, 3000);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test("bounded post-Accept inventory retains live forms without page-wide evidence or field values", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.setContent(`<form class="cmp"><input name="consent"></form>
      <form action="https://forms.example.test/contact" method="post" aria-label="Contact">
        ${Array.from({ length: 8 }, (_, index) => `<label>Field ${index}<input name="field-${index}" value="private-${index}"></label>`).join("")}
      </form><form action="https://forms.example.test/newsletter" method="post" aria-label="Newsletter">
        <label>Email<input type="email" name="email" value="person@example.test"></label></form>`);
    const inventory = await capturePostAcceptFormInventory(page, Date.now(), [".cmp"]);
    assert.equal(inventory.forms.length, 2);
    assert.deepEqual(inventory.forms.map(form => form.fields.length), [8, 1]);
    assert.equal(inventory.forms[0]?.actionHostname, "forms.example.test");
    assert.equal(JSON.stringify(inventory).includes("private-"), false);
    assert.equal(JSON.stringify(inventory).includes("person@example.test"), false);
  } finally { await browser.close(); }
});

test("optional form images freeze without extending deadlines or retaining navigation-mismatched pixels", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  let extensionCalls = 0;
  try {
    await page.goto("about:blank");
    const handle = startRegisteredPostAcceptFormSnapshots({ page, exactTargetUrl: "about:blank", parentScanStartedAtMs: Date.now(),
      actionDispatchedAtMs: 0, acceptanceRegisteredAtMs: 0, deadlineAtMs: Date.now() + 100,
      reviewer: async () => ({safeForDisplay:true}), onLateFormDetected: () => { extensionCalls++; return Date.now() + 1500; } });
    const before = performance.now();
    assert.equal(await handle.finish(), undefined);
    assert.equal(extensionCalls, 0);
    assert.ok(performance.now() - before < 30);
    await page.setContent('<form><input name="email" type="email"></form>');
    await new Promise(resolve => setTimeout(resolve, 120));
    assert.equal(await handle.finish(), undefined);
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
    const result = await capture.finish();
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
        '<form><label>Email<input type="email" name="email"></label></form>'), 1700)</script>` }));
    await page.goto("https://fixture.test/");
    const startedAt = Date.now();
    const capture = startRegisteredPostAcceptFormSnapshots({ page, exactTargetUrl: page.url(),
      parentScanStartedAtMs: startedAt, actionDispatchedAtMs: 0, acceptanceRegisteredAtMs: 0,
      deadlineAtMs: startedAt + 3000, reviewer: async () => {
        await new Promise(resolve => setTimeout(resolve, 200));
        return { safeForDisplay: true };
      } });
    while (!capture.done() && Date.now() - startedAt < 3500) await new Promise(resolve => setTimeout(resolve, 25));
    assert.ok(sessionStartedAtMs - startedAt < 200, "document proof should overlap the field wait");
    assert.equal((await capture.finish())?.snapshots[0]?.status, "available");
    assert.equal(sessionCount, 1, "the screenshot should reuse its loader-bound document session");
  } finally {
    (context as any).newCDPSession = originalSession;
    await browser.close();
  }
});

test("late mounted SITS-shaped forms retain masked pixels inside the approved late window", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.route("https://fixture.test/**", route => route.fulfill({ contentType: "text/html", body: `
      <style>@keyframes float {from { transform:translateY(0) } to { transform:translateY(8px) }}
      .busy {animation:float 1s ease-in-out infinite alternate}</style>
      <div class="busy">Moving page content</div>
      <script>setTimeout(() => document.body.insertAdjacentHTML('beforeend',
        '<form action="https://forms-eu1.hsforms.com/contact" method="post" aria-label="Contact">'+
        Array.from({length:8},(_,i)=>'<label>Field '+i+'<input name="field-'+i+'" value="private-value"></label>').join('')+
        '</form><form action="https://forms-eu1.hsforms.com/newsletter" method="post" aria-label="Newsletter">'+
        '<label>Email<input type="email" name="email" value="secret@example.test"></label></form>'),2450)</script>` }));
    await page.goto("https://fixture.test/");
    const startedAt = Date.now();
    const capture = startRegisteredPostAcceptFormSnapshots({ page, exactTargetUrl: page.url(),
      parentScanStartedAtMs: startedAt, actionDispatchedAtMs: 0, acceptanceRegisteredAtMs: 0,
      deadlineAtMs: startedAt + 3000, reviewer: async () => ({ safeForDisplay: true }) });
    while (!capture.done() && Date.now() - startedAt < 3500) await new Promise(resolve => setTimeout(resolve, 10));
    const result = await capture.finish();
    assert.ok(result, "late forms should yield a document-bound capture");
    assert.equal(result.inventory.forms.length, 2);
    assert.equal(result.snapshots.filter(snapshot => snapshot.status === "available").length, 2);
    assert.ok(result.snapshots.every(snapshot => snapshot.status !== "available" || snapshot.data?.length));
    assert.ok(result.capturedAtMs <= 12500);
  } finally { await browser.close(); }
});

test("a late form gets one bounded extension while ordinary scans keep the original deadline", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const originalEvaluate = page.evaluate.bind(page);
  let extensionCalls = 0;
  try {
    await page.route("https://fixture.test/**", route => route.fulfill({ contentType: "text/html", body: `
      <script>setTimeout(() => document.body.insertAdjacentHTML('beforeend',
        '<form><label>Email<input type="email" name="email" value="private@example.test"></label></form>'),2450);
        setTimeout(() => document.querySelector('form')?.insertAdjacentHTML('beforeend',
        '<label>Name<input type="text" name="name"></label>'),3100)</script>` }));
    await page.goto("https://fixture.test/");
    let delayed = false;
    (page as any).evaluate = async (...args: any[]) => {
      if (!delayed && args[1] && typeof args[1] === "object" && "fields" in args[1]) {
        delayed = true;
        await new Promise(resolve => setTimeout(resolve, 650));
      }
      return (originalEvaluate as any)(...args);
    };
    const startedAt = Date.now();
    const capture = startRegisteredPostAcceptFormSnapshots({ page, exactTargetUrl: page.url(),
      parentScanStartedAtMs: startedAt, actionDispatchedAtMs: 0, acceptanceRegisteredAtMs: 0,
      deadlineAtMs: startedAt + 3000, reviewer: async () => ({ safeForDisplay: true }),
      onLateFormDetected: () => { extensionCalls++; return startedAt + 12500; } });
    await new Promise(resolve => setTimeout(resolve, 3050));
    const result = await capture.finish();
    assert.equal(extensionCalls, 1);
    assert.ok(result, "finish must preserve a detected form after the original deadline");
    assert.equal(result.contractVersion, "certscore.post_accept_form_snapshots.v5");
    assert.equal(result.inventory.forms[0]?.fields.length, 1, "the image binds to the first directly observed form state");
    assert.equal(result.postCaptureInventory.inventory.forms[0]?.fields.length, 2,
      "a later document-bound sample retains fields mounted after the screengrab");
    assert.equal(result.snapshots[0]?.status, "available");
    assert.ok(result.capturedAtMs > 3000 && result.capturedAtMs <= 12500);
    assert.equal(result.lateForm.extensionMs, 9500);
  } finally { (page as any).evaluate = originalEvaluate; await browser.close(); }
});

test("pixel proof stays in the Accept window while bounded safety review finishes afterward", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  let reviewStarted: (() => void) | undefined;
  const reviewing = new Promise<void>(resolve => { reviewStarted = resolve; });
  try {
    await page.route("https://fixture.test/**", route => route.fulfill({ contentType: "text/html",
      body: '<form><label>Email<input type="email" name="email" value="private@example.test"></label></form>' }));
    await page.goto("https://fixture.test/");
    const startedAt = Date.now();
    const deadlineAtMs = startedAt + 900;
    const capture = startRegisteredPostAcceptFormSnapshots({ page, exactTargetUrl: page.url(),
      parentScanStartedAtMs: startedAt, actionDispatchedAtMs: 0, acceptanceRegisteredAtMs: 0,
      deadlineAtMs, reviewer: async () => {
        reviewStarted!();
        await new Promise(resolve => setTimeout(resolve, 1100));
        return { safeForDisplay: true };
      } });
    await Promise.race([reviewing, new Promise<never>((_, reject) => setTimeout(() => reject(new Error("pixels were not captured before deadline")), 800))]);
    await new Promise(resolve => setTimeout(resolve, Math.max(0, deadlineAtMs - Date.now() + 20)));
    const result = await capture.finish();
    assert.ok(result, "approved pixels should survive the end of the browser window");
    assert.ok(result.capturedAtMs < 900, "packet time must reflect the browser proof, not late review");
    assert.equal(result.snapshots[0]?.status, "available");
    assert.ok(result.snapshots[0]?.data);
  } finally { await browser.close(); }
});

test("a timed-out second crop preserves the first document-proved screengrab", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const context = page.context();
  const originalSession = context.newCDPSession.bind(context);
  let captures = 0;
  (context as any).newCDPSession = async (...args: Parameters<typeof originalSession>) => {
    const session = await originalSession(...args);
    const originalSend = session.send.bind(session);
    (session as any).send = async (...sendArgs: Parameters<typeof originalSend>) => {
      if (sendArgs[0] === "Page.captureScreenshot" && ++captures === 2) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      return originalSend(...sendArgs);
    };
    return session;
  };
  try {
    await page.route("https://fixture.test/**", route => route.fulfill({ contentType: "text/html",
      body: '<form><label>Email<input type="email" name="email"></label></form><form><label>Name<input name="name"></label></form>' }));
    await page.goto("https://fixture.test/");
    const startedAt = Date.now();
    const capture = startRegisteredPostAcceptFormSnapshots({ page, exactTargetUrl: page.url(),
      parentScanStartedAtMs: startedAt, actionDispatchedAtMs: 0, acceptanceRegisteredAtMs: 0,
      deadlineAtMs: startedAt + 1600, reviewer: async () => ({ safeForDisplay: true }) });
    while (!capture.done() && Date.now() - startedAt < 1800) await new Promise(resolve => setTimeout(resolve, 25));
    const result = await capture.finish();
    assert.ok(result);
    assert.equal(captures, 2);
    assert.equal(result.snapshots[0]?.status, "available");
    assert.equal(result.snapshots[1]?.status, "unavailable");
    assert.ok(result.capturedAtMs < 1600);
  } finally { (context as any).newCDPSession = originalSession; await browser.close(); }
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
    assert.equal(await handle.finish(),undefined);
  } finally {release?.();await browser.close();}
});


test("After Accept inventory retains only form-associated privacy disclosures and sanitized links", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.route("https://form-notice.test/**", route => route.fulfill({contentType:"text/html",body:`
      <form class="cmp"><input name="consent"><p>Privacy CMP notice must be excluded.</p></form>
      <section><form aria-label="Contact"><label>Email<input name="email" value="private-entered-value"></label>
        <label><input type="checkbox">I agree to personal data processing to handle your request.
          <a href="/privacy?secret=query#private">Privacy policy</a></label>
        <textarea>private-message</textarea></form></section>
      <section><form aria-label="Newsletter"><input type="email" name="email"></form>
        <p>Personal data is used for newsletter subscriptions. <a href="/privacy">Privacy policy</a></p></section>
      <form aria-label="Unrelated"><input name="search"></form>
      <footer>Privacy footer must not be attributed.</footer>`}));
    await page.goto("https://form-notice.test/");
    const inventory = await capturePostAcceptFormInventory(page, Date.now(), [".cmp"]);
    const contact = inventory.forms.find(form => form.title === "Contact");
    const newsletter = inventory.forms.find(form => form.title === "Newsletter");
    assert.match(contact?.privacyDisclosure?.excerpts[0]?.text ?? "", /handle your request/);
    assert.equal(contact?.privacyDisclosure?.excerpts[0]?.links[0]?.url, "https://form-notice.test/privacy");
    assert.equal(newsletter?.privacyDisclosure?.excerpts[0]?.association, "adjacent_notice");
    assert.equal(inventory.forms.find(form => form.title === "Unrelated")?.privacyDisclosure, undefined);
    assert.doesNotMatch(JSON.stringify(inventory), /private-entered-value|private-message|secret=query|CMP notice|Privacy footer/);
    assert.ok(new TextEncoder().encode(JSON.stringify(inventory.forms.map(form=>form.privacyDisclosure).filter(Boolean))).length <= 1030);
  } finally { await browser.close(); }
});

test("a later second form receives its own reviewed inventory-bound image inside the existing window", async () => {
  const browser=await chromium.launch({headless:true}); const page=await browser.newPage();
  let reviews=0;
  try {
    await page.route("https://late-second.test/**",route=>route.fulfill({contentType:"text/html",body:`<script>
      setTimeout(()=>document.body.insertAdjacentHTML('beforeend','<form aria-label="Contact"><label>Email<input type="email" name="email"></label><p>Personal data is used for support.</p></form>'),2450);
      setTimeout(()=>document.body.insertAdjacentHTML('beforeend','<form aria-label="Newsletter"><label>Email<input type="email" name="newsletter" value="private@example.test"></label><p>Personal data is used for newsletters.</p></form>'),3300);
      </script>`}));
    await page.goto("https://late-second.test/"); const started=Date.now();
    const capture=startRegisteredPostAcceptFormSnapshots({page,exactTargetUrl:page.url(),parentScanStartedAtMs:started,
      actionDispatchedAtMs:0,acceptanceRegisteredAtMs:0,deadlineAtMs:started+3000,
      reviewer:async()=>{reviews++;await new Promise(resolve=>setTimeout(resolve,1100));return {safeForDisplay:true};}});
    await new Promise(resolve=>setTimeout(resolve,3050));const result=await capture.finish();
    assert.ok(result);assert.equal(result.contractVersion,"certscore.post_accept_form_snapshots.v6");
    assert.equal(result.inventory.forms.length,1);assert.equal(result.postCaptureInventory.inventory.forms.length,2);
    assert.equal(result.snapshots[0]?.status,"available");assert.equal(result.postCaptureSnapshots.snapshots[0]?.status,"available");
    assert.equal(result.postCaptureSnapshots.snapshots[0]?.formRef,"collection_form_1");
    assert.notEqual(result.postCaptureSnapshots.snapshots[0]?.sourceInventoryHash,result.snapshots[0]?.sourceInventoryHash);
    assert.ok(result.postCaptureSnapshots.capturedAtMs>=result.postCaptureInventory.capturedAtMs);
    assert.ok(result.postCaptureSnapshots.capturedAtMs<=12500);assert.equal(reviews,2);
    assert.match(result.postCaptureInventory.inventory.forms[1]?.privacyDisclosure?.excerpts[0]?.text??"",/newsletters/);
    assert.doesNotMatch(JSON.stringify(result.postCaptureInventory.inventory),/private@example/);
  }finally{await browser.close();}
});
