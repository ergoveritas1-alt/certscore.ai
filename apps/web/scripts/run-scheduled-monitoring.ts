import { runScheduledMonitoringSweep } from "../server/scheduling/run-scheduled-monitoring";

function getLimit(argv: string[]) {
  const limitArg = argv.find((arg) => arg.startsWith("--limit="));
  if (!limitArg) {
    return undefined;
  }

  const limit = Number(limitArg.slice("--limit=".length));
  return Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : undefined;
}

async function main() {
  const result = await runScheduledMonitoringSweep({
    limit: getLimit(process.argv.slice(2))
  });

  console.info("[scheduled-monitoring] sweep complete", result);
}

main().catch((error) => {
  console.error("[scheduled-monitoring] sweep failed", error);
  process.exitCode = 1;
});
