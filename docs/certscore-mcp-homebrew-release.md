# CertScore MCP Homebrew Release

CertScore MCP is distributed to external macOS MCP clients through Homebrew. The release artifact installs a persistent `certscore-mcp` command without requiring an npm account or npm package ownership.

CertScore outputs are automated public-web observations for review. They are not legal advice, certification, or a compliance determination.

## Build

From the WC01 repo root:

```bash
pnpm mcp:certscore:homebrew:build
```

The build creates:

- `artifacts/certscore-mcp-homebrew/certscore-mcp-v0.1.4.tar.gz`
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

1. Run `pnpm mcp:certscore:homebrew:build`.
2. Confirm `Casks/certscore-mcp.rb` matches `artifacts/certscore-mcp-homebrew/certscore-mcp-cask.rb`.
3. Confirm `Formula/certscore-mcp.rb` matches `artifacts/certscore-mcp-homebrew/certscore-mcp.rb`.
4. Commit and push the cask/formula/source changes.
5. Create a GitHub release named `certscore-mcp-v0.1.4`.
6. Upload `artifacts/certscore-mcp-homebrew/certscore-mcp-v0.1.4.tar.gz`.

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
artifacts/certscore-mcp-homebrew/certscore-mcp-v0.1.4/bin/certscore-mcp --version
artifacts/certscore-mcp-homebrew/certscore-mcp-v0.1.4/bin/certscore-mcp --help
artifacts/certscore-mcp-homebrew/certscore-mcp-v0.1.4/bin/certscore-mcp doctor
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
