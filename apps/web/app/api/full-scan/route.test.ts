import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getFullScanQueueErrorCode } from "./full-scan-errors";

test("full scan queue errors preserve active scan specificity", () => {
  assert.equal(
    getFullScanQueueErrorCode("A scan is already queued or running for this website."),
    "active_scan_exists"
  );
});

test("full scan queue errors distinguish recent scan cooldowns", () => {
  assert.equal(
    getFullScanQueueErrorCode(
      "Scan requests are limited to one request every 1 minute. Try again after 10:45 AM."
    ),
    "rescan_cooldown"
  );
});

test("full scan queue errors distinguish monthly usage limits", () => {
  assert.equal(getFullScanQueueErrorCode("You’ve already used the Trial plan scan allowance for this month."), "monthly_usage_limit");
  assert.equal(
    getFullScanQueueErrorCode("You’ve reached the Pro scan limit of 500 for this billing period."),
    "monthly_usage_limit"
  );
});

test("full scan queue errors do not expose a website-count limit", () => {
  assert.notEqual(getFullScanQueueErrorCode("You’ve reached the Trial plan website limit."), "domain_limit");
  assert.equal(
    getFullScanQueueErrorCode("This domain is already connected to your workspace."),
    "domain_already_connected"
  );
});

test("full scan queue errors keep queue and domain failures separate", () => {
  assert.equal(getFullScanQueueErrorCode("Full scan queue availability is degraded."), "scan_queue_unavailable");
  assert.equal(getFullScanQueueErrorCode("Enter a valid website domain."), "invalid_domain");
});

test("workspace scan quota uses one unit per normal scan entry point", () => {
  const createFullScanSource = readFileSync("apps/web/server/scans/create-full-scan.ts", "utf8");
  const dashboardUsageSource = readFileSync("apps/web/server/dashboard/get-dashboard-scan-usage.ts", "utf8");
  const createDomainSource = readFileSync("apps/web/server/domains/create-domain.ts", "utf8");
  const rescanSource = readFileSync("apps/web/server/scans/rescan-domain.ts", "utf8");
  const scheduledSource = readFileSync("apps/web/server/scheduling/run-scheduled-monitoring.ts", "utf8");

  assert.match(createFullScanSource, /currentUsage >= monthlyLimit/);
  assert.match(createFullScanSource, /currentUsage \+ 1/);
  assert.match(dashboardUsageSource, /count\(\*\) filter/);
  assert.doesNotMatch(createFullScanSource, /currentUsage \+ pagesRequested/);
  assert.doesNotMatch(dashboardUsageSource, /sum\(greatest\(pages_requested, 1\)\)/);
  assert.doesNotMatch(createDomainSource, /maxDomains/);
  assert.doesNotMatch(createDomainSource, /website limit/i);
  assert.doesNotMatch(`${createDomainSource}\n${rescanSource}\n${scheduledSource}`, /enforceMonthlyUsageLimit: false/);
});

test("full scan responses keep post-queue failures attached to the created scan", () => {
  const routeSource = readFileSync("apps/web/app/api/full-scan/route.ts", "utf8");
  const queueSource = readFileSync("apps/web/server/scans/create-full-scan.ts", "utf8");

  assert.match(routeSource, /scans\.filter\(\(scan\) => Boolean\(scan\.scanId\)\)/);
  assert.doesNotMatch(routeSource, /!scan\.error && scan\.scanId/);
  assert.match(queueSource, /Scan created but event logging failed\.",\s+scanId: scan\.id/);
  assert.match(queueSource, /Scan created but latest scan update failed\.",\s+scanId: scan\.id/);
});

test("validation repository keeps React-backed admin auth outside worker import paths", () => {
  const repositorySource = readFileSync("apps/web/server/validation/repository.ts", "utf8");

  assert.doesNotMatch(repositorySource, /^import .*from "\.\/auth";/m);
  assert.match(
    repositorySource,
    /async function requireAdmin\(\) \{\s+const \{ requireValidationAdminContext \} = await import\("\.\/auth"\);/
  );
});
