#!/usr/bin/env node
import { startStaticFixtureServer } from "../test-fixtures/static-server.js";

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

async function main(): Promise<void> {
  const port = parsePort(process.argv.slice(2));
  const server = await startStaticFixtureServer({ port });

  console.log(JSON.stringify({
    baseUrl: server.baseUrl,
    fixtures: {
      honored: server.urlFor("post-refusal-reject-honored"),
      ignored: server.urlFor("post-refusal-reject-ignored"),
      missing: server.urlFor("post-refusal-reject-missing"),
      unconfirmed: server.urlFor("post-refusal-reject-unconfirmed"),
      inflight: server.urlFor("post-refusal-reject-inflight"),
      tcf: server.urlFor("post-refusal-onetrust-tcf-honored"),
      contradiction: server.urlFor("post-refusal-onetrust-tcf-contradiction"),
      cookiebot: server.urlFor("post-refusal-cookiebot-fast"),
      usercentrics: server.urlFor("post-refusal-usercentrics-delayed"),
    },
  }, null, 2));

  await new Promise<void>((resolve) => {
    process.once("SIGINT", resolve);
    process.once("SIGTERM", resolve);
  });
  await server.close();
}

function parsePort(argv: string[]): number {
  const index = argv.indexOf("--port");
  const raw = index >= 0 ? argv[index + 1] : undefined;
  const parsed = Number(raw ?? 4178);
  if (!Number.isInteger(parsed) || parsed < 1024 || parsed > 65_535) {
    throw new Error("--port must be an integer from 1024 through 65535.");
  }
  return parsed;
}
