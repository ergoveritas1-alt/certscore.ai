import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("runtime bootstrap keeps pending handler work alive until a response is posted", async () => {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  const tempParent = path.join(repoRoot, "apps/v2-dag-lambda/tmp");
  await mkdir(tempParent, { recursive: true });
  const tempRoot = await mkdtemp(path.join(tempParent, "runtime-bootstrap-"));
  const handlerDir = path.join(tempRoot, "src");
  await mkdir(handlerDir, { recursive: true });
  await writeFile(path.join(handlerDir, "slow-handler.js"), `
export async function handler(_event, context) {
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 75);
    timer.unref();
  });
  return { ok: true, requestId: context.awsRequestId };
}
`, "utf8");

  let responseBody = "";
  let childExited: { code: number | null; signal: NodeJS.Signals | null } | null = null;
  const stderrChunks: string[] = [];
  const server = createServer((request, response) => {
    if (request.method === "GET" && request.url === "/2018-06-01/runtime/invocation/next") {
      response.writeHead(200, {
        "content-type": "application/json",
        "lambda-runtime-aws-request-id": "request-bootstrap-test-1"
      });
      response.end(JSON.stringify({ scanId: "scan-bootstrap-test" }));
      return;
    }

    if (request.method === "POST" && request.url === "/2018-06-01/runtime/invocation/request-bootstrap-test-1/response") {
      request.setEncoding("utf8");
      request.on("data", (chunk) => {
        responseBody += chunk;
      });
      request.on("end", () => {
        response.writeHead(202);
        response.end("{}");
      });
      return;
    }

    response.writeHead(404);
    response.end();
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const child = spawn(process.execPath, [
    path.join(repoRoot, "apps/v2-dag-lambda/runtime-bootstrap.mjs"),
    path.relative(path.join(repoRoot, "apps/v2-dag-lambda"), path.join(tempRoot, "src/slow-handler.handler")).replace(/\\/g, "/")
  ], {
    cwd: path.join(repoRoot, "apps/v2-dag-lambda"),
    env: {
      ...process.env,
      AWS_LAMBDA_RUNTIME_API: `127.0.0.1:${address.port}`
    },
    stdio: ["ignore", "ignore", "pipe"]
  });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => stderrChunks.push(chunk));
  child.on("exit", (code, signal) => {
    childExited = { code, signal };
  });

  try {
    await waitFor(() => responseBody.length > 0, 2_000);
    child.kill("SIGTERM");
    await new Promise<void>((resolve) => child.once("exit", () => resolve()));

    assert.deepEqual(JSON.parse(responseBody), {
      ok: true,
      requestId: "request-bootstrap-test-1"
    });
    assert.equal(childExited?.signal, "SIGTERM");
    assert.doesNotMatch(stderrChunks.join(""), /unsettled top-level await|Runtime\.ExitError/i);
  } finally {
    child.kill("SIGKILL");
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(tempRoot, { force: true, recursive: true });
  }
});

async function waitFor(predicate: () => boolean, timeoutMs: number) {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("Timed out waiting for runtime bootstrap response.");
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
