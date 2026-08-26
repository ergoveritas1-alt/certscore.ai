import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const APP_SHELL_PATH = "apps/web/components/dashboard/app-shell.tsx";

test("authenticated navigation is an anchored menu without a persistent sidebar", async () => {
  const source = await readFile(APP_SHELL_PATH, "utf8");

  assert.match(source, /aria-haspopup="menu"/);
  assert.match(source, /aria-label="Account navigation"/);
  assert.match(source, /absolute left-0 top-full/);
  assert.doesNotMatch(source, /<aside/);
  assert.doesNotMatch(source, /COLLAPSED_NAV_WIDTH|navExpanded/);
});

test("authenticated header, content, and footer share the wide report alignment", async () => {
  const source = await readFile(APP_SHELL_PATH, "utf8");
  const wideFrames = source.match(/max-w-\[90rem\]/g) ?? [];

  assert.equal(wideFrames.length, 3);
  assert.match(source, /px-5[^"\n]*lg:px-10/);
});

test("authenticated mobile header stays on one row and preserves compact navigation", async () => {
  const source = await readFile(APP_SHELL_PATH, "utf8");

  assert.match(source, /flex items-center justify-between gap-2 sm:gap-3/);
  assert.match(source, /hidden h-\[33px\] shrink-0 items-center overflow-hidden sm:flex/);
  assert.match(source, /hidden rounded-full[^"\n]*md:inline-flex/);
  assert.match(source, /w-\[min\(19rem,calc\(100vw-2\.5rem\)\)\]/);
  assert.match(source, /max-h-\[calc\(100dvh-5rem\)\][^"\n]*overflow-y-auto/);
});
