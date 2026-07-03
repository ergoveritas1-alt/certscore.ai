import assert from "node:assert/strict";
import test from "node:test";
import { restrictLocalV2RunViaLambdaForUser, restrictScanFromForUser } from "./restricted-scan-options";

test("non-admin users are forced to Lambda by default", () => {
  assert.equal(
    restrictLocalV2RunViaLambdaForUser({
      canUseRestrictedScanOptions: false,
      env: {
        NEXT_PUBLIC_APP_URL: "http://localhost:3000",
        NODE_ENV: "development"
      },
      localV2DagRunViaLambda: false
    }),
    true
  );
});

test("non-admin localhost scans can be routed to the local queue by feature flag", () => {
  assert.equal(
    restrictLocalV2RunViaLambdaForUser({
      canUseRestrictedScanOptions: false,
      env: {
        CERTSCORE_LOCALHOST_FULL_SCAN_QUEUE_ENABLED: "true",
        NEXT_PUBLIC_APP_URL: "http://localhost:3000",
        NODE_ENV: "development"
      },
      localV2DagRunViaLambda: true
    }),
    false
  );
  assert.equal(
    restrictLocalV2RunViaLambdaForUser({
      canUseRestrictedScanOptions: false,
      env: {
        NEXT_PUBLIC_CERTSCORE_LOCALHOST_FULL_SCAN_QUEUE_ENABLED: "true",
        NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3000",
        NODE_ENV: "development"
      },
      localV2DagRunViaLambda: true
    }),
    false
  );
});

test("localhost queue flag is ignored outside localhost and in production", () => {
  assert.equal(
    restrictLocalV2RunViaLambdaForUser({
      canUseRestrictedScanOptions: false,
      env: {
        CERTSCORE_LOCALHOST_FULL_SCAN_QUEUE_ENABLED: "true",
        NEXT_PUBLIC_APP_URL: "https://certscore.ai",
        NODE_ENV: "development"
      },
      localV2DagRunViaLambda: false
    }),
    true
  );
  assert.equal(
    restrictLocalV2RunViaLambdaForUser({
      canUseRestrictedScanOptions: false,
      env: {
        CERTSCORE_LOCALHOST_FULL_SCAN_QUEUE_ENABLED: "true",
        NEXT_PUBLIC_APP_URL: "http://localhost:3000",
        NODE_ENV: "production"
      },
      localV2DagRunViaLambda: false
    }),
    true
  );
});

test("restricted scan users keep explicit Lambda preference", () => {
  assert.equal(
    restrictLocalV2RunViaLambdaForUser({
      canUseRestrictedScanOptions: true,
      localV2DagRunViaLambda: false
    }),
    false
  );
  assert.equal(
    restrictLocalV2RunViaLambdaForUser({
      canUseRestrictedScanOptions: true,
      localV2DagRunViaLambda: true
    }),
    true
  );
});

test("non-admin users cannot select restricted scan regions", () => {
  assert.equal(restrictScanFromForUser({ canUseRestrictedScanOptions: false, scanFrom: "eu_de" }), "eu_ie");
  assert.equal(restrictScanFromForUser({ canUseRestrictedScanOptions: true, scanFrom: "eu_de" }), "eu_de");
});
