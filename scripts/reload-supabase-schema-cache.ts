import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DEFAULT_DEV_PROJECT_REF = "ibjxttgmvdkbuqllbazj";
const DEFAULT_PROD_PROJECT_REF = "wgfhzyrysztmtrjbcsgy";
const RELOAD_SQL = "NOTIFY pgrst, 'reload schema';";

type CliOptions = {
  projectRef: string;
};

function printUsage() {
  console.log(
    [
      "Usage: pnpm exec tsx ./scripts/reload-supabase-schema-cache.ts [--project-ref <ref>]",
      "",
      `Defaults to the project ref derived from NEXT_PUBLIC_SUPABASE_URL, SUPABASE_PROJECT_REF, or ${DEFAULT_DEV_PROJECT_REF}.`,
      `Known refs: dev=${DEFAULT_DEV_PROJECT_REF}, prod=${DEFAULT_PROD_PROJECT_REF}.`
    ].join("\n")
  );
}

function parseProjectRefFromUrl(value: string | undefined) {
  if (!value) {
    return null;
  }

  try {
    const host = new URL(value).host;
    const [subdomain] = host.split(".");
    return subdomain || null;
  } catch {
    return null;
  }
}

function parseArgs(argv: string[]): CliOptions {
  let projectRef =
    parseProjectRefFromUrl(process.env.NEXT_PUBLIC_SUPABASE_URL) ??
    process.env.SUPABASE_PROJECT_REF ??
    DEFAULT_DEV_PROJECT_REF;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    }

    if (arg === "--project-ref") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("Missing value for --project-ref.");
      }
      projectRef = value;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return { projectRef };
}

function runSupabase(workdir: string, args: string[]) {
  return execFileSync(
    "npx",
    ["supabase@latest", "--workdir", workdir, "--yes", ...args],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }
  );
}

function createIsolatedSupabaseProject(projectRef: string) {
  const workdir = mkdtempSync(join(tmpdir(), "supabase-schema-reload-"));
  const supabaseDir = join(workdir, "supabase");
  mkdirSync(supabaseDir, { recursive: true });
  writeFileSync(join(supabaseDir, "config.toml"), `project_id = "${projectRef}"\n`, "utf8");
  return workdir;
}

function main() {
  const { projectRef } = parseArgs(process.argv.slice(2));
  const workdir = createIsolatedSupabaseProject(projectRef);

  try {
    console.log(`Linking isolated Supabase workdir to ${projectRef}...`);
    runSupabase(workdir, ["link", "--project-ref", projectRef]);

    console.log(`Reloading PostgREST schema cache for ${projectRef}...`);
    runSupabase(workdir, ["db", "query", "--linked", "--output", "json", RELOAD_SQL]);

    console.log(`Schema reload notification sent for ${projectRef}.`);
    console.log(
      "If the REST API still serves the old schema after a short delay, restart the Supabase project/API once."
    );
  } finally {
    rmSync(workdir, { recursive: true, force: true });
  }
}

main();
