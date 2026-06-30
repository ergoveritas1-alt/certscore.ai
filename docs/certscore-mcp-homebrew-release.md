# CertScore MCP Homebrew Release

CertScore MCP is distributed to external MCP clients as a Homebrew-installed `certscore-mcp` command. This avoids requiring npm package publishing for the MCP server, SDK, or API contracts.

CertScore outputs are automated public-web observations for review. They are not legal advice, certification, or a compliance determination.

## Build

From the WC01 repo root:

```bash
pnpm mcp:certscore:homebrew:build
```

The build creates:

- `artifacts/certscore-mcp-homebrew/certscore-mcp-v0.1.0.tar.gz`
- `artifacts/certscore-mcp-homebrew/certscore-mcp.rb`

The tracked formula lives at:

- `Formula/certscore-mcp.rb`

The tarball contains:

- `bin/certscore-mcp`
- `libexec/certscore-mcp.mjs`
- `README.md`

## Release

1. Run `pnpm mcp:certscore:homebrew:build`.
2. Confirm `Formula/certscore-mcp.rb` matches `artifacts/certscore-mcp-homebrew/certscore-mcp.rb`.
3. Commit and push the formula/source changes.
4. Create a GitHub release named `certscore-mcp-v0.1.0`.
5. Upload `artifacts/certscore-mcp-homebrew/certscore-mcp-v0.1.0.tar.gz`.

Expected user install:

```bash
brew tap ergoveritas1-alt/certscore https://github.com/ergoveritas1-alt/certscore.ai
brew install certscore-mcp
```

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
CERTSCORE_API_KEY=<token> certscore-mcp
```

For local smoke testing before release:

```bash
pnpm --filter @certscore/mcp test
pnpm --filter @certscore/mcp typecheck
pnpm --filter @certscore/mcp build
pnpm mcp:certscore:homebrew:build
```
