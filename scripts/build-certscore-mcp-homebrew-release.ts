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
const formulaPath = join(artifactRoot, "certscore-mcp.rb");

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: "inherit"
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status ?? "unknown"}`);
  }
}

function sha256(path: string) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

rmSync(releaseDir, { force: true, recursive: true });
mkdirSync(join(releaseDir, "bin"), { recursive: true });
mkdirSync(join(releaseDir, "libexec"), { recursive: true });

run("pnpm", ["--filter", "@certscore/api-contracts", "build"]);
run("pnpm", ["--filter", "@certscore/sdk", "build"]);
run("pnpm", ["--filter", "@certscore/mcp", "build"]);

run("pnpm", [
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
    'exec node "$(dirname "$0")/../libexec/certscore-mcp.mjs" "$@"',
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
    "CertScore outputs are automated public-web observations for review. They are not legal advice, certification, or a compliance determination.",
    ""
  ].join("\n")
);

rmSync(tarballPath, { force: true });
run("tar", ["-czf", tarballPath, "-C", artifactRoot, releaseName]);

const checksum = sha256(tarballPath);
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

if (!existsSync(tarballPath)) {
  throw new Error(`Expected tarball was not created: ${tarballPath}`);
}

console.log(`Created ${tarballPath}`);
console.log(`sha256 ${checksum}`);
console.log(`Formula template ${formulaPath}`);
