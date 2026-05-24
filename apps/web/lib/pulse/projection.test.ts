import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("Pulse projection does not cap top findings by detail level", () => {
  const source = readFileSync(new URL("./projection.ts", import.meta.url), "utf8");

  assert.match(source, /const topFindings = executive\.topFindings\.map\(/);
  assert.doesNotMatch(source, /topFindings = executive\.topFindings\.slice\(/);
  assert.doesNotMatch(source, /input\.detail === "tiny" \? 3 : 5/);
});
