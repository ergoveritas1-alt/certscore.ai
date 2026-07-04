import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = process.cwd();
const packageDir = join(repoRoot, "packages", "certscore-mcp");
const packageJson = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8")) as { version: string };
const version = packageJson.version;
const artifactRoot = join(repoRoot, "artifacts", "certscore-mcp-homebrew");
const releaseName = `certscore-mcp-v${version}`;
const releaseDir = join(artifactRoot, releaseName);
const bundlePath = join(releaseDir, "libexec", "certscore-mcp.mjs");
const wrapperPath = join(releaseDir, "bin", "certscore-mcp");
const tarballPath = join(artifactRoot, `${releaseName}.tar.gz`);
const checksumPath = join(artifactRoot, "SHA256SUMS");
const formulaPath = join(artifactRoot, "certscore-mcp.rb");
const caskPath = join(artifactRoot, "certscore-mcp-cask.rb");
const gitCommitDate = process.env.CERTSCORE_MCP_RELEASE_MTIME ?? output("git", ["show", "-s", "--format=%cI", "HEAD"]).trim();

function findGnuTarCommand() {
  for (const command of ["gtar", "tar"]) {
    const result = spawnSync(command, ["--version"], {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, COPYFILE_DISABLE: "1" }
    });
    if (result.status === 0 && /GNU tar/i.test(`${result.stdout}\n${result.stderr}`)) {
      return command;
    }
  }
  throw new Error("GNU tar is required for deterministic certscore-mcp release archives. On macOS, install it with `brew install gnu-tar`.");
}

const tarCommand = findGnuTarCommand();

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, COPYFILE_DISABLE: "1" },
    stdio: "inherit"
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status ?? "unknown"}`);
  }
}

function output(command: string, args: string[]) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, COPYFILE_DISABLE: "1" }
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status ?? "unknown"}\n${result.stderr}`);
  }
  return result.stdout;
}

function outputWithStderr(command: string, args: string[]) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, COPYFILE_DISABLE: "1" }
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status ?? "unknown"}\n${result.stderr}`);
  }
  return `${result.stdout}\n${result.stderr}`;
}

function runPnpm(args: string[]) {
  run("corepack", ["pnpm", ...args]);
}

function sha256(path: string) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

rmSync(releaseDir, { force: true, recursive: true });
mkdirSync(join(releaseDir, "bin"), { recursive: true });
mkdirSync(join(releaseDir, "libexec"), { recursive: true });

runPnpm(["--filter", "@certscore/api-contracts", "build"]);
runPnpm(["--filter", "@certscore/sdk", "build"]);
runPnpm(["--filter", "certscore-mcp", "build"]);

runPnpm([
  "exec",
  "esbuild",
  "packages/certscore-mcp/src/index.ts",
  "--bundle",
  "--platform=node",
  "--format=esm",
  "--target=node22",
  `--outfile=${bundlePath}`
]);

writeFileSync(
  wrapperPath,
  [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    'SOURCE="${BASH_SOURCE[0]}"',
    'while [ -L "$SOURCE" ]; do',
    '  DIR="$(cd -P "$(dirname "$SOURCE")" >/dev/null 2>&1 && pwd)"',
    '  SOURCE="$(readlink "$SOURCE")"',
    '  [[ "$SOURCE" != /* ]] && SOURCE="$DIR/$SOURCE"',
    "done",
    'DIR="$(cd -P "$(dirname "$SOURCE")" >/dev/null 2>&1 && pwd)"',
    'exec node "$DIR/../libexec/certscore-mcp.mjs" "$@"',
    ""
  ].join("\n"),
  { mode: 0o755 }
);

writeFileSync(
  join(releaseDir, "README.md"),
  [
    "# CertScore MCP",
    "",
    "Homebrew-installable CertScore MCP stdio server.",
    "",
    "Configuration:",
    "",
    "```json",
    "{",
    '  "mcpServers": {',
    '    "certscore": {',
    '      "command": "certscore-mcp",',
    '      "env": {',
    '        "CERTSCORE_API_KEY": "<token>",',
    '        "CERTSCORE_BASE_URL": "https://certscore.ai"',
    "      }",
    "    }",
    "  }",
    "}",
    "```",
    "",
    "API key access:",
    "",
    "MCP read tools work with self-serve cs_ro_ keys carrying scan:read and mcp. Sign in at https://certscore.ai, verify email, then request a read-only key from /api/v2/keys/request. MCP scan creation requires scan:create and remains support-gated at support@certscore.ai.",
    "",
    "Verify install:",
    "",
    "```bash",
    "certscore-mcp --version",
    "certscore-mcp --help",
    "CERTSCORE_API_KEY=<token> certscore-mcp doctor",
    "```",
    "",
    "The doctor command checks binary startup, runtime compatibility, API v2 health, and API key presence without printing secrets.",
    "",
    "CertScore outputs are automated public-web observations for review. They are not legal advice, certification, or a compliance determination.",
    ""
  ].join("\n")
);

writeFileSync(
  join(releaseDir, "package.json"),
  `${JSON.stringify({
    name: "certscore-mcp",
    version
  }, null, 2)}\n`
);

rmSync(tarballPath, { force: true });
rmSync(checksumPath, { force: true });
run(tarCommand, [
  "--sort=name",
  "--owner=0",
  "--group=0",
  "--numeric-owner",
  `--mtime=${gitCommitDate}`,
  "-czf",
  tarballPath,
  "-C",
  artifactRoot,
  releaseName
]);
const tarballEntries = output(tarCommand, ["-tzf", tarballPath]).split("\n").filter(Boolean);
const appleDoubleEntry = tarballEntries.find((entry) => entry.split("/").some((part) => part.startsWith("._")));
if (appleDoubleEntry) {
  throw new Error(`Homebrew tarball includes an AppleDouble/xattr sidecar entry: ${appleDoubleEntry}`);
}
const tarVerboseOutput = outputWithStderr(tarCommand, ["-tvf", tarballPath]);
if (/LIBARCHIVE\.xattr\.|(^|\/)\._/.test(tarVerboseOutput)) {
  throw new Error("Homebrew tarball includes AppleDouble or LIBARCHIVE.xattr metadata");
}

const checksum = sha256(tarballPath);
writeFileSync(checksumPath, `${checksum}  ${basename(tarballPath)}\n`);
const releaseUrl = `https://github.com/ergoveritas1-alt/certscore.ai/releases/download/certscore-mcp-v${version}/${basename(tarballPath)}`;
writeFileSync(
  formulaPath,
  [
    "class CertscoreMcp < Formula",
    '  desc "CertScore MCP stdio server for public website risk-signal workflows"',
    '  homepage "https://certscore.ai/developers/mcp"',
    `  url "${releaseUrl}"`,
    `  sha256 "${checksum}"`,
    `  version "${version}"`,
    '  license "UNLICENSED"',
    "",
    '  depends_on "node@22"',
    "",
    "  def install",
    '    libexec.install Dir["libexec/*"]',
    '    (bin/"certscore-mcp").write <<~EOS',
    "      #!/usr/bin/env bash",
    '      exec "#{Formula["node@22"].opt_bin}/node" "#{libexec}/certscore-mcp.mjs" "$@"',
    "    EOS",
    "  end",
    "",
    "  test do",
    '    assert_match version.to_s, shell_output("#{bin}/certscore-mcp --version")',
    "  end",
    "end",
    ""
  ].join("\n")
);

writeFileSync(
  caskPath,
  [
    'cask "certscore-mcp" do',
    `  version "${version}"`,
    `  sha256 "${checksum}"`,
    "",
    `  url "${releaseUrl}"`,
    '  name "CertScore MCP"',
    '  desc "CertScore MCP stdio server for public website risk-signal workflows"',
    '  homepage "https://certscore.ai/developers/mcp"',
    "",
    '  depends_on formula: "node@22"',
    "",
    '  binary "certscore-mcp-v#{version}/bin/certscore-mcp"',
    "",
    "  caveats <<~EOS",
    "    Verify the install with:",
    "      certscore-mcp --version",
    "      certscore-mcp --help",
    "      CERTSCORE_API_KEY=<token> certscore-mcp doctor",
    "  EOS",
    "end",
    ""
  ].join("\n")
);

if (!existsSync(tarballPath)) {
  throw new Error(`Expected tarball was not created: ${tarballPath}`);
}

console.log(`Created ${tarballPath}`);
console.log(`sha256 ${checksum}`);
console.log(`SHA256SUMS ${checksumPath}`);
console.log(`Formula template ${formulaPath}`);
console.log(`Cask template ${caskPath}`);
