import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

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
});

test("deploy-all does not race the standalone DB workflow against the target web image", async () => {
  const deploySource = await readFile("scripts/deploy-fast.ts", "utf8");
  assert.match(deploySource, /the web workflow applies migrations from the target image before ECS promotion/);
});

test("the one-off migration process exits after a successful run", async () => {
  const migrationSource = await readFile("scripts/apply-db-migrations.mjs", "utf8");
  assert.match(migrationSource, /\(\) => process\.exit\(0\)/);
});
