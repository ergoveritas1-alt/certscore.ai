# MCP Light GPT compatibility benchmark

This benchmark exercises the deployed no-account MCP Light workflow as a well-behaved GPT, ChatGPT, or Codex-style MCP client:

```text
certscore_scan_site
→ if pending, wait retryAfterSeconds and call certscore_get_scan_status sequentially
→ at completed or completed_limited, call certscore_get_scan_bundle
```

It initializes a fresh MCP session per case, discovers tools, submits exactly one scan request, records HTTP and MCP latency, polls without overlap, validates the final bundle against the stable scan ID and target, and produces JSON plus Markdown reports.

The default matrix contains 25 sequential cases. It uses an owned canary, a small public-site sample, immediate repeats for reuse coverage, controlled example-domain substitution, legacy wait-parameter cases, and invalid inputs. Default concurrency is one and the harness refuses concurrency above two.

Run the default production benchmark:

```bash
pnpm mcp:light:benchmark
```

Preview the target matrix without network calls:

```bash
pnpm mcp:light:benchmark -- --dry-run
```

Run only selected case IDs:

```bash
pnpm mcp:light:benchmark -- --case-ids invalid-malformed,invalid-missing-url
```

Re-render JSON and Markdown after updating analysis logic without making network calls:

```bash
pnpm mcp:light:benchmark -- \
  --analyze-json artifacts/mcp-light-gpt-benchmark/latest.json \
  --output-json artifacts/mcp-light-gpt-benchmark/latest.json \
  --output-markdown artifacts/mcp-light-gpt-benchmark/latest.md
```

Use a custom target file and output paths:

```bash
pnpm mcp:light:benchmark -- \
  --targets scripts/fixtures/mcp-light-gpt-benchmark-targets.json \
  --count 25 \
  --concurrency 1 \
  --timeout-seconds 600 \
  --output-json artifacts/mcp-light-gpt-benchmark/latest.json \
  --output-markdown artifacts/mcp-light-gpt-benchmark/latest.md
```

Target files are JSON arrays with this shape:

```json
[
  { "id": "site-1", "target": "https://example.org", "category": "normal_public_site" },
  { "id": "site-legacy", "target": "https://example.org", "category": "legacy_wait_compatibility", "legacyWait": true },
  { "id": "invalid-missing", "omitTarget": true, "category": "invalid_input" }
]
```

No secrets are required. Telemetry delivery is intentionally not observable from the client response; reports retain the unique client identifier, MCP session ID, timestamps, HTTP traces, and returned request/trace headers for optional server-log correlation.
