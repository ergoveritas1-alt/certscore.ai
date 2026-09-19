import assert from "node:assert/strict";
import test from "node:test";
import { configureMarketplaceLight } from "./configure-marketplace-light";
test("Marketplace rollout preserves capacity and unrelated configuration", () => {
  const task = { family: "certscore-web-mcp", cpu: "512", memory: "1024", containerDefinitions: [{ name: "mcp-http", image: "original", environment: [{ name: "OTHER", value: "preserve" }] }] };
  const enabled = configureMarketplaceLight(task, "enable");
  assert.equal(enabled.cpu, task.cpu);
  assert.equal(enabled.memory, task.memory);
  assert.equal(enabled.containerDefinitions[0]?.image, "original");
  assert.deepEqual(enabled.containerDefinitions[0]?.environment, [{ name: "OTHER", value: "preserve" }, { name: "CERTSCORE_MARKETPLACE_LIGHT_ENABLED", value: "1" }]);
  assert.deepEqual(configureMarketplaceLight(enabled, "enable"), enabled);
  assert.throws(() => configureMarketplaceLight({ ...task, family: "scanner" }, "enable"));
  const web = configureMarketplaceLight({ family: "certscore-web-certscore", containerDefinitions: [{ name: "certscore-web", environment: [] }] }, "enable");
  assert.equal(web.containerDefinitions[0]?.environment?.find(entry => entry.name === "CERTSCORE_MARKETPLACE_EVENTS_TOPIC_ARN")?.value, "arn:aws:sns:us-east-1:199536052647:certscore-marketplace-light-events");
});
