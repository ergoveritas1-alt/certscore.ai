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

test("validation worker may release and retry retained production results", () => {
  const source = readFileSync("infra/aws/validation/main.tf", "utf8");
  const policyStart = source.indexOf('Sid    = "PollRegionalV2DagLambdaResults"');
  const policyEnd = source.indexOf("ReadRegionalV2DagLambdaArtifacts", policyStart);
  const resultQueuePolicy = source.slice(policyStart, policyEnd);

  assert.match(resultQueuePolicy, /"sqs:ChangeMessageVisibility"/);
  assert.match(resultQueuePolicy, /certscore-v2-dag-local-production-results/);
});
