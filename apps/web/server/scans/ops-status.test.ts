import assert from "node:assert/strict";
import test from "node:test";

import { EXECUTIVE_SUMMARY_TOP_FINDING_IDS } from "../../lib/scans/rank-findings";
import { OPS_SCAN_STATUS_FINDING_IDS } from "./ops-status-finding-ids";

test("ops scan status finding counts cover every executive top-finding ID", () => {
  assert.deepEqual(OPS_SCAN_STATUS_FINDING_IDS, EXECUTIVE_SUMMARY_TOP_FINDING_IDS);
});
