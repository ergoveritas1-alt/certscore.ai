import {
  generateWc01V2PostRejectCalibrationReportFromFile,
} from "../wc01-v2-post-reject-calibration";

type Args = {
  artifactRoot?: string;
  manifestPath?: string;
  outPath?: string;
  markdownPath?: string;
  help?: boolean;
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  if (!args.manifestPath || !args.artifactRoot || !args.outPath) {
    throw new Error(usage());
  }

  const report = await generateWc01V2PostRejectCalibrationReportFromFile({
    artifactRoot: args.artifactRoot,
    manifestPath: args.manifestPath,
    outPath: args.outPath,
    markdownPath: args.markdownPath,
  });

  console.log(`Evaluated ${report.summary.evaluatedCount}/${report.summary.siteCount} sites.`);
  console.log(`Passed ${report.summary.passCount}; failed ${report.summary.failCount}; unknown ${report.summary.unknownCount}.`);
  console.log(`Detected ${report.summary.detectedCount}; testable ${report.summary.testableCount}; promotable ${report.summary.promotableCount}.`);
  console.log(`Reject success ${report.summary.rejectSucceededSiteCount}/${report.summary.rejectAttemptedSiteCount} attempted sites.`);
  console.log(`CMP attempted success ${report.summary.cmpSucceededFlowCount}/${report.summary.cmpAttemptedFlowCount} attempted CMP-supported flows.`);
  console.log(`CMP comparable-window success ${report.summary.cmpComparableWindowSuccessCount}/${report.summary.cmpSucceededFlowCount} successful reject actions.`);
  console.log(`Wrote ${args.outPath}`);
  if (args.markdownPath) {
    console.log(`Wrote ${args.markdownPath}`);
  }
}

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--manifest") {
      args.manifestPath = requiredValue(argv, ++index, arg);
    } else if (arg === "--artifacts" || arg === "--artifact-root") {
      args.artifactRoot = requiredValue(argv, ++index, arg);
    } else if (arg === "--out") {
      args.outPath = requiredValue(argv, ++index, arg);
    } else if (arg === "--summary") {
      args.markdownPath = requiredValue(argv, ++index, arg);
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}\n\n${usage()}`);
    }
  }
  return args;
}

function requiredValue(argv: string[], index: number, flag: string) {
  const value = argv[index];
  if (!value) {
    throw new Error(`Missing value for ${flag}.`);
  }
  return value;
}

function usage() {
  return [
    "Usage:",
    "  pnpm v2:wc01-post-reject-calibration --manifest <manifest.json> --artifacts <artifacts-dir> --out <report.json> [--summary <summary.md>]",
    "",
    "Internal post-reject calibration diagnostic only. Not customer-facing report output.",
  ].join("\n");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
