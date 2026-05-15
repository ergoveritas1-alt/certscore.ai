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

function getLimit(argv: string[]) {
  const limitArg = argv.find((arg) => arg.startsWith("--limit="));
  if (!limitArg) {
    return undefined;
  }

  const limit = Number(limitArg.slice("--limit=".length));
  return Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : undefined;
}

async function main() {
  const { runScheduledMonitoringSweep } = await import("../server/scheduling/run-scheduled-monitoring");
  const result = await runScheduledMonitoringSweep({
    limit: getLimit(process.argv.slice(2))
  });

  console.info("[scheduled-monitoring] sweep complete", result);
}

main().catch((error) => {
  console.error("[scheduled-monitoring] sweep failed", error);
  process.exitCode = 1;
});
