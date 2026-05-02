import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { normalizeAxeViolations } from "../accessibility/normalize-axe-violations";
import {
  cleanupRuntimeScanArtifacts,
  getRuntimeScanArtifactOptions
} from "./runtime-scan-artifacts";

function withTempDir(fn: (dir: string) => Promise<void> | void) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "wc01-runtime-artifacts-"));
  return async () => {
    try {
      await fn(dir);
    } finally {
      rmSync(dir, { force: true, recursive: true });
    }
  };
}

test(
  "runtime scan artifact paths are disabled by default",
  withTempDir((cwd) => {
    const options = getRuntimeScanArtifactOptions({
      cwd,
      env: {},
      scanId: "scan_123",
      stage: "accessibility-validation"
    });

    assert.equal(options.enabled, false);
    assert.equal(options.root, null);
    assert.deepEqual(options.launchOptions, {});
    assert.deepEqual(options.contextOptions, {});
    assert.equal(existsSync(path.join(cwd, "apps/validation-worker/artifacts/runtime-scans")), false);
  })
);

test(
  "runtime scan artifact paths are available only when explicitly enabled",
  withTempDir(async (cwd) => {
    const options = getRuntimeScanArtifactOptions({
      cwd,
      env: {
        SCAN_ARTIFACTS_ENABLED: "true",
        SCAN_ARTIFACT_MAX_MB: "1",
        SCAN_ARTIFACT_RETENTION_DAYS: "3"
      },
      scanId: "Scan 123/With Spaces",
      stage: "accessibility validation"
    });

    assert.equal(options.enabled, true);
    assert.match(options.root ?? "", /apps\/validation-worker\/artifacts\/runtime-scans\/accessibility-validation\/scan-123-with-spaces$/);
    assert.equal(options.launchOptions.downloadsPath, path.join(options.root!, "downloads"));
    assert.deepEqual(options.contextOptions.recordVideo, {
      dir: path.join(options.root!, "videos")
    });

    mkdirSync(options.root!, { recursive: true });
    writeFileSync(path.join(options.root!, "debug.json"), "{}\n", "utf8");

    const cleanup = await cleanupRuntimeScanArtifacts(options);
    assert.equal(cleanup?.scannedFiles, 1);
    assert.equal(cleanup?.deletedFiles.length, 0);
    assert.equal(existsSync(path.join(options.root!, "debug.json")), true);
  })
);

test(
  "derived accessibility evidence does not depend on local artifact files",
  withTempDir((cwd) => {
    const options = getRuntimeScanArtifactOptions({
      cwd,
      env: {},
      scanId: "scan_derived",
      stage: "accessibility-validation"
    });

    const findings = normalizeAxeViolations(
      [
        {
          description: "Ensures images have alternate text",
          help: "Images must have alternate text",
          id: "image-alt",
          impact: "serious",
          nodes: [{ html: "<img src=\"person.jpg\">", target: ["img.hero"] }],
          tags: ["wcag2a", "wcag111"]
        }
      ],
      "https://example.com/"
    );

    assert.equal(options.enabled, false);
    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.id, "missing_image_alt_text");
    assert.equal(findings[0]?.evidenceSummary.includes("<img"), false);
    assert.equal(existsSync(path.join(cwd, "apps/validation-worker/artifacts/runtime-scans")), false);
  })
);
