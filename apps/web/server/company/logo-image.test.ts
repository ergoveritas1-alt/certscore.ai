import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { isWorkspaceLogoKey, MAX_LOGO_UPLOAD_BYTES, normalizeCompanyLogo } from "./logo-image";

test("logos are resized and converted to metadata-free still PNGs", async () => {
  for (const format of ["png", "jpeg", "webp"] as const) {
    const source = await sharp({ create: { width: 1200, height: 600, channels: 4, background: "#1288aaff" } })
      .withMetadata({ density: 144 })[format]().toBuffer();
    const result = await normalizeCompanyLogo(source, `image/${format}`);
    const info = await sharp(result).metadata();
    assert.equal(info.format, "png");
    assert.equal(info.width, 640);
    assert.equal(info.height, 320);
    assert.equal(info.exif, undefined);
    assert.equal(info.icc, undefined);
    assert.ok(result.length <= 256 * 1024);
  }
});

test("logo validation rejects spoofed types, SVG, corrupt data, oversized bytes and excessive pixels", async () => {
  const png = await sharp({ create: { width: 10, height: 10, channels: 4, background: "transparent" } }).png().toBuffer();
  await assert.rejects(normalizeCompanyLogo(png, "image/jpeg"));
  await assert.rejects(normalizeCompanyLogo(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), "image/svg+xml"));
  await assert.rejects(normalizeCompanyLogo(Buffer.from("not an image"), "image/png"));
  await assert.rejects(normalizeCompanyLogo(Buffer.alloc(MAX_LOGO_UPLOAD_BYTES + 1), "image/png"));
  const huge = await sharp({ create: { width: 2100, height: 2100, channels: 3, background: "white" } }).png().toBuffer();
  await assert.rejects(normalizeCompanyLogo(huge, "image/png"));
});

test("logo keys must belong to the exact workspace and cannot traverse paths", () => {
  assert.equal(isWorkspaceLogoKey("workspace-a", "company-logos/workspace-a/1234-abcd.png"), true);
  assert.equal(isWorkspaceLogoKey("workspace-a", "company-logos/workspace-b/1234-abcd.png"), false);
  assert.equal(isWorkspaceLogoKey("workspace-a", "company-logos/workspace-a/../secret.png"), false);
  assert.equal(isWorkspaceLogoKey("workspace-a", "company-logos/workspace-a/key.svg?url=secret"), false);
});
