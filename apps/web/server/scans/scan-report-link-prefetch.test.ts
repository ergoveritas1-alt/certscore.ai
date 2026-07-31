import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const reportLinkSources = [
  "apps/web/app/app/browser-scans/setup/page.tsx",
  "apps/web/app/app/changes/page.tsx",
  "apps/web/app/app/domains/[domainId]/page.tsx",
  "apps/web/app/app/scans/page.tsx",
  "apps/web/app/app/trackers/page.tsx",
  "apps/web/components/dashboard/overview-scan-history-card.tsx"
];

test("heavy authenticated report links disable automatic route prefetching", async () => {
  for (const sourcePath of reportLinkSources) {
    const source = await readFile(sourcePath, "utf8");
    const reportLinks = [...source.matchAll(/href=\{`\/app\/scans\/\$\{[^}]+\}`\}/g)];

    assert.ok(reportLinks.length > 0, `expected report links in ${sourcePath}`);
    for (const reportLink of reportLinks) {
      const linkProps = source.slice(reportLink.index, reportLink.index + 400);
      assert.match(linkProps, /\bprefetch=\{false\}/, `expected report prefetch to be disabled in ${sourcePath}`);
    }
  }
});
