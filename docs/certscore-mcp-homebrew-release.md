# CertScore MCP Homebrew Release

CertScore MCP is distributed to external macOS MCP clients through Homebrew. The release artifact installs a persistent `certscore-mcp` command without requiring an npm account or npm package ownership.

CertScore outputs are automated public-web observations for review. They are not legal advice, certification, or a compliance determination.

## Build

Release artifacts are built by GitHub Actions on `ubuntu-latest` from tags shaped `certscore-mcp-vX.Y.Z`. The pipeline checks out the
tag, builds the MCP bundle, creates a deterministic GNU tarball, verifies there are no AppleDouble or xattr entries, writes
`SHA256SUMS`, uploads both assets to the GitHub release, and opens the Homebrew cask/formula bump PR.

For local rehearsal from the WC01 repo root:

```bash
pnpm mcp:certscore:homebrew:build
```

The build creates:

- `artifacts/certscore-mcp-homebrew/certscore-mcp-v{version}.tar.gz`
- `artifacts/certscore-mcp-homebrew/SHA256SUMS`
- `artifacts/certscore-mcp-homebrew/certscore-mcp.rb`
- `artifacts/certscore-mcp-homebrew/certscore-mcp-cask.rb`

The tracked Homebrew files live at:

- `Casks/certscore-mcp.rb`
- `Formula/certscore-mcp.rb`

The tarball contains:

- `bin/certscore-mcp`
- `libexec/certscore-mcp.mjs`
- `README.md`

## Release

1. Bump `packages/certscore-mcp/package.json` and `CHANGELOG.md`.
2. Tag the source commit as `certscore-mcp-v{version}`.
3. Let `.github/workflows/certscore-mcp-linux-release.yml` create the release tarball and `SHA256SUMS` on Ubuntu.
4. Review and merge the cask/formula bump PR opened by the workflow.
5. Bump the well-known manifest only after the release asset and cask/formula bump exist.

Expected user install:

```bash
brew tap ergoveritas1-alt/certscore https://github.com/ergoveritas1-alt/certscore.ai
brew install --cask certscore-mcp
```

Homebrew is the current public install path. npm publication is intentionally not required for release.

## MCP Client Config

```json
{
  "mcpServers": {
    "certscore": {
      "command": "certscore-mcp",
      "env": {
        "CERTSCORE_API_KEY": "<token>",
        "CERTSCORE_BASE_URL": "https://certscore.ai"
      }
    }
  }
}
```

## Verify

```bash
certscore-mcp --version
certscore-mcp --help
CERTSCORE_API_KEY=<token> certscore-mcp doctor
```

The doctor command checks the installed command, runtime compatibility, API v2 health, and API key presence without printing secrets. It does not create scans or inspect raw scanner artifacts.

For local smoke testing before release:

```bash
pnpm --filter certscore-mcp test
pnpm --filter certscore-mcp typecheck
pnpm --filter certscore-mcp build
pnpm mcp:certscore:homebrew:build
(cd artifacts/certscore-mcp-homebrew && sha256sum --check SHA256SUMS)
artifacts/certscore-mcp-homebrew/certscore-mcp-v$(node -e 'console.log(JSON.parse(require("fs").readFileSync("packages/certscore-mcp/package.json","utf8")).version)')/bin/certscore-mcp --version
artifacts/certscore-mcp-homebrew/certscore-mcp-v$(node -e 'console.log(JSON.parse(require("fs").readFileSync("packages/certscore-mcp/package.json","utf8")).version)')/bin/certscore-mcp --help
artifacts/certscore-mcp-homebrew/certscore-mcp-v$(node -e 'console.log(JSON.parse(require("fs").readFileSync("packages/certscore-mcp/package.json","utf8")).version)')/bin/certscore-mcp doctor
```

For an end-to-end production operator smoke after release:

```bash
pnpm ops:smoke:mcp-production
```

The production smoke uses the installed Homebrew command, creates a short-lived preview key, stores only the key hash in production through the approved ECS/Fargate one-off task pattern, verifies non-empty findings and pre-consent cookies/trackers rows through MCP, and revokes the temporary key afterward. It is a public integration smoke, not a scanner/report pipeline change.

## Troubleshooting

- Command not found: run the Homebrew install again and confirm Homebrew's bin directory is on `PATH`.
- Missing API key: set `CERTSCORE_API_KEY` in the MCP client environment and rerun `certscore-mcp doctor`.
- Bad token: rotate the key or request a scoped API/MCP key from `support@certscore.ai`.
- API unreachable: check `CERTSCORE_BASE_URL` and verify `https://certscore.ai/api/v2/health`.
- Homebrew tap stale: run `brew update` and reinstall the cask.
- Old cached release: run `brew reinstall --cask certscore-mcp` after updating the tap.
