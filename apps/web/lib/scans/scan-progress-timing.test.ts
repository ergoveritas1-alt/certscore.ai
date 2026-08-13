import assert from "node:assert/strict";
import test from "node:test";
import {
  getScanProgressRuntime,
  readLearnedScanDuration,
  recordScanDuration
} from "./scan-progress-timing";

function createMemoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value)
  };
}

test("scan timing identifies local and hosted runtimes", () => {
  assert.equal(getScanProgressRuntime("localhost"), "local");
  assert.equal(getScanProgressRuntime("127.0.0.1"), "local");
  assert.equal(getScanProgressRuntime("certscore.ai"), "hosted");
});

test("learned timing uses the median of recent same-target samples", () => {
  const storage = createMemoryStorage();
  const shared = { profileValue: "standard", runtime: "local" as const, storage, target: "https://www.ergoveritas.com/path" };

  recordScanDuration({ ...shared, durationMs: 13_000 });
  recordScanDuration({ ...shared, durationMs: 40_000 });
  recordScanDuration({ ...shared, durationMs: 12_000 });

  assert.equal(readLearnedScanDuration(shared), 13_000);
  assert.equal(readLearnedScanDuration({ ...shared, target: "other.example" }), null);
});

test("invalid and extreme timing samples are ignored", () => {
  const storage = createMemoryStorage();
  const shared = { profileValue: "standard", runtime: "local" as const, storage, target: "ergoveritas.com" };

  recordScanDuration({ ...shared, durationMs: 500 });
  recordScanDuration({ ...shared, durationMs: 500_000 });

  assert.equal(readLearnedScanDuration(shared), null);
});
