import assert from "node:assert/strict";
import test from "node:test";
import { assertGraphReleaseScanner, assertGraphReleaseService, graphReleaseRequirements, graphRolloutTaskDefinition, type Rollout } from "./runtime-graph-rollout";
const sha = "a".repeat(40);
const rollout: Rollout = { mode: "project", percent: 5, presentation: "on", canaryScanIds: [], expectedWebSha: sha };
const fixture = () => ({ family: "certscore-web-certscore", cpu: "1024", memory: "2048", taskRoleArn: "retained-role", taskDefinitionArn: "old", revision: 1, status: "ACTIVE", containerDefinitions: [{ name: "certscore-web", image: `199536052647.dkr.ecr.us-west-1.amazonaws.com/certscore-web-web:${sha}`, secrets: [{ name: "SECRET", valueFrom: "retained-reference" }], environment: [{ name: "EXISTING", value: "unchanged" }, { name: "CERTSCORE_RUNTIME_GRAPH_PERCENT", value: "0" }] }] });
test("rollout changes only graph environment fields and keeps image, roles, secrets and capacity", () => {
  const task = fixture(); const original = structuredClone(task); const result = graphRolloutTaskDefinition(task, rollout);
  assert.deepEqual(task, original);
  assert.equal(result.cpu, task.cpu); assert.equal(result.memory, task.memory); assert.equal(result.taskRoleArn, task.taskRoleArn);
  assert.deepEqual(result.containerDefinitions[0].secrets, task.containerDefinitions[0]!.secrets);
  assert.equal(result.containerDefinitions[0].image, task.containerDefinitions[0]!.image);
  assert.equal(result.containerDefinitions[0].environment.find((row: any) => row.name === "EXISTING").value, "unchanged");
  assert.equal(result.containerDefinitions[0].environment.filter((row: any) => row.name === "CERTSCORE_RUNTIME_GRAPH_PERCENT").length, 1);
  assert.equal(result.taskDefinitionArn, undefined);
});
test("unapproved targets, stale source, invalid cohorts and broad canary identifiers fail closed", () => {
  for (const variant of [{ ...rollout, percent: 50 }, { ...rollout, expectedWebSha: "b".repeat(40) }, { ...rollout, canaryScanIds: ["https://site.test"] }, { ...rollout, mode: "off", percent: 5 }]) assert.throws(() => graphRolloutTaskDefinition(fixture(), variant as Rollout));
  const task = fixture(); task.containerDefinitions[0]!.name = "mcp-http";
  assert.throws(() => graphRolloutTaskDefinition(task, rollout));
});

test("zero-percent canaries use only exact registered owned targets and do not change consent flags", () => {
  const canaryTargetUrls = ["https://ergoveritas.com/testar1.html"];
  const task = fixture();
  task.containerDefinitions[0]!.environment.push({ name: "CERTSCORE_POST_ACCEPT_WORKER_ENABLED", value: "0" });
  const result = graphRolloutTaskDefinition(task, { ...rollout, percent: 0, canaryTargetUrls });
  assert.equal(result.containerDefinitions[0].environment.find((row: any) => row.name === "CERTSCORE_RUNTIME_GRAPH_CANARY_TARGET_URLS").value, JSON.stringify(canaryTargetUrls));
  assert.equal(result.containerDefinitions[0].environment.find((row: any) => row.name === "CERTSCORE_POST_ACCEPT_WORKER_ENABLED").value, "0");
  for (const url of ["https://ergoveritas.com/", "https://example.com/", "https://ergoveritas.com/testar1.html?test=1", "https://ergoveritas.com/testar1.html/child"]) assert.throws(() => graphRolloutTaskDefinition(task, { ...rollout, percent: 0, canaryTargetUrls: [url] }));
  assert.throws(() => graphRolloutTaskDefinition(task, { ...rollout, mode: "off", percent: 0, canaryTargetUrls }));
});

test("activation rejects stale or unstable independently deployed participants", () => {
  const service = { status: "ACTIVE", runningCount: 1, desiredCount: 1, deployments: [{}] };
  const containers = [{ name: "validation-worker", image: "release-image" }];
  assert.doesNotThrow(() => assertGraphReleaseService(service, containers, "validation-worker", "release-image"));
  for (const changed of [{ ...service, runningCount: 0 }, { ...service, deployments: [{}, {}] }, { ...service, runningCount: 0, desiredCount: 0 }]) assert.throws(() => assertGraphReleaseService(changed, containers, "validation-worker", "release-image"));
  assert.throws(() => assertGraphReleaseService(service, containers, "validation-worker", "stale-image"));
});

test("presentation activation verifies readers even when new capture is off or internal-only", () => {
  for (const mode of ["off", "capture_only", "project"] as const) {
    for (const presentation of ["off", "on"] as const) {
      assert.deepEqual(graphReleaseRequirements({ mode, presentation }), {
        producers: mode !== "off", readers: presentation === "on",
      });
    }
  }
  assert.deepEqual(graphReleaseRequirements({ mode: "off", presentation: "off" }), { producers: false, readers: false }, "emergency full suppression must not await healthy participants");
});

test("activation rejects stale or absent retained scanner image provenance", () => {
  const digest = `sha256:${"a".repeat(64)}`;
  const deployed = {image:`199536052647.dkr.ecr.eu-central-1.amazonaws.com/certscore-v2-dag-local-lambda@${digest}`,recordedDigest:digest,state:"Active",status:"Successful"};
  assert.doesNotThrow(()=>assertGraphReleaseScanner(deployed,"eu-central-1",digest));
  for (const variant of [{...deployed,recordedDigest:undefined},{...deployed,recordedDigest:`sha256:${"b".repeat(64)}`},{...deployed,state:"Pending"},{...deployed,image:"stale"}]) assert.throws(()=>assertGraphReleaseScanner(variant,"eu-central-1",digest));
});
