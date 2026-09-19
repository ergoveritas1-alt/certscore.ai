import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

type Task = { family: string; containerDefinitions: { name: string; environment?: { name: string; value: string }[]; [key: string]: unknown }[]; [key: string]: unknown };
export function configureMarketplaceLight(task: Task, mode: string) {
  assert.ok(["preserve", "enable", "disable"].includes(mode));
  if (mode === "preserve") return task;
  assert.ok(["certscore-web-certscore", "certscore-web-mcp"].includes(task.family), "Only web and MCP are eligible");
  const name = task.family === "certscore-web-mcp" ? "mcp-http" : "certscore-web";
  const target = task.containerDefinitions.find(container => container.name === name);
  assert.ok(target, "Expected runtime container");
  const environment = target.environment ?? [];
  assert.equal(new Set(environment.map(entry => entry.name)).size, environment.length);
  const updates = {
    CERTSCORE_MARKETPLACE_LIGHT_ENABLED: mode === "enable" ? "1" : "0",
    ...(name === "certscore-web" ? {
      CERTSCORE_MARKETPLACE_PRODUCT_CODE: "a3p2vfccdufqnuhyn5r8lsx0q",
      CERTSCORE_MARKETPLACE_PRODUCT_ID: "prod-eagvxckgntmxc",
      CERTSCORE_MARKETPLACE_SELLER_ACCOUNT: "199536052647",
      CERTSCORE_MARKETPLACE_EVENTS_TOPIC_ARN: "arn:aws:sns:us-east-1:199536052647:certscore-marketplace-light-events",
    } : {}),
  };
  return { ...task, containerDefinitions: task.containerDefinitions.map(container => container !== target ? container : {
    ...container, environment: [...environment.filter(entry => !(entry.name in updates)), ...Object.entries(updates).map(([name, value]) => ({ name, value }))],
  }) };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [path, mode] = process.argv.slice(2);
  assert.ok(path && mode, "Usage: configure-marketplace-light.ts <task.json> <preserve|enable|disable>");
  writeFileSync(path, JSON.stringify(configureMarketplaceLight(JSON.parse(readFileSync(path, "utf8")), mode)));
  console.log(`Marketplace Light: ${mode}; capacity unchanged.`);
}
