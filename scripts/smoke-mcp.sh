#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." >/dev/null 2>&1 && pwd)"
VERSION="$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).version)' "$REPO_ROOT/packages/certscore-mcp/package.json")"
COMMAND="${CERTSCORE_MCP_COMMAND:-$REPO_ROOT/artifacts/certscore-mcp-homebrew/certscore-mcp-v${VERSION}/bin/certscore-mcp}"

if [[ ! -x "$COMMAND" ]]; then
  (cd "$REPO_ROOT" && pnpm mcp:certscore:homebrew:build >/dev/null)
fi

if [[ ! -x "$COMMAND" ]]; then
  echo "CertScore MCP command is not executable: $COMMAND" >&2
  echo "Set CERTSCORE_MCP_COMMAND=/path/to/certscore-mcp or build the Homebrew artifact." >&2
  exit 1
fi

clean_env() {
  env -i \
    HOME="${HOME:-/tmp}" \
    PATH="${PATH:-/usr/bin:/bin}" \
    COMMAND="${COMMAND}" \
    "$@"
}

clean_env "$COMMAND" --version | grep -F "$VERSION" >/dev/null
clean_env "$COMMAND" --help | grep -F "certscore-mcp" >/dev/null
clean_env "$COMMAND" doctor | grep -F "CERTSCORE_API_KEY is not set" >/dev/null

COMMAND="$COMMAND" clean_env node --input-type=module <<'NODE'
import { spawn } from "node:child_process";
import assert from "node:assert/strict";

const child = spawn(process.env.COMMAND, [], {
  env: {
    HOME: process.env.HOME ?? "/tmp",
    PATH: process.env.PATH ?? "/usr/bin:/bin",
    CERTSCORE_BASE_URL: "http://127.0.0.1:9",
    CERTSCORE_REQUEST_TIMEOUT_MS: "1000"
  },
  stdio: ["pipe", "pipe", "pipe"]
});

let buffer = "";
const pending = new Map();

function send(message) {
  child.stdin.write(`${JSON.stringify(message)}\n`);
}

function request(method, params = {}) {
  const id = pending.size + 1;
  send({ jsonrpc: "2.0", id, method, params });
  return new Promise((resolve, reject) => {
    pending.set(id, { reject, resolve });
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`${method} timed out`));
      }
    }, 10_000);
  });
}

function consumeMessages() {
  while (true) {
    const lineEnd = buffer.indexOf("\n");
    if (lineEnd === -1) {
      return;
    }
    const line = buffer.slice(0, lineEnd).replace(/\r$/, "");
    buffer = buffer.slice(lineEnd + 1);
    if (!line) {
      continue;
    }
    const message = JSON.parse(line);
    if (message.id !== undefined && pending.has(message.id)) {
      const waiter = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) {
        waiter.reject(new Error(JSON.stringify(message.error)));
      } else {
        waiter.resolve(message.result);
      }
    }
  }
}

child.stdout.on("data", (chunk) => {
  buffer += chunk.toString("utf8");
  consumeMessages();
});

let stderr = "";
child.stderr.on("data", (chunk) => {
  stderr += chunk.toString("utf8");
});

try {
  await request("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: {
      name: "certscore-mcp-clean-env-smoke",
      version: "0.0.0"
    }
  });
  send({ jsonrpc: "2.0", method: "notifications/initialized" });

  const tools = await request("tools/list");
  assert.equal(tools.tools.length, 12);
  assert.ok(tools.tools.some((tool) => tool.name === "get_evidence"));
  for (const tool of tools.tools) {
    assert.ok(tool.annotations, `${tool.name} missing annotations`);
  }

  const failed = await request("tools/call", {
    name: "get_scan",
    arguments: {
      scanId: "00000000-0000-4000-8000-000000000000"
    }
  });
  assert.equal(failed.isError, true);

  child.stdin.end();
  child.kill();
} catch (error) {
  child.kill();
  console.error(stderr);
  throw error;
}
NODE

echo "CertScore MCP clean-env smoke passed for ${COMMAND}."
