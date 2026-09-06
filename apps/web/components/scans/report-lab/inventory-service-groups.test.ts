import assert from "node:assert/strict";
import test from "node:test";
import { consolidateInventoryServices, groupInventoryServices } from "./inventory-service-groups";
import type { ShadowReportData } from "./shadow-report-data";

type Row = ShadowReportData["inventory"][number];
const row = (name: string, type: string): Row => ({ name, type, vendor: "Facebook", controllingEntity: "Meta" } as Row);

test("groups matching service request and iframe without dropping or changing evidence", () => {
  const request = row("Facebook Page Plugin", "Tracker / request");
  const iframe = row("Facebook Page Plugin", "Embed / iframe");
  const other = row("Other product", "Tracker / request");
  const groups = groupInventoryServices([request, other, iframe]);
  assert.deepEqual(groups, [[request, iframe], [other]]);
  assert.equal(groups[0]![0], request);
  assert.equal(groups[0]![1], iframe);
});

test("shows the request once and retains iframe evidence inside Inspect without changing classification", () => {
  const request = { ...row("Facebook Page Plugin", "Tracker / request"), observed: "9.33s", evidence: "Non-essential", evidenceJson: { firstSeenMs: 9330 } };
  const iframe = { ...row("Facebook Page Plugin", "Embed / iframe"), observed: "10.88s", evidence: "Contextual" };
  const [merged] = consolidateInventoryServices([request, iframe]);
  assert.ok(merged);
  assert.equal(consolidateInventoryServices([request, iframe]).length, 1);
  assert.equal(merged.evidence, "Non-essential");
  assert.equal(merged.observed, "9.33s");
  assert.deepEqual(merged.evidenceJson?.supportingObservations, [iframe]);
  assert.deepEqual(request.evidenceJson, { firstSeenMs: 9330 });
});

test("does not group vendor-only matches, cookies, missing identities or old request-only rows", () => {
  for (const rows of [
    [row("Fonts", "Tracker / request"), row("Maps", "Embed / iframe")],
    [row("Plugin", "Cookie / storage"), row("Plugin", "Embed / iframe")],
    [row("Not retained", "Tracker / request"), row("Not retained", "Embed / iframe")],
    [row("Plugin", "Tracker / request"), row("Plugin", "Tracker / request")],
  ]) assert.deepEqual(groupInventoryServices(rows), rows.map(item => [item]));
});
