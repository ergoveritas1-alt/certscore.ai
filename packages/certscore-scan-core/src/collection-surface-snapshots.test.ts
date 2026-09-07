import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import sharp from "sharp";
import { buildCollectionSurfaceInventory } from "./collection-surface-inventory";
import { captureCollectionSurfaceSnapshots } from "./collection-surface-snapshots";

test("form crops retain binding, mask inputs, resize, and fail closed on unsafe or mismatched documents", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  try {
    await page.setContent('<form style="width:1000px;height:300px;background:white"><label>Email<input type="email" value="private@example.test" style="display:block;width:400px;height:80px"></label></form>');
    const inventory = buildCollectionSurfaceInventory({ pageUrl: "about:blank", inspectedFieldCandidateCount: 1, candidateScanTruncated: false, rows: [{ groupKey: "native_form_0", structure: "native_form", elementType: "input", inputType: "email", label: "Email", required: false, disabled: false, readOnly: false, domOrder: 0 }] }, Date.now());
    let reviewed = 0;
    const snapshots = await captureCollectionSurfaceSnapshots(page, inventory, async ({ bytes }) => {
      reviewed++;
      const metadata = await sharp(bytes).metadata();
      assert.equal(metadata.width, 640); assert.ok(metadata.height! <= 960);
      return { safeForDisplay: true };
    });
    assert.equal(reviewed, 1);
    assert.equal(snapshots[0]?.status, "available");
    assert.equal(snapshots[0]?.formRef, inventory.forms[0]?.formRef);
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
  } finally { await browser.close(); }
});
