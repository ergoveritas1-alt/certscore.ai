import assert from "node:assert/strict";
import { mkdtempSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { cleanupScanArtifactDirectory, getScanArtifactRetentionConfig } from "./artifact-retention";

function withTempDir<T>(run: (dir: string) => Promise<T> | T): Promise<T> | T {
  const dir = mkdtempSync(path.join(tmpdir(), "certscore-artifacts-"));
  const cleanup = () => rmSync(dir, { force: true, recursive: true });
  try {
    const result = run(dir);
    if (result && typeof (result as Promise<T>).then === "function") {
      return (result as Promise<T>).finally(cleanup);
    }
    cleanup();
    return result;
  } catch (error) {
    cleanup();
    throw error;
  }
}

function writeArtifact(filePath: string, size: number, mtime: Date) {
  writeFileSync(filePath, Buffer.alloc(size, "x"));
  const seconds = mtime.getTime() / 1000;
  // Keep atime and mtime stable for age and max-size ordering assertions.
  utimesSync(filePath, seconds, seconds);
}

test("scan artifact retention defaults to disabled with three-day and 250 MB limits", () => {
  const config = getScanArtifactRetentionConfig({});
  assert.equal(config.enabled, false);
  assert.equal(config.retentionDays, 3);
  assert.equal(config.maxMb, 250);
  assert.equal(config.maxBytes, 250 * 1024 * 1024);
});

test("scan artifact retention parses explicit opt-in values", () => {
  const config = getScanArtifactRetentionConfig({
    SCAN_ARTIFACTS_ENABLED: "true",
    SCAN_ARTIFACT_RETENTION_DAYS: "7",
    SCAN_ARTIFACT_MAX_MB: "1.5"
  });
  assert.equal(config.enabled, true);
  assert.equal(config.retentionDays, 7);
  assert.equal(config.maxMb, 1.5);
  assert.equal(config.maxBytes, 1.5 * 1024 * 1024);
});

test("cleanup dry-run reports old artifacts without deleting them", async () => {
  await withTempDir(async (dir) => {
    const oldPath = path.join(dir, "old.json");
    writeArtifact(oldPath, 10, new Date("2026-04-25T00:00:00Z"));

    const result = await cleanupScanArtifactDirectory({
      config: { enabled: true, maxBytes: 1024, maxMb: 1 / 1024, retentionDays: 3 },
      dir,
      dryRun: true,
      now: new Date("2026-05-02T00:00:00Z")
    });

    assert.deepEqual(result.deletedFiles, [oldPath]);
    assert.equal(statSync(oldPath).isFile(), true);
  });
});

test("cleanup removes files older than the retention window", async () => {
  await withTempDir(async (dir) => {
    const oldPath = path.join(dir, "old.json");
    const freshPath = path.join(dir, "fresh.json");
    writeArtifact(oldPath, 10, new Date("2026-04-25T00:00:00Z"));
    writeArtifact(freshPath, 10, new Date("2026-05-01T00:00:00Z"));

    const result = await cleanupScanArtifactDirectory({
      config: { enabled: true, maxBytes: 1024, maxMb: 1 / 1024, retentionDays: 3 },
      dir,
      now: new Date("2026-05-02T00:00:00Z")
    });

    assert.deepEqual(result.deletedFiles, [oldPath]);
    assert.equal(result.bytesBefore, 20);
    assert.equal(result.bytesAfter, 10);
    assert.throws(() => statSync(oldPath), /ENOENT/);
    assert.equal(statSync(freshPath).isFile(), true);
  });
});

test("cleanup enforces max directory size by deleting oldest files first", async () => {
  await withTempDir(async (dir) => {
    const oldestPath = path.join(dir, "oldest.json");
    const middlePath = path.join(dir, "middle.json");
    const newestPath = path.join(dir, "newest.json");
    writeArtifact(oldestPath, 10, new Date("2026-05-01T00:00:00Z"));
    writeArtifact(middlePath, 10, new Date("2026-05-01T01:00:00Z"));
    writeArtifact(newestPath, 10, new Date("2026-05-01T02:00:00Z"));

    const result = await cleanupScanArtifactDirectory({
      config: { enabled: true, maxBytes: 15, maxMb: 15 / 1024 / 1024, retentionDays: 30 },
      dir,
      now: new Date("2026-05-02T00:00:00Z")
    });

    assert.deepEqual(result.deletedFiles, [middlePath, oldestPath].sort());
    assert.throws(() => statSync(oldestPath), /ENOENT/);
    assert.throws(() => statSync(middlePath), /ENOENT/);
    assert.equal(statSync(newestPath).isFile(), true);
  });
});
