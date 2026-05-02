#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import {
  cleanupScanArtifactDirectory,
  getScanArtifactRetentionConfig
} from "../packages/shared/src/utils/artifact-retention";

function getArgValues(flag: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === flag && process.argv[index + 1]) {
      values.push(process.argv[index + 1]);
      index += 1;
    }
  }
  return values;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

async function main() {
  const config = getScanArtifactRetentionConfig();
  const dryRun = hasFlag("--dry-run");
  const dirs = getArgValues("--dir");
  const targetDirs =
    dirs.length > 0
      ? dirs
      : [path.join(process.cwd(), "apps/web/artifacts"), path.join(process.cwd(), "apps/validation-worker/artifacts")];

  for (const dir of targetDirs) {
    const result = await cleanupScanArtifactDirectory({
      config,
      dir: path.resolve(dir),
      dryRun
    });
    console.info(
      JSON.stringify(
        {
          bytesAfter: result.bytesAfter,
          bytesBefore: result.bytesBefore,
          deletedBytes: result.deletedBytes,
          deletedFiles: result.deletedFiles.length,
          dir: path.resolve(dir),
          dryRun: result.dryRun,
          scannedFiles: result.scannedFiles
        },
        null,
        2
      )
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
