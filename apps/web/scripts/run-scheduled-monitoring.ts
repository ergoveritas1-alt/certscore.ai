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

function getStringArg(argv: string[], name: string) {
  const prefix = `--${name}=`;
  const arg = argv.find((value) => value.startsWith(prefix));
  const value = arg?.slice(prefix.length).trim() || process.env[`OPS_${name.replaceAll("-", "_").toUpperCase()}`]?.trim();
  return value && value.length > 0 ? value : undefined;
}

function getStringListArg(argv: string[], name: string) {
  const value = getStringArg(argv, name);
  return value
    ?.split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

async function main() {
  const argv = process.argv.slice(2);
  const { runScheduledMonitoringSweep } = await import("../server/scheduling/run-scheduled-monitoring");
  const result = await runScheduledMonitoringSweep({
    canaryDomain: getStringArg(argv, "canary-domain") ?? process.env.OPS_SCHEDULED_MONITORING_CANARY_DOMAIN,
    excludedOrganizationSlugs: getStringListArg(argv, "excluded-org-slugs"),
    limit: getLimit(argv)
  });

  console.info("[scheduled-monitoring] sweep complete", result);
}

main().catch((error) => {
  console.error("[scheduled-monitoring] sweep failed", error);
  process.exitCode = 1;
});
