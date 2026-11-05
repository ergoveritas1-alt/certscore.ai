import assert from 'node:assert/strict';
import test from 'node:test';
import { installedEcsRevision } from './deployed-image.mjs';
const sha = 'a'.repeat(40), arn = 'arn:aws:ecs:us-west-1:199536052647:task-definition/owned:1';
const expected = { region: 'us-west-1', repository: 'certscore-validation-worker', container: 'validation-worker' };
const fixture = () => ({ state: { failures: [], services: [{ status: 'ACTIVE', desiredCount: 1, runningCount: 1, pendingCount: 0, taskDefinition: arn,
  deployments: [{ status: 'PRIMARY', rolloutState: 'COMPLETED', taskDefinition: arn }] }] },
  definition: { taskDefinition: { taskDefinitionArn: arn, containerDefinitions: [{ name: expected.container, image: `199536052647.dkr.ecr.us-west-1.amazonaws.com/${expected.repository}:${sha}` }] } } });
test('installed revision binds the exact healthy service, task, container, region and repository', async () => {
  const valid = fixture(); assert.equal(await installedEcsRevision(valid.state, valid.definition, expected), sha);
  for (const mutate of [
    f => { f.state.services[0].deployments[0].rolloutState = 'IN_PROGRESS'; },
    f => { f.state.services[0].deployments[0].status = 'ACTIVE'; },
    f => { f.state.services[0].desiredCount = 0; },
    f => { f.state.services[0].pendingCount = 1; },
    f => { f.state.services[0].runningCount = 0; },
    f => { f.definition.taskDefinition.taskDefinitionArn = 'different'; },
    f => { f.definition.taskDefinition.containerDefinitions[0].name = 'wrong-container'; },
    f => { f.definition.taskDefinition.containerDefinitions.push(f.definition.taskDefinition.containerDefinitions[0]); },
    f => { f.definition.taskDefinition.containerDefinitions[0].image = f.definition.taskDefinition.containerDefinitions[0].image.replace(expected.repository, 'wrong-repository'); },
    f => { f.definition.taskDefinition.containerDefinitions[0].image = f.definition.taskDefinition.containerDefinitions[0].image.replace('us-west-1', 'eu-west-1'); },
    f => { f.definition.taskDefinition.containerDefinitions[0].image = f.definition.taskDefinition.containerDefinitions[0].image.replace('199536052647', '111111111111'); },
    f => { f.definition.taskDefinition.containerDefinitions[0].image = f.definition.taskDefinition.containerDefinitions[0].image.replace(sha, 'latest'); },
  ]) { const f = fixture(); mutate(f); await assert.rejects(() => installedEcsRevision(f.state, f.definition, expected)); }
  for (const missing of [null, {}, { services: [] }]) await assert.rejects(() => installedEcsRevision(missing, valid.definition, expected));
});

test('digest-pinned tasks require the revision label and a matching ECR SHA tag', async () => {
  const { state, definition } = fixture();
  const container = definition.taskDefinition.containerDefinitions[0];
  const digest = `sha256:${'c'.repeat(64)}`;
  container.image = container.image.replace(`:${sha}`, `@${digest}`);
  container.dockerLabels = { 'org.opencontainers.image.revision': sha };
  assert.equal(await installedEcsRevision(state, definition, { ...expected, resolveDigest: async revision => {
    assert.equal(revision, sha);
    return digest;
  } }), sha);
  await assert.rejects(installedEcsRevision(state, definition, expected));
  await assert.rejects(installedEcsRevision(state, definition, { ...expected, resolveDigest: async () => 'different' }));
  delete container.dockerLabels['org.opencontainers.image.revision'];
  await assert.rejects(installedEcsRevision(state, definition, { ...expected, resolveDigest: async () => digest }));
});
