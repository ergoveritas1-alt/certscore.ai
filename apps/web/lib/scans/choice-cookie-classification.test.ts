import assert from "node:assert/strict";
import test from "node:test";
import { runtimeGraphUiFixture } from "../../components/scans/runtime-evidence-graph-ui-fixture";
import { projectActionResourceInventory } from "./action-resource-inventory";
import { classifyChoiceCookie } from "./choice-cookie-classification";
import { choiceInventoryCounts } from "./choice-inventory-counts";
import { projectGpcResourceInventory } from "./gpc-resource-inventory";
import { completedActionProjection } from "./test-fixtures/action-execution-projection";
import { observedControlAssessment } from "./test-fixtures/observed-control-assessment";

const expected = new Map([
  ["rl_anonymous_id", "Non-essential"], ["rl_session", "Non-essential"], ["rl_page_init_referrer", "Non-essential"],
  ["osano_consentmanager", "Essential"], ["osano_consentmanager_uuid", "Essential"],
]);
const names = [...expected.keys()];
const domain = "fixture.test";

test("Accept, Reject and GPC retain the five cookies and count three distinct analytics cookies", () => {
  const projection = runtimeGraphUiFixture();
  const graph = projection.graphs.find(g => g.scenario === "gpc")!;
  graph.captureId = projection.scanId + ":gpc_observation";
  graph.edges = [];
  graph.stacks = [];
  graph.nodes = names.map((name, i) => ({
    kind: "cookie", id: name, label: name, observedAtMs: i, outcome: "stored", operation: "snapshot",
    cookie: { name, domain, path: "/", hostOnly: true },
  }));
  graph.nodes.push({...graph.nodes[0]!, id:"repeat", operation:undefined, outcome:"sent"});
  const captures = [projectGpcResourceInventory({scanId:projection.scanId, pageUrl:"https://" + domain, projection})];
  for (const action of ["accept", "reject"] as const) {
    const afterActionStorage = names.map((name, i) => ({
      name, hostname: domain, storageType:"cookie", identityBasis:"cookie_name_domain_path_partition",
      identityHash:String(i).repeat(64), valueHash:"b".repeat(64), purpose:"unknown", nonEssential:false,
    }));
    captures.push(projectActionResourceInventory({pageId:projection.scanId, action, assessment:observedControlAssessment,
      projection:{...completedActionProjection(action), afterActionStorage}}));
  }
  for (const capture of captures) {
    assert.ok(capture);
    assert.deepEqual(new Map(capture.inventory.resources.map(r => [r.name,r.inventoryEvidence])), expected);
    assert.deepEqual(choiceInventoryCounts(capture).breakdown, {nonEssential:3,review:0});
  }
});

test("exact choice-cookie rules leave similar unknown names for review", () => {
  for (const name of ["rl_anonymous_id_backup", "rl_custom", "osano_consentmanager_other", "RL_SESSION"]) {
    assert.equal(classifyChoiceCookie(name, domain).essentiality, "unknown", name);
  }
});
