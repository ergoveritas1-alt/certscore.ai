import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import sharp from "sharp";
import { buildCollectionSurfaceInventory } from "./collection-surface-inventory";
import { captureCollectionSurfaceSnapshots, FORM_SNAPSHOT_BUDGET_MS } from "./collection-surface-snapshots";

test("default text inputs bind for current and legacy inventories but changed types fail closed",async()=>{
  const browser=await chromium.launch({headless:true});const page=await browser.newPage();
  try {
    await page.setContent('<form><label>Name<input value="private-name"></label></form>');
    for (const inputType of ['text','input']) {
      const inventory=buildCollectionSurfaceInventory({pageUrl:'about:blank',inspectedFieldCandidateCount:1,
        candidateScanTruncated:false,rows:[{groupKey:'0',structure:'native_form',elementType:'input',inputType,
          label:'Name',required:false,disabled:false,readOnly:false,domOrder:0}]},Date.now());
      const images=await captureCollectionSurfaceSnapshots(page,inventory,async()=>({safeForDisplay:true}));
      assert.equal(images[0]?.status,'available');
      await page.locator('input').evaluate(node=>{(node as HTMLInputElement).type='email';});
      const changed=await captureCollectionSurfaceSnapshots(page,inventory,async()=>{throw new Error('Changed control must not reach review');});
      assert.equal(changed[0]?.reason,'control_binding_changed');
      assert.equal(changed[0]?.data,undefined);
      await page.locator('input').evaluate(node=>node.removeAttribute('type'));
    }
  } finally {await browser.close();}
});

test("form crops retain binding, mask inputs, resize, and fail closed on unsafe or mismatched documents", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  try {
    await page.setContent('<form style="width:1000px;height:300px;background:white"><label>Email<input type="email" value="private@example.test" style="display:block;width:400px;height:80px"></label></form>');
    const inventory = buildCollectionSurfaceInventory({ pageUrl: "about:blank", inspectedFieldCandidateCount: 1, candidateScanTruncated: false, rows: [{ groupKey: "native_form_0", structure: "native_form", elementType: "input", inputType: "email", label: "Email", required: false, disabled: false, readOnly: false, domOrder: 0 }] }, Date.now());
    let reviewed = 0;
    const timings: Array<{stage:string; durationMs:number}> = [];
    const snapshots = await captureCollectionSurfaceSnapshots(page, inventory, async ({ bytes }) => {
      reviewed++;
      const metadata = await sharp(bytes).metadata();
      assert.equal(metadata.width, 640); assert.ok(metadata.height! <= 960);
      return { safeForDisplay: true };
    }, undefined, undefined, undefined, { onCaptureTiming: (stage, durationMs) => timings.push({stage, durationMs}) });
    assert.equal(reviewed, 1);
    assert.equal(snapshots[0]?.status, "available");
    assert.equal(snapshots[0]?.formRef, inventory.forms[0]?.formRef);
    assert.deepEqual(timings.map(timing => timing.stage), ["bind_controls", "masked_pixels", "image_processing", "safety_review"]);
    assert.ok(timings.every(timing => Number.isInteger(timing.durationMs) && timing.durationMs >= 0));
    assert.ok(snapshots[0]?.data);
    assert.ok(snapshots[0]!.sizeBytes! < 96 * 1024);
    const pixels = await sharp(Buffer.from(snapshots[0]!.data!, "base64")).raw().toBuffer({ resolveWithObject: true });
    // The center of the input is covered with the prescribed neutral mask.
    const offset = (40 * pixels.info.width + 100) * pixels.info.channels;
    assert.ok(Math.abs(pixels.data[offset]! - 148) < 8);
    assert.ok(Math.abs(pixels.data[offset + 1]! - 163) < 8);
    assert.ok(Math.abs(pixels.data[offset + 2]! - 184) < 8);
    const withheld = await captureCollectionSurfaceSnapshots(page, inventory, async () => ({ safeForDisplay: false }));
    assert.equal(withheld[0]?.status, "withheld"); assert.equal(withheld[0]?.data, undefined);
    const failed = await captureCollectionSurfaceSnapshots(page, inventory, async () => { throw new Error("Review unavailable"); });
    assert.equal(failed[0]?.status, "unavailable"); assert.equal(failed[0]?.data, undefined);
    const mismatch = await captureCollectionSurfaceSnapshots(page, { ...inventory, pageUrl: "https://different.test" }, async () => { throw new Error("Must not review mismatched document"); });
    assert.equal(mismatch[0]?.status, "unavailable");
    await page.setContent('<section><label>Email<input type="email" style="width:200px;height:40px"></label></section>');
    const standalone = { ...inventory, forms: inventory.forms.map(form => ({ ...form, structure: "unassociated_controls" as const })) };
    assert.equal((await captureCollectionSurfaceSnapshots(page, standalone, async () => ({ safeForDisplay: true })))[0]?.status, "available");
    await page.setContent('<form id="contact"><p>Contact</p></form><label>Email<input form="contact" type="email" style="width:200px;height:40px"></label>');
    assert.equal((await captureCollectionSurfaceSnapshots(page, inventory, async () => ({ safeForDisplay: true })))[0]?.status, "available");
  } finally { await browser.close(); }
});

test("animated forms capture within the existing budget and stalled review terminates with a retained reason", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.setContent('<style>@keyframes move{from{transform:translateX(0)}to{transform:translateX(80px)}}form{animation:move 10s infinite alternate;width:300px;height:100px;background:white}</style><form><label>Search<input type="text"></label></form>');
    const inventory = buildCollectionSurfaceInventory({ pageUrl: "about:blank", inspectedFieldCandidateCount: 1, candidateScanTruncated: false, rows: [{ groupKey: "native_form_0", structure: "native_form", elementType: "input", inputType: "text", label: "Search", required: false, disabled: false, readOnly: false, domOrder: 0 }] }, Date.now());
    assert.equal((await captureCollectionSurfaceSnapshots(page, inventory, async () => ({ safeForDisplay: true })))[0]?.status, "available");
    const started = Date.now();
    const stalled = await captureCollectionSurfaceSnapshots(page, inventory, () => new Promise(() => {}));
    assert.ok(["review_timed_out", "capture_budget_exhausted"].includes(stalled[0]?.reason ?? ""));
    assert.equal(stalled[0]?.data, undefined);
    assert.ok(Date.now() - started < FORM_SNAPSHOT_BUDGET_MS + 1500, "review must not hang beyond the shared budget plus scheduling tolerance");
    await page.locator('form').evaluate(el => (el as HTMLElement).style.display = 'none');
    const hidden = await captureCollectionSurfaceSnapshots(page, inventory, async () => { throw new Error('must not review'); });
    assert.equal(hidden[0]?.reason, "form_not_visible");
    const controller = new AbortController(); controller.abort();
    assert.equal((await captureCollectionSurfaceSnapshots(page, inventory, async () => ({ safeForDisplay: true }), controller.signal))[0]?.reason, "capture_cancelled");
  } finally { await browser.close(); }
});

test("pending animation readiness cannot consume the masked screenshot window", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.setContent('<form style="width:320px;height:120px"><label>Email<input type="email" name="email" value="private@example.test"></label></form>');
    await page.evaluate(() => {
      const animation = {
        playState: "running",
        ready: new Promise(() => {}),
        pause() { this.playState = "paused"; },
        play() { this.playState = "running"; },
      };
      document.getAnimations = () => { throw new Error("page-wide animation inventory must not run"); };
      document.querySelector("form")!.getAnimations = () => [animation as unknown as Animation];
    });
    const inventory = buildCollectionSurfaceInventory({ pageUrl: "about:blank", inspectedFieldCandidateCount: 1, candidateScanTruncated: false,
      rows: [{ groupKey: "native_form_0", structure: "native_form", elementType: "input", inputType: "email", label: "Email", required: false, disabled: false, readOnly: false, domOrder: 0 }] }, Date.now());
    const started = Date.now();
    const result = await captureCollectionSurfaceSnapshots(page, inventory, async () => ({ safeForDisplay: true }), undefined, undefined, started + 750);
    assert.equal(result[0]?.status, "available");
    assert.ok(Date.now() - started < 750);
  } finally { await browser.close(); }
});

test("a slow second review preserves the first safety-approved screengrab", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.setContent('<form><label>Email<input type="email"></label></form><form><label>Name<input type="text"></label></form>');
    const inventory = buildCollectionSurfaceInventory({ pageUrl: "about:blank", inspectedFieldCandidateCount: 2, candidateScanTruncated: false, rows: [
      { groupKey: "first", structure: "native_form", elementType: "input", inputType: "email", label: "Email", required: false, disabled: false, readOnly: false, domOrder: 0 },
      { groupKey: "second", structure: "native_form", elementType: "input", inputType: "text", label: "Name", required: false, disabled: false, readOnly: false, domOrder: 1 },
    ] }, Date.now());
    let reviews = 0;
    const result = await captureCollectionSurfaceSnapshots(page, inventory, () => {
      reviews++;
      return reviews === 1 ? Promise.resolve({ safeForDisplay: true }) : new Promise(() => {});
    }, undefined, undefined, Date.now() + 1800);
    assert.equal(result.length, 2);
    assert.equal(result[0]?.status, "available");
    assert.ok(result[0]?.data);
    assert.equal(result[1]?.status, "unavailable");
    assert.equal(result[1]?.data, undefined);
  } finally { await browser.close(); }
});

test("pending page fonts cannot prevent a masked form snapshot", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.route('https://fonts.example.test/pending.woff2', () => new Promise(() => {}));
    await page.setContent('<style>@font-face{font-family:pending;src:url(https://fonts.example.test/pending.woff2)}form{font-family:pending;width:300px;height:100px}</style><form><label>Search<input type="text" value="private-value"></label></form>', { waitUntil: 'domcontentloaded' });
    const inventory = buildCollectionSurfaceInventory({ pageUrl: 'about:blank', inspectedFieldCandidateCount: 1, candidateScanTruncated: false, rows: [{ groupKey: 'native_form_0', structure: 'native_form', elementType: 'input', inputType: 'text', label: 'Search', required: false, disabled: false, readOnly: false, domOrder: 0 }] }, Date.now());
    const result = await captureCollectionSurfaceSnapshots(page, inventory, async () => ({ safeForDisplay: true }));
    assert.equal(result[0]?.status, 'available');
    assert.equal(result[0]?.valuesMasked, true);
    assert.equal(await page.locator('input').inputValue(), 'private-value');
  } finally { await browser.close(); }
});

test("a form layout change during capture discards pixels before review", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.setContent('<form style="width:400px;height:150px"><label>Search<input type="text"></label></form>');
    const context = page.context();
    const createSession = context.newCDPSession.bind(context);
    context.newCDPSession = async (...args) => {
      const session = await createSession(...args);
      const send = session.send.bind(session);
      session.send = (async (method: string, params: unknown) => {
        const result = await (send as Function)(method, params);
        if (method === 'Page.captureScreenshot') await page.locator('input').evaluate(el => {
          const style = (el as HTMLElement).style;
          style.marginLeft = `${(parseFloat(style.marginLeft) || 0) + 50}px`;
        });
        return result;
      }) as typeof session.send;
      return session;
    };
    const inventory = buildCollectionSurfaceInventory({ pageUrl: 'about:blank', inspectedFieldCandidateCount: 1, candidateScanTruncated: false, rows: [{ groupKey: 'native_form_0', structure: 'native_form', elementType: 'input', inputType: 'text', label: 'Search', required: false, disabled: false, readOnly: false, domOrder: 0 }] }, Date.now());
    let reviewed = false;
    const result = await captureCollectionSurfaceSnapshots(page, inventory, async () => { reviewed = true; return { safeForDisplay: true }; });
    assert.equal(result[0]?.status, 'unavailable');
    assert.equal(result[0]?.data, undefined);
    assert.equal(reviewed, false);
    assert.equal(await page.locator('style').count(), 0, 'temporary animation styling must be removed');
  } finally { await browser.close(); }
});

test("a one-time layout shift rebinds and safely recaptures within the same deadline", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.setContent('<form style="width:400px;height:150px"><label>Search<input type="text" value="private"></label></form>');
    const context = page.context(), createSession = context.newCDPSession.bind(context);
    let captures = 0, reviews = 0;
    context.newCDPSession = async (...args) => {
      const session = await createSession(...args), send = session.send.bind(session);
      session.send = (async (method: string, params: unknown) => {
        const result = await (send as Function)(method, params);
        if (method === "Page.captureScreenshot" && ++captures === 1) {
          await page.locator("input").evaluate(el => { (el as HTMLElement).style.marginLeft = "50px"; });
        }
        return result;
      }) as typeof session.send;
      return session;
    };
    const inventory = buildCollectionSurfaceInventory({ pageUrl: "about:blank", inspectedFieldCandidateCount: 1,
      candidateScanTruncated: false, rows: [{ groupKey: "native_form_0", structure: "native_form", elementType: "input",
        inputType: "text", label: "Search", required: false, disabled: false, readOnly: false, domOrder: 0 }] }, Date.now());
    const result = await captureCollectionSurfaceSnapshots(page, inventory, async () => { reviews++; return { safeForDisplay: true }; },
      undefined, undefined, Date.now() + 2500);
    assert.equal(captures, 2);
    assert.equal(reviews, 1, "only the re-bound, safely masked image reaches review");
    assert.equal(result[0]?.status, "available");
    assert.equal(result[0]?.valuesMasked, true);
  } finally { await browser.close(); }
});


test("a wrapped post-pixel crop change safely retries once before review", async () => {
  const browser=await chromium.launch({headless:true});const page=await browser.newPage();
  const originalEvaluate=page.evaluate.bind(page);let shifted=false,reviews=0;
  try {
    await page.setContent('<form style="width:400px;height:150px"><label>Email<input type="email" value="private"></label></form>');
    (page as any).evaluate=async (...args:any[])=>{
      if(!shifted && args[1]?.crop){shifted=true;throw new Error("page.evaluate: Error: Form screenshot crop changed");}
      return (originalEvaluate as any)(...args);
    };
    const inventory=buildCollectionSurfaceInventory({pageUrl:"about:blank",inspectedFieldCandidateCount:1,candidateScanTruncated:false,
      rows:[{groupKey:"native_form_0",structure:"native_form",elementType:"input",inputType:"email",label:"Email",required:false,disabled:false,readOnly:false,domOrder:0}]},Date.now());
    const result=await captureCollectionSurfaceSnapshots(page,inventory,async()=>{reviews++;return {safeForDisplay:true};},undefined,undefined,Date.now()+2500);
    assert.equal(shifted,true);assert.equal(reviews,1);assert.equal(result[0]?.status,"available");assert.equal(result[0]?.valuesMasked,true);
  }finally{(page as any).evaluate=originalEvaluate;await browser.close();}
});

test("footer form capture uses a bounded viewport crop and restores scrolling", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  try {
    await page.setContent('<main style="height:18000px;animation-play-state:running"></main><form data-certscore-form-capture="existing" style="width:400px;height:100px"><label>Search<input type="text" value="private"></label></form>');
    const createSession = page.context().newCDPSession.bind(page.context());
    let beyond: boolean | undefined;
    page.context().newCDPSession = async (...args) => {
      const session = await createSession(...args), send = session.send.bind(session);
      session.send = (async (method: string, params: any) => { if (method === "Page.captureScreenshot") {
        beyond = params.captureBeyondViewport;
        assert.equal(params.optimizeForSpeed, true);
        assert.equal(await page.locator('main').evaluate(el => getComputedStyle(el).animationPlayState), 'paused');
        assert.equal(await page.locator('form').evaluate(el => getComputedStyle(el).animationPlayState), 'paused');
      } return (send as Function)(method, params); }) as typeof session.send;
      return session;
    };
    const inventory = buildCollectionSurfaceInventory({ pageUrl: 'about:blank', inspectedFieldCandidateCount: 1, candidateScanTruncated: false, rows: [{ groupKey: 'native_form_0', structure: 'native_form', elementType: 'input', inputType: 'text', label: 'Search', required: false, disabled: false, readOnly: false, domOrder: 0 }] }, Date.now());
    const result = await captureCollectionSurfaceSnapshots(page, inventory, async () => ({ safeForDisplay: true }));
    assert.equal(result[0]?.status, "available");
    assert.equal(beyond, false);
    assert.equal(await page.locator("form").getAttribute("data-certscore-form-capture"), "existing");
    assert.equal(await page.locator("main").evaluate(el => getComputedStyle(el).animationPlayState), "running");
    assert.equal(await page.evaluate(() => scrollY), 0);
    assert.equal(await page.locator("input").inputValue(), "private");
  } finally { await browser.close(); }
});

test("a form taller than the viewport uses a masked visible crop", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  try {
    await page.setContent('<main style="height:7000px"></main><form style="width:700px;height:1100px;background:rgb(255,0,0)"><label>Email<input type="email" value="private@example.test"></label></form>');
    const createSession = page.context().newCDPSession.bind(page.context());
    let beyond: boolean | undefined;
    page.context().newCDPSession = async (...args) => {
      const session = await createSession(...args), send = session.send.bind(session);
      session.send = (async (method: string, params: any) => {
        if (method === "Page.captureScreenshot") beyond = params.captureBeyondViewport;
        return (send as Function)(method, params);
      }) as typeof session.send;
      return session;
    };
    const inventory = buildCollectionSurfaceInventory({ pageUrl: "about:blank", inspectedFieldCandidateCount: 1,
      candidateScanTruncated: false, rows: [{ groupKey: "native_form_0", structure: "native_form", elementType: "input",
        inputType: "email", label: "Email", required: false, disabled: false, readOnly: false, domOrder: 0 }] }, Date.now());
    const result = await captureCollectionSurfaceSnapshots(page, inventory, async () => ({ safeForDisplay: true }));
    assert.equal(result[0]?.status, "available");
    assert.equal(result[0]?.valuesMasked, true);
    assert.equal(beyond, false);
    const center = await sharp(Buffer.from(result[0]!.data!, "base64")).extract({ left: 300, top: 600, width: 1, height: 1 }).raw().toBuffer();
    assert.ok(center[0]! > 180 && center[1]! < 100 && center[2]! < 100, "crop must show the form rather than the page top");
    assert.equal(await page.evaluate(() => scrollY), 0);
  } finally { await browser.close(); }
});

test("After Accept keeps a safe upper crop when the form grows below it", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  try {
    await page.setContent('<form style="width:700px;height:600px;background:rgb(255,0,0)"><label>Email<input type="email" value="private@example.test"></label></form>');
    const createSession = page.context().newCDPSession.bind(page.context());
    page.context().newCDPSession = async (...args) => {
      const session = await createSession(...args), send = session.send.bind(session);
      session.send = (async (method: string, params: unknown) => {
        const result = await (send as Function)(method, params);
        if (method === "Page.captureScreenshot") await page.locator("form").evaluate(form => { (form as HTMLElement).style.height = "800px"; });
        return result;
      }) as typeof session.send;
      return session;
    };
    const inventory = buildCollectionSurfaceInventory({ pageUrl: "about:blank", inspectedFieldCandidateCount: 1,
      candidateScanTruncated: false, rows: [{ groupKey: "native_form_0", structure: "native_form", elementType: "input",
        inputType: "email", label: "Email", required: false, disabled: false, readOnly: false, domOrder: 0 }] }, Date.now());
    const result = await captureCollectionSurfaceSnapshots(page, inventory, async () => ({ safeForDisplay: true }),
      undefined, undefined, undefined, { maxCropHeight: 480 });
    assert.equal(result[0]?.status, "available");
    assert.ok(result[0]?.data);
  } finally { await browser.close(); }
});

test("After Accept hides moving controls during capture and still masks both positions", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.setContent('<form style="width:500px;height:600px"><label>Email<input type="email" style="background:rgb(255,0,0);width:200px;height:40px" value="private@example.test"></label></form>');
    const createSession = page.context().newCDPSession.bind(page.context());
    page.context().newCDPSession = async (...args) => {
      const session = await createSession(...args), send = session.send.bind(session);
      session.send = (async (method: string, params: unknown) => {
        if (method === "Page.captureScreenshot") {
          assert.deepEqual(await page.locator("input").evaluate(input => ({
            clipPath: getComputedStyle(input).clipPath,
            visibility: getComputedStyle(input).visibility,
          })), { clipPath: "inset(100%)", visibility: "visible" });
          const inputBounds = await page.locator("input").boundingBox();
          assert.ok(inputBounds);
          const result = await (send as Function)(method, params) as { data: string };
          const clip = (params as { clip: { x: number; y: number; scale: number } }).clip;
          const x = Math.floor((inputBounds.x + inputBounds.width / 2 - clip.x) * clip.scale);
          const y = Math.floor((inputBounds.y + inputBounds.height / 2 - clip.y) * clip.scale);
          const rawPixel = await sharp(Buffer.from(result.data, "base64")).extract({ left: x, top: y, width: 1, height: 1 }).removeAlpha().raw().toBuffer();
          assert.ok(rawPixel[0]! > 230 && rawPixel[1]! > 230 && rawPixel[2]! > 230,
            "browser clipping must remove the red input pixels before the screenshot returns");
          await page.locator("input").evaluate(input => { (input as HTMLElement).style.marginTop = "80px"; });
          return result;
        }
        return (send as Function)(method, params);
      }) as typeof session.send;
      return session;
    };
    const inventory = buildCollectionSurfaceInventory({ pageUrl: "about:blank", inspectedFieldCandidateCount: 1,
      candidateScanTruncated: false, rows: [{ groupKey: "native_form_0", structure: "native_form", elementType: "input",
        inputType: "email", label: "Email", required: false, disabled: false, readOnly: false, domOrder: 0 }] }, Date.now());
    const result = await captureCollectionSurfaceSnapshots(page, inventory, async () => ({ safeForDisplay: true }),
      undefined, undefined, undefined, { maxCropHeight: 480, hideControlsDuringCapture: true });
    assert.equal(result[0]?.status, "available");
    assert.equal(await page.locator("input").evaluate(input => getComputedStyle(input).clipPath), "none");
  } finally { await browser.close(); }
});

test("After Accept withholds pixels if a control defeats the browser redaction rule", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.setContent('<form><label>Email<input type="email" style="clip-path:none!important;-webkit-clip-path:none!important" value="private@example.test"></label></form>');
    const inventory = buildCollectionSurfaceInventory({ pageUrl: "about:blank", inspectedFieldCandidateCount: 1,
      candidateScanTruncated: false, rows: [{ groupKey: "native_form_0", structure: "native_form", elementType: "input",
        inputType: "email", label: "Email", required: false, disabled: false, readOnly: false, domOrder: 0 }] }, Date.now());
    let reviewed = false;
    const result = await captureCollectionSurfaceSnapshots(page, inventory, async () => { reviewed = true; return { safeForDisplay: true }; },
      undefined, undefined, undefined, { hideControlsDuringCapture: true });
    assert.equal(result[0]?.status, "unavailable");
    assert.equal(reviewed, false);
  } finally { await browser.close(); }
});

test("masked capture can finish after one second inside the unchanged total budget", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.setContent('<form style="width:400px;height:150px"><label>Search<input type="text" value="private"></label></form>');
    const createSession = page.context().newCDPSession.bind(page.context());
    page.context().newCDPSession = async (...args) => {
      const session = await createSession(...args), send = session.send.bind(session);
      session.send = (async (method: string, params: unknown) => {
        if (method === "Page.captureScreenshot") await new Promise(resolve => setTimeout(resolve, 1600));
        return (send as Function)(method, params);
      }) as typeof session.send;
      return session;
    };
    const inventory = buildCollectionSurfaceInventory({ pageUrl: "about:blank", inspectedFieldCandidateCount: 1, candidateScanTruncated: false, rows: [{ groupKey: "native_form_0", structure: "native_form", elementType: "input", inputType: "text", label: "Search", required: false, disabled: false, readOnly: false, domOrder: 0 }] }, Date.now());
    const result = await captureCollectionSurfaceSnapshots(page, inventory, async () => ({ safeForDisplay: true }));
    assert.equal(result[0]?.status, "available");
    assert.equal(result[0]?.valuesMasked, true);
    assert.ok(result[0]?.data);
    assert.equal(await page.locator("input").inputValue(), "private");
  } finally { await browser.close(); }
});

test("changes to controls outside retained pixels do not invalidate a form crop", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.setContent('<form style="width:400px;height:150px"><label>Search<input type="text"></label></form><input id="outside" style="position:absolute;top:700px">');
    let enterCrop = false;
    const createSession = page.context().newCDPSession.bind(page.context());
    page.context().newCDPSession = async (...args) => {
      const session = await createSession(...args), send = session.send.bind(session);
      session.send = (async (method: string, params: unknown) => {
        const result = await (send as Function)(method, params);
        if (method === "Page.captureScreenshot") await page.locator("#outside").evaluate((el, enter) => {
          const style = (el as HTMLElement).style;
          style.left = `${(parseFloat(style.left) || 0) + 20}px`;
          if (enter) style.top = "30px";
        }, enterCrop);
        return result;
      }) as typeof session.send;
      return session;
    };
    const inventory = buildCollectionSurfaceInventory({ pageUrl: "about:blank", inspectedFieldCandidateCount: 1, candidateScanTruncated: false, rows: [{ groupKey: "native_form_0", structure: "native_form", elementType: "input", inputType: "text", label: "Search", required: false, disabled: false, readOnly: false, domOrder: 0 }] }, Date.now());
    assert.equal((await captureCollectionSurfaceSnapshots(page, inventory, async () => ({ safeForDisplay: true })))[0]?.status, "available");
    enterCrop = true;
    let reviewed = false;
    const changed = await captureCollectionSurfaceSnapshots(page, inventory, async () => { reviewed = true; return { safeForDisplay: true }; });
    assert.equal(changed[0]?.status, "unavailable");
    assert.equal(changed[0]?.data, undefined);
    assert.equal(reviewed, false);
  } finally { await browser.close(); }
});

test("ancestor and sibling animations freeze for one capture and resume without changing paused animations", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.setContent(`<style>
      @keyframes grow { from {height:20px} to {height:220px} }
      @keyframes move { from {transform:translateX(0)} to {transform:translateX(200px)} }
      #sibling {animation:grow 1s infinite alternate}
      section {animation:move 1s infinite alternate}
      #paused {animation:grow 1s infinite alternate;animation-play-state:paused}
      form {width:400px;height:150px;background:white}
    </style><div id="sibling"></div><section><form><label>Search<input type="text" value="private-value" style="display:block;width:100px;height:40px"></label></form></section><div id="paused"></div>`);
    const createSession = page.context().newCDPSession.bind(page.context());
    let captures = 0, reviews = 0;
    page.context().newCDPSession = async (...args) => {
      const session = await createSession(...args), send = session.send.bind(session);
      session.send = (async (method: string, params: unknown) => {
        if (method === "Page.captureScreenshot") {
          captures += 1;
          await new Promise(resolve => setTimeout(resolve, 100));
          assert.ok(await page.evaluate(() => document.getAnimations().every(animation => animation.playState === "paused")));
        }
        return (send as Function)(method, params);
      }) as typeof session.send;
      return session;
    };
    const inventory = buildCollectionSurfaceInventory({ pageUrl: "about:blank", inspectedFieldCandidateCount: 1, candidateScanTruncated: false, rows: [{ groupKey: "native_form_0", structure: "native_form", elementType: "input", inputType: "text", label: "Search", required: false, disabled: false, readOnly: false, domOrder: 0 }] }, Date.now());
    const result = await captureCollectionSurfaceSnapshots(page, inventory, async ({ bytes }) => {
      reviews += 1;
      const pixels = await sharp(bytes).raw().toBuffer({ resolveWithObject: true });
      const offset = (40 * pixels.info.width + 50) * pixels.info.channels;
      assert.ok(Math.abs(pixels.data[offset]! - 148) < 8);
      assert.ok(Math.abs(pixels.data[offset + 1]! - 163) < 8);
      assert.ok(Math.abs(pixels.data[offset + 2]! - 184) < 8);
      return { safeForDisplay: true };
    });
    assert.equal(result[0]?.status, 'available');
    assert.equal(captures, 1);
    assert.equal(reviews, 1);
    assert.equal(await page.locator('input').inputValue(), 'private-value');
    assert.equal(await page.locator('#sibling').evaluate(el => el.getAnimations()[0]?.playState), 'running');
    assert.equal(await page.locator('section').evaluate(el => el.getAnimations()[0]?.playState), 'running');
    assert.equal(await page.locator('#paused').evaluate(el => el.getAnimations()[0]?.playState), 'paused');
  } finally { await browser.close(); }
});

test("the total budget also bounds a stalled control-binding operation", async () => {
  const inventory = buildCollectionSurfaceInventory({ pageUrl: "https://example.test/", inspectedFieldCandidateCount: 1, candidateScanTruncated: false, rows: [{ groupKey: "native_form_0", structure: "native_form", elementType: "input", inputType: "text", label: "Search", required: false, disabled: false, readOnly: false, domOrder: 0 }] }, Date.now());
  const page = { url: () => inventory.pageUrl, evaluate: () => new Promise(() => {}) } as unknown as import("playwright").Page;
  const start = Date.now();
  const result = await captureCollectionSurfaceSnapshots(page, inventory, async () => { throw new Error("must not review"); });
  assert.equal(result[0]?.reason, "capture_budget_exhausted");
  assert.equal(result[0]?.data, undefined);
  assert.ok(Date.now() - start < FORM_SNAPSHOT_BUDGET_MS + 500);
});

test("pre-populated credentials, contact values, textareas, selects and editable regions are masked before review", async () => {
  const { captureMaskedFormScreenshot } = await import("./masked-form-screenshot");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.setContent(`<style>body{margin:0}form{width:400px;background:white}input,textarea,select,[contenteditable]{display:block;box-sizing:border-box;width:300px;height:50px;margin:10px}</style>
      <form><input type="password" value="secret-password"><input type="email" value="person@example.test"><input value="government-id-123"><textarea>private medical details</textarea><select><option>private account</option></select><div contenteditable>private note</div></form>`);
    // The production snapshot wrapper installs this tsx named-function shim before capture.
    await page.evaluate(() => { (globalThis as any).__name = (value: unknown) => value; });
    const root = await page.locator("form").elementHandle();
    const rectangles = await page.locator('input,textarea,select,[contenteditable]').evaluateAll(elements => elements.map(element => {
      const rect = element.getBoundingClientRect(); return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    }));
    const formTop = await page.locator("form").evaluate(element => element.getBoundingClientRect().top);
    const bytes = await captureMaskedFormScreenshot(page, root!, 2500);
    const pixels = await sharp(bytes).raw().toBuffer({ resolveWithObject: true });
    for (const rect of rectangles) {
      const offset = (Math.floor(rect.y - formTop) * pixels.info.width + Math.floor(rect.x)) * pixels.info.channels;
      for (const [channel, value] of [148, 163, 184].entries()) assert.ok(Math.abs(pixels.data[offset + channel]! - value) < 8, `control at ${rect.y} must be masked`);
    }
    assert.equal(await page.locator('input[type="password"]').inputValue(), "secret-password");
    assert.equal(await page.locator('textarea').inputValue(), "private medical details");
    assert.equal(await page.locator('[contenteditable]').textContent(), "private note");
  } finally { await browser.close(); }
});

test("a canceled idle form animation does not discard a safely masked screenshot", async () => {
  const { captureMaskedFormScreenshot } = await import("./masked-form-screenshot");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.setContent('<form><label>Email<input type="email" value="private@example.test"></label></form>');
    await page.locator("form").evaluate(form => {
      (globalThis as any).__name = (value: unknown) => value;
      const animation = { playState: "running", pause() { this.playState = "idle"; }, play() {} };
      Object.defineProperty(form, "getAnimations", { value: () => [animation] });
    });
    const root = await page.locator("form").elementHandle();
    const bytes = await captureMaskedFormScreenshot(page, root!, 1000);
    assert.equal(bytes[0], 0xff);
    assert.equal(bytes[1], 0xd8);
  } finally { await browser.close(); }
});

test("an animation that remains running after pause fails before pixels are captured", async () => {
  const { captureMaskedFormScreenshot } = await import("./masked-form-screenshot");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.setContent('<form><input type="email" value="private@example.test"></form>');
    await page.locator("form").evaluate(form => {
      (globalThis as any).__name = (value: unknown) => value;
      const animation = { playState: "running", pause() {}, play() {} };
      Object.defineProperty(form, "getAnimations", { value: () => [animation] });
    });
    const root = await page.locator("form").elementHandle();
    await assert.rejects(captureMaskedFormScreenshot(page, root!, 1000), /animation did not pause/);
    assert.equal(await page.locator("html").getAttribute("data-certscore-form-capture"), null);
  } finally { await browser.close(); }
});

test("combined binding withholds pixels when a form animation cannot pause", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.setContent('<form><label>Email<input type="email" value="private@example.test"></label></form>');
    await page.locator("form").evaluate(form => {
      (globalThis as any).__name = (value: unknown) => value;
      const animation = { playState: "running", pause() {}, play() {} };
      Object.defineProperty(form, "getAnimations", { value: () => [animation] });
    });
    const inventory = buildCollectionSurfaceInventory({ pageUrl: "about:blank", inspectedFieldCandidateCount: 1,
      candidateScanTruncated: false, rows: [{ groupKey: "native_form_0", structure: "native_form",
        elementType: "input", inputType: "email", label: "Email", required: false,
        disabled: false, readOnly: false, domOrder: 0 }] }, Date.now());
    const snapshots = await captureCollectionSurfaceSnapshots(page, inventory, async () => {
      throw new Error("unsafe pixels must not reach review");
    });
    assert.equal(snapshots[0]?.status, "unavailable");
    assert.equal(snapshots[0]?.data, undefined);
    assert.equal(await page.locator("html").getAttribute("data-certscore-form-capture"), null);
  } finally { await browser.close(); }
});


test("responsive form fitting preserves aspect ratio, full submit area, masks and original layout", async () => {
  const browser = await chromium.launch({headless:true}); const page=await browser.newPage({viewport:{width:1280,height:900}});
  try {
    await page.setContent(`<style>body{margin:0;font:20px Arial}.layout{display:grid;grid-template-columns:600px 240px;gap:24px;margin-top:1000px}
      form{box-sizing:border-box;padding:24px;border:4px solid #234;background:white;min-width:100%;max-width:100%}
      label{display:block;margin-bottom:24px}input{box-sizing:border-box;display:block;width:100%;height:60px}
      button{display:block;width:100%;height:60px;background:rgb(0,160,60);color:white;border:0}aside{background:rgb(255,0,170)}</style>
      <div class="layout"><form style="zoom:1!important;width:auto!important">${Array.from({length:8},(_,i)=>`<label>Field ${i+1}<input type="text" name="field${i}" value="private-value"></label>`).join('')}
        <p>We use personal data to handle your request. Privacy policy.</p><button>Submit</button></form><aside>Neighbor content must not enter the crop</aside></div>`);
    const before=await page.locator('form').evaluate(form=>({style:(form as HTMLElement).style.cssText,width:form.getBoundingClientRect().width,height:form.getBoundingClientRect().height}));
    const inventory=buildCollectionSurfaceInventory({pageUrl:page.url(),inspectedFieldCandidateCount:8,candidateScanTruncated:false,
      rows:Array.from({length:8},(_,i)=>({groupKey:'0',structure:'native_form' as const,elementType:'input' as const,inputType:'text',label:`Field ${i+1}`,required:false,disabled:false,readOnly:false,domOrder:i}))},Date.now());
    const snapshots=await captureCollectionSurfaceSnapshots(page,inventory,async({bytes})=>{
      const pixels=await sharp(bytes).raw().toBuffer({resolveWithObject:true});
      assert.ok(Math.abs(pixels.info.width/pixels.info.height-before.width/before.height)<0.01,'form must shrink uniformly');
      let green=0,pink=0,masks=0;
      for(let offset=0;offset<pixels.data.length;offset+=pixels.info.channels){
        const [r,g,b]=[pixels.data[offset]!,pixels.data[offset+1]!,pixels.data[offset+2]!];
        if(r<30&&g>120&&g<190&&b>30&&b<90)green++;
        if(r>220&&g<30&&b>130)pink++;
        if(Math.abs(r-148)<8&&Math.abs(g-163)<8&&Math.abs(b-184)<8)masks++;
      }
      assert.ok(green>100,'submit area must be retained');assert.equal(pink,0,'neighbor must stay outside crop');assert.ok(masks>1000);
      if(process.env.FORM_CAPTURE_ARTIFACT_DIR){
        const {mkdir,writeFile}=await import('node:fs/promises');await mkdir(process.env.FORM_CAPTURE_ARTIFACT_DIR,{recursive:true});
        await writeFile(`${process.env.FORM_CAPTURE_ARTIFACT_DIR}/responsive-form.jpeg`,bytes);
      }
      return {safeForDisplay:true};
    },undefined,undefined,undefined,{maxCropHeight:480,fitFormToCrop:true,hideControlsDuringCapture:true});
    assert.equal(snapshots[0]?.status,'available',JSON.stringify(snapshots.map(({data,...row})=>row)));
    const after=await page.locator('form').evaluate(form=>({style:(form as HTMLElement).style.cssText,width:form.getBoundingClientRect().width,height:form.getBoundingClientRect().height}));
    assert.deepEqual(after,before);assert.deepEqual(await page.evaluate(()=>({x:scrollX,y:scrollY})),{x:0,y:0});
    assert.equal(await page.locator('[data-certscore-form-capture]').count(),0);
    assert.equal(await page.locator('input').first().inputValue(),'private-value');
  }finally{await browser.close();}
});
