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
      inflightRedirectFlood: server.urlFor("post-refusal-reject-inflight-redirect-flood"),
      clickFails: server.urlFor("post-refusal-reject-click-fails"),
      staleStorage: server.urlFor("post-refusal-reject-stale-storage"),
      requestFlood: server.urlFor("post-refusal-reject-request-flood"),
      storageWriteFlood: server.urlFor("post-refusal-reject-storage-write-flood"),
      serverCookie: server.urlFor("post-refusal-reject-server-cookie"),
      thirdPartyCookie: server.urlFor("post-refusal-reject-third-party-cookie"),
      tcf: server.urlFor("post-refusal-onetrust-tcf-honored"),
      tcfIgnored: server.urlFor("post-refusal-onetrust-tcf-ignored"),
      namedNoReject: server.urlFor("post-refusal-onetrust-no-reject"),
      contradiction: server.urlFor("post-refusal-onetrust-tcf-contradiction"),
      tcfStale: server.urlFor("post-refusal-onetrust-tcf-stale"),
      tcfDelayedContradiction: server.urlFor("post-refusal-onetrust-tcf-delayed-contradiction"),
      tcfStorageUnavailable: server.urlFor("post-refusal-onetrust-tcf-storage-unavailable"),
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
