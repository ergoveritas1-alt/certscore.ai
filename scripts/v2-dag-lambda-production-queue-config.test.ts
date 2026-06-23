import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const productionQueueName = "certscore-v2-dag-local-production-results";
const sharedLocalQueueName = "certscore-v2-dag-local-results";

for (const filePath of ["infra/aws/web-ecs/main.tf", "infra/aws/validation/main.tf"]) {
  test(`${filePath} uses production-only v2 DAG Lambda result queues`, () => {
    const source = readFileSync(filePath, "utf8");
    assert.match(source, new RegExp(productionQueueName, "g"));
    assert.doesNotMatch(
      source,
      new RegExp(`account_id\\}/(?:${sharedLocalQueueName})`)
    );
  });
}
