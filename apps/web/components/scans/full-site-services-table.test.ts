import assert from "node:assert/strict";
import test from "node:test";
import { summarizeService } from "./full-site-services-table";

type Resource = Parameters<typeof summarizeService>[0][number];
const resource = (priority: string, time: number | null, domain: string | null, relationships: string[]) => ({ inventoryEvidence: priority, occurrence: { firstSeenMs: time, domain }, relationships }) as Resource;

test("service summaries use member classifications and page-relative observations", () => {
  const result = summarizeService([
    resource("Essential", 80, "a.example", ["first_party"]),
    resource("Review", 0, "b.example", ["third_party"]),
    resource("Non-essential", 200, "a.example", ["third_party"]),
    resource("Non-essential", null, null, []),
  ]);
  assert.equal(result.priority, "Non-essential");
  assert.equal(result.priorityCount, 2);
  assert.equal(result.firstSeen, 0);
  assert.deepEqual(result.domains, ["a.example", "b.example"]);
  assert.equal(result.relationship, "Mixed");
  assert.match(result.relationshipHint, /some site relationships are not available/);
});
test("missing facts remain unavailable and contextual precedes essential", () => {
  const empty = summarizeService([resource("unknown", null, null, [])]);
  assert.equal(empty.priority, undefined);
  assert.equal(empty.firstSeen, undefined);
  assert.equal(empty.relationship, undefined);
  assert.deepEqual(empty.domains, []);
  assert.equal(summarizeService([resource("Essential", null, null, []), resource("Contextual", null, null, [])]).priority, "Contextual");
});
