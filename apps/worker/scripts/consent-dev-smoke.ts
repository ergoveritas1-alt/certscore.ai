import { randomUUID } from "node:crypto";
import { runConsentProbe } from "../src/scan/snapshot/build-snapshot-bundle";

async function main() {
  const args = process.argv.slice(2).filter(Boolean);
  const concurrencyArg = args.find((arg) => arg.startsWith("--concurrency="));
  const disableSweep = args.includes("--single-profile");
  const domains = args.filter((arg) => !arg.startsWith("--")).map((domain) => domain.trim()).filter(Boolean);
  const concurrency = Math.max(1, Number.parseInt(concurrencyArg?.split("=", 2)[1] ?? "2", 10) || 2);

  if (domains.length === 0) {
    throw new Error("Usage: consent-dev-smoke.ts [--concurrency=N] [--single-profile] <domain> [domain...]");
  }

  const results = new Array<unknown>(domains.length);
  let cursor = 0;

  const worker = async () => {
    while (cursor < domains.length) {
      const index = cursor++;
      const domain = domains[index];
      if (!domain) {
        continue;
      }
      const scanId = randomUUID();
      try {
        const result = await runConsentProbe({
          domain,
          domainId: randomUUID(),
          organizationId: null,
          profileSweep: !disableSweep,
          scanId
        });
        results[index] = {
          domain: result.finalUrl ? new URL(result.finalUrl).hostname : domain,
          ...result
        };
      } catch (error) {
        results[index] = {
          domain,
          error: error instanceof Error ? error.message : "Unknown error"
        };
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, domains.length) }, () => worker()));

  console.log(JSON.stringify(results, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
