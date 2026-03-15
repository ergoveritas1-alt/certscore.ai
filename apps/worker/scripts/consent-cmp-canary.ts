import { randomUUID } from "node:crypto";
import { runConsentProbe } from "../src/scan/snapshot/build-snapshot-bundle";

const CANARY_GROUPS = {
  vendor_homepages: [
    "onetrust.com",
    "cookiebot.com",
    "trustarc.com",
    "usercentrics.com",
    "iubenda.com",
    "example.com"
  ],
  real_world_candidates: [
    "atlassian.com",
    "microsoft.com",
    "shopify.com",
    "airbnb.com",
    "cnn.com",
    "nbcnews.com",
    "google.com"
  ],
  visibility_probe_candidates: [
    "onetrust.com",
    "trustarc.com",
    "iubenda.com",
    "atlassian.com",
    "shopify.com",
    "airbnb.com",
    "cnn.com",
    "nbcnews.com"
  ]
} as const;

function toSummary(result: Awaited<ReturnType<typeof runConsentProbe>>) {
  return {
    ...result
  };
}

async function main() {
  const args = process.argv.slice(2).filter(Boolean);
  const useAll = args.includes("--all");
  const onlyVisible = args.includes("--only-visible");
  const disableSweep = args.includes("--single-profile");
  const concurrencyArg = args.find((arg) => arg.startsWith("--concurrency="));
  const groupArg = args.find((arg) => arg.startsWith("--group="));
  const explicitDomains = args.filter((arg) => !arg.startsWith("--"));
  const concurrency = Math.max(1, Number.parseInt(concurrencyArg?.split("=", 2)[1] ?? "3", 10) || 3);
  const selectedGroup = groupArg?.split("=", 2)[1] as keyof typeof CANARY_GROUPS | undefined;
  const targets =
    explicitDomains.length > 0
      ? explicitDomains
      : useAll
        ? [...CANARY_GROUPS.vendor_homepages, ...CANARY_GROUPS.real_world_candidates]
        : selectedGroup && CANARY_GROUPS[selectedGroup]
          ? [...CANARY_GROUPS[selectedGroup]]
          : [...CANARY_GROUPS.real_world_candidates];
  const results = new Array<unknown>(targets.length);
  let cursor = 0;

  const worker = async () => {
    while (cursor < targets.length) {
      const index = cursor++;
      const domain = targets[index];
      if (!domain) {
        continue;
      }
      try {
        const result = await runConsentProbe({
          domain,
          domainId: randomUUID(),
          organizationId: null,
          profileSweep: !disableSweep,
          scanId: randomUUID()
        });
        results[index] = {
          domain: result.finalUrl ? new URL(result.finalUrl).hostname : domain,
          ...toSummary(result)
        };
      } catch (error) {
        results[index] = {
          domain,
          error: error instanceof Error ? error.message : "Unknown error"
        };
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, targets.length) }, () => worker()));

  const output = onlyVisible
    ? results.filter(
        (entry) =>
          typeof entry === "object" &&
          entry !== null &&
          "cookieBannerPresent" in entry &&
          (entry as { cookieBannerPresent?: boolean }).cookieBannerPresent === true
      )
    : results;

  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
