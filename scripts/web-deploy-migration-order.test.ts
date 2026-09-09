import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const requestDetailsMigration = "0196_mcp_request_details.sql";
const requestDetailsLegacyChecksum = "48a3fd1dc39431277f904ae046bac26810705c466f46b41ca9935408b0eccba6";
const requestDetailsCanonicalChecksum = "0e5b2bd6eea50c14b31da7eff56a48a0836d5ed92bc24f9452ab5c92956df479";

test("web deploy applies target-image migrations before ECS promotion", async () => {
  const workflow = await readFile(".github/workflows/web-aws-ecs-deploy.yml", "utf8");
  const buildIndex = workflow.indexOf("- name: Build and push public web image");
  const migrateIndex = workflow.indexOf("- name: Apply database migrations from target web image");
  const promoteIndex = workflow.indexOf("- name: Force ECS deployments");

  assert.ok(buildIndex >= 0);
  assert.ok(migrateIndex > buildIndex);
  assert.ok(promoteIndex > migrateIndex);
  assert.match(workflow, /\.containerDefinitions\[0\]\.image = \$image/);
  assert.match(workflow, /EXPECTED_LATEST_MIGRATION/);
  assert.match(workflow, /--task-definition "\$\{TARGET_TASK_DEFINITION\}"/);
  assert.match(workflow, /select\(\.name != \$primary\)/);
  assert.match(workflow, /command:\["sh","-c","exit 0"\]/);
});

test("deploy-all does not race the standalone DB workflow against the target web image", async () => {
  const deploySource = await readFile("scripts/deploy-fast.ts", "utf8");
  assert.match(deploySource, /the web workflow applies migrations from the target image before ECS promotion/);
});

test("the one-off migration process exits after a successful run", async () => {
  const migrationSource = await readFile("scripts/apply-db-migrations.mjs", "utf8");
  assert.match(migrationSource, /\(\) => process\.exit\(0\)/);
});

test("migration runners accept only the released comment-only 0196 checksum variant", async () => {
  const [typescriptRunner, deploymentRunner, migration] = await Promise.all([
    readFile("scripts/apply-db-migrations.ts", "utf8"),
    readFile("scripts/apply-db-migrations.mjs", "utf8"),
    readFile(`packages/db/migrations/${requestDetailsMigration}`, "utf8")
  ]);

  assert.equal(createHash("sha256").update(migration).digest("hex"), requestDetailsCanonicalChecksum);
  for (const runner of [typescriptRunner, deploymentRunner]) {
    assert.match(runner, new RegExp(requestDetailsLegacyChecksum));
    assert.match(runner, /KNOWN_COMPATIBLE_APPLIED_CHECKSUMS/);
    assert.match(runner, /compatible applied checksum/);
  }
});

test("the follow-up migration converges the request-details comment", async () => {
  const followUp = await readFile("packages/db/migrations/0197_mcp_request_details_comment.sql", "utf8");
  assert.match(followUp, /comment on column public\.mcp_tool_invocation_events\.request_details/);
  assert.match(followUp, /optional declared task context/);
  assert.match(followUp, /Short question summaries require explicit sharing/);
});
