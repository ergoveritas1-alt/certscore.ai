import Module from "node:module";

const moduleLoader = Module as typeof Module & {
  _load?: (request: string, parent: unknown, isMain: boolean) => unknown;
};
const originalLoad = moduleLoader._load;

if (originalLoad) {
  moduleLoader._load = function loadWithServerOnlyShim(request, parent, isMain) {
    if (request === "server-only") {
      return {};
    }

    return originalLoad.call(this, request, parent, isMain);
  };
}

function getNumberArg(argv: string[], name: string, fallback: number) {
  const prefix = `--${name}=`;
  const arg = argv.find((value) => value.startsWith(prefix));
  if (!arg) {
    return fallback;
  }
  const parsed = Number(arg.slice(prefix.length));
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function getStringListArg(argv: string[], name: string) {
  const prefix = `--${name}=`;
  const arg = argv.find((value) => value.startsWith(prefix));
  return arg
    ?.slice(prefix.length)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function hasFlag(argv: string[], name: string) {
  return argv.includes(`--${name}`);
}

async function main() {
  const argv = process.argv.slice(2);
  const { persistPendingNormalScannerQualityWindows, resetDerivedNormalScannerQualityHistory } = await import("../server/ops/scanner-quality-normal-history");
  const resetDerivedNormal = hasFlag(argv, "reset-derived-normal");
  const applyReset = hasFlag(argv, "apply");
  const resetOnly = hasFlag(argv, "reset-only");
  const resetResult = resetDerivedNormal ? await resetDerivedNormalScannerQualityHistory({ dryRun: !applyReset }) : null;
  if (resetOnly) {
    console.info(JSON.stringify({ reset: resetResult }));
    return;
  }
  const result = await persistPendingNormalScannerQualityWindows({
    egressIds: getStringListArg(argv, "egress-ids"),
    windowSize: getNumberArg(argv, "window-size", 5)
  });

  console.info(
    JSON.stringify({
      persistedEvents: result.persistedEvents,
      persistedWindows: result.persistedWindows.length,
      processedScanCount: result.processedScanCount,
      reset: resetResult,
      skippedEgressIds: result.skippedEgressIds
    })
  );
}

main().catch((error) => {
  console.error("[scanner-quality-history] aggregation failed", error);
  process.exitCode = 1;
});
