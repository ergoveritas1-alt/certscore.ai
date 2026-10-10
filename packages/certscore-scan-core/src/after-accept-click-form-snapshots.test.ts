import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { postAcceptEvidencePacketSchema, postAcceptReportProjectionSchema, projectPostAcceptEvidenceForReport } from "@certscore/contracts";
import { CERTSCORE_OWNED_ANALYTICS_ACCEPT_RECIPE } from "./post-accept-cmp-recipes.js";
import { runPostAcceptObserver } from "./post-accept-observer.js";
import { startAfterAcceptClickFormSnapshots } from "./post-accept-form-snapshots.js";
import { projectPostAcceptForms } from "../../../apps/web/lib/scans/post-accept-form-projection.js";
import { observedControlAssessment } from "../../../apps/web/lib/scans/test-fixtures/observed-control-assessment.js";
import { verifiedPostAcceptFormSnapshotForRow } from "../../../apps/web/server/scans/form-snapshot-evidence.js";
import { buildReportDisplayExport } from "../../../apps/web/lib/api-v2/report-display-export.js";

async function fixture(run: (url: string, counts: { submissions: number }) => Promise<void>) {
  const counts = { submissions: 0 };
  const server = createServer((request, response) => {
    if (request.method === "POST") counts.submissions++;
    response.setHeader("Content-Type", "text/html");
    response.end(`<section aria-label="Cookie and analytics preferences"><p>We use cookies for analytics.</p>
      <button data-certscore-consent-action="accept">Accept</button></section><script>
      document.querySelector('button').onclick=()=>{
        document.querySelector('section').remove();
        // The click completes, but the CMP never confirms a consent decision.
        document.body.insertAdjacentHTML('beforeend',
          '<form method="post" action="/contact"><h2>Contact</h2><label>Name<input name="name" value="private-entered-value"></label><label>Email<input name="email" type="email"></label><p>See our <a href="/privacy">Privacy notice</a></p></form>'+
          '<form method="post" action="/subscribe"><h2>Newsletter</h2><label>Business email<input name="email" type="email"></label></form>'+
          '<form method="post" action="/third"><label>Third form<input name="third"></label></form>');
      };</script>`);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  try { await run(`http://127.0.0.1:${address.port}/`, counts); }
  finally { await new Promise<void>(resolve => server.close(() => resolve())); }
}

test("completed unconfirmed Accept captures two reviewed form images inside the original dispatch window", async () => {
  await fixture(async (url, counts) => {
    let reviews = 0;
    const packet = await runPostAcceptObserver({ url, scanId: "unconfirmed-images", parentScanId: "unconfirmed-images-parent",
      interactionAuthorization: { authorizationId: "loopback_local_lab", kind: "loopback" },
      recipe: CERTSCORE_OWNED_ANALYTICS_ACCEPT_RECIPE, actionSearchTimeoutMs: 500, confirmationTimeoutMs: 2000,
      observationWindowMs: 3000, productionProjectable: true,
      formSnapshotReviewer: async ({ bytes }) => { reviews++; assert.ok(bytes.length > 0); return { safeForDisplay: true }; },
    });
    assert.equal(packet.acceptanceRegistration.status, "unconfirmed");
    assert.equal(packet.acceptanceRegistration.acceptanceExercised, false);
    assert.equal(packet.productionProjectable, false);
    assert.deepEqual(packet.observations, []);
    const images = packet.formSnapshotCapture; assert.ok(images);
    assert.equal(images.contractVersion, "certscore.post_accept_form_snapshots.v7");
    if (images.contractVersion !== "certscore.post_accept_form_snapshots.v7") return;
    assert.equal(images.phase, "after_accept_click");
    assert.equal(images.acceptanceRegisteredAtMs, undefined);
    assert.equal(images.lateForm, undefined);
    assert.equal(images.snapshots.length, 2);
    assert.equal(images.snapshots.filter(image => image.status === "available").length, 2);
    assert.equal(reviews, 2);
    assert.ok(images.captureDeadlineAtMs <= images.actionDispatchedAtMs + 3000);
    assert.ok(images.capturedAtMs <= images.captureDeadlineAtMs);
    assert.ok(images.snapshots.every(image => image.valuesMasked));
    assert.equal(counts.submissions, 0);
    assert.equal(JSON.stringify(images.inventory).includes("private-entered-value"), false);
    assert.ok(images.inventory.forms[0]?.privacyDisclosure?.excerpts.length);
    const projection = projectPostAcceptEvidenceForReport({ packet, packetSha256: "a".repeat(64) });
    assert.equal(projection.registrationStatus, "unconfirmed");
    assert.equal(projection.acceptanceRegisteredAtMs, undefined);
    assert.equal(projection.formSnapshotCapture?.phase, "after_accept_click");
    assert.deepEqual(projection.postAcceptActivity, []);
    assert.ok(projection.formSnapshotCapture?.snapshots.every(image => !("data" in image)));
    assert.equal(projectPostAcceptEvidenceForReport({ packet }).formSnapshotCapture, undefined);
    const reportScanId = "9ba99a8c-b1ad-44c1-985f-92cef760ab40";
    const assessment = {...observedControlAssessment,scan:{...observedControlAssessment.scan,scanId:reportScanId}};
    const rows = projectPostAcceptForms({consentControlAssessment:assessment,postAcceptEvidenceProjection:projection}).rows;
    assert.equal(rows.length,2);
    for(const [index,row] of rows.entries()) {
      assert.equal(row.capturePhase,"after_accept_click");
      assert.equal(row.snapshot.status,"available");
      assert.deepEqual(verifiedPostAcceptFormSnapshotForRow(packet,row),Buffer.from(images.snapshots[index]!.data!,"base64"));
      assert.equal(verifiedPostAcceptFormSnapshotForRow(packet,{...row,form:{...row.form,title:"Changed form"}}),null);
      assert.equal(verifiedPostAcceptFormSnapshotForRow(packet,{...row,captureProvenance:{...row.captureProvenance!,capturedAtMs:0}}),null);
    }
    const api = buildReportDisplayExport({scan:{id:reportScanId},collectionTableRows:rows}) as {collectionTableRows:typeof rows};
    for(const row of api.collectionTableRows) {
      assert.equal(row.capturePhase,"after_accept_click");
      assert.ok(row.snapshot.status==="available" && row.snapshot.url.includes("/api/v2/scans/"));
      assert.deepEqual(row.form.fields,rows.find(original=>original.id===row.id)!.form.fields);
    }
    for (const change of [
      { acceptanceRegisteredAtMs: images.actionDispatchedAtMs },
      { captureDeadlineAtMs: images.actionDispatchedAtMs + 3001 },
      { capturedAtMs: images.captureDeadlineAtMs + 1 },
      { exactTargetSha256: "b".repeat(64) },
    ]) assert.equal(postAcceptEvidencePacketSchema.safeParse({ ...packet, formSnapshotCapture: { ...images, ...change } }).success, false);
    assert.equal(postAcceptReportProjectionSchema.safeParse({ ...projection, afterActionCapture: undefined }).success, false);
    assert.equal(postAcceptReportProjectionSchema.safeParse({ ...projection, packetSha256: undefined }).success, false);
    if (process.env.AFTER_CLICK_FORM_ARTIFACT_DIR) {
      const directory = process.env.AFTER_CLICK_FORM_ARTIFACT_DIR;
      await mkdir(directory, { recursive: true });
      await writeFile(`${directory}/packet.json`, JSON.stringify(packet));
      await writeFile(`${directory}/projection.json`, JSON.stringify(projection));
      for (const [index, image] of images.snapshots.entries()) {
        if (image.status === "available") await writeFile(`${directory}/form-${index}.jpg`, Buffer.from(image.data!, "base64"));
      }
    }
  });
});

test("unconfirmed Accept images fail closed when safety review withholds them", async () => {
  await fixture(async (url, counts) => {
    let reviews = 0;
    const packet = await runPostAcceptObserver({ url, scanId: "unconfirmed-withheld",
      interactionAuthorization: { authorizationId: "loopback_local_lab", kind: "loopback" },
      recipe: CERTSCORE_OWNED_ANALYTICS_ACCEPT_RECIPE, actionSearchTimeoutMs: 500, confirmationTimeoutMs: 100,
      observationWindowMs: 3000, formSnapshotReviewer: async () => { reviews++; return { safeForDisplay: false }; },
    });
    assert.equal(packet.acceptanceRegistration.status, "unconfirmed");
    assert.equal(reviews, 2);
    assert.equal(packet.formSnapshotCapture?.snapshots.length, 2);
    assert.ok(packet.formSnapshotCapture?.snapshots.every(image => image.status === "withheld" && image.data === undefined));
    assert.equal(counts.submissions, 0);
  });
});

test("click-only image work cannot extend its deadline or survive document navigation", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto("about:blank");
    const started = Date.now();
    const handle = startAfterAcceptClickFormSnapshots({ page, exactTargetUrl: "about:blank", parentScanStartedAtMs: started,
      actionDispatchedAtMs: 0, deadlineAtMs: started + 350, reviewer: async () => ({ safeForDisplay: true }) });
    await page.goto("data:text/html,<form><input name=email></form>");
    assert.equal(await handle.finish(), undefined);
    assert.ok(Date.now() - started < 1500);
  } finally { await browser.close(); }
});

test("a slow safety reviewer cannot delay the original click-only capture deadline or expose pixels",async()=>{
  await fixture(async(url,counts)=>{
    const browser=await chromium.launch({headless:true});
    try {
      const page=await browser.newPage();await page.goto(url);await page.locator('button').click();
      const started=Date.now();
      const handle=startAfterAcceptClickFormSnapshots({page,exactTargetUrl:url,parentScanStartedAtMs:started,
        actionDispatchedAtMs:0,deadlineAtMs:started+500,reviewer:async()=>new Promise(()=>{})});
      await new Promise(resolve=>setTimeout(resolve,510));
      const images=await handle.finish();
      assert.ok(Date.now()-started<1000);
      assert.ok(images);
      assert.equal(images.contractVersion,'certscore.post_accept_form_snapshots.v7');
      assert.ok(images.snapshots.every(image=>image.status!=='available' && image.data===undefined));
      assert.equal(counts.submissions,0);
    } finally {await browser.close();}
  });
});
