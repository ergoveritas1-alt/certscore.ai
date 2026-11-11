import assert from 'node:assert/strict';
import test from 'node:test';
import { planVerifiedSettings } from './deploy-verified-ecs-settings.mjs';

const sha = 'a'.repeat(40);
const digest = `sha256:${'b'.repeat(64)}`;
const image = '199536052647.dkr.ecr.us-west-1.amazonaws.com/web';
const receiptKey = 'CERTSCORE_AUDIT_PRIVACY_FORM_PROJECTION_ENABLED';
const config = { cluster: 'web-cluster', name: 'materializer', region: 'us-west-1',
  repository: 'web', container: 'certscore-web', sha, rollout: 'preserve', receipts: 'true' };

function fixture({ runningDigest = digest, installedImage = `${image}:${sha}`, receipt = '0' } = {}) {
  const taskDefinition = { taskDefinitionArn: 'definition:1', family: 'materializer', cpu: '1024',
    containerDefinitions: [{ name: config.container, image: installedImage,
      environment: [{ name: receiptKey, value: receipt }, { name: 'KEEP', value: '1' }] },
    { name: 'sidecar', image: 'sidecar:1' }] };
  const responses = {
    'describe-services': { services: [{ status: 'ACTIVE', desiredCount: 1, runningCount: 1, pendingCount: 0,
      taskDefinition: 'definition:1', deployments: [{ status: 'PRIMARY', rolloutState: 'COMPLETED', taskDefinition: 'definition:1' }] }] },
    'describe-task-definition': { taskDefinition },
    'describe-images': { imageDetails: [{ imageDigest: digest }] },
    'list-tasks': { taskArns: ['task:1'] },
    'describe-tasks': { tasks: [{ taskArn: 'task:1', taskDefinitionArn: 'definition:1', lastStatus: 'RUNNING',
      containers: [{ name: config.container, imageDigest: runningDigest, lastStatus: 'RUNNING' }] }] },
  };
  return { aws: (_, operation) => { assert.ok(Object.hasOwn(responses, operation)); return responses[operation]; }, taskDefinition };
}

test('receipt updates pin the running digest and preserve the materializer definition', async () => {
  const { aws, taskDefinition } = fixture();
  const result = await planVerifiedSettings(aws, config);
  assert.equal(result.input.containerDefinitions[0].image, `${image}@${digest}`);
  assert.deepEqual(result.input.containerDefinitions[0].environment,
    [{ name: 'KEEP', value: '1' }, { name: receiptKey, value: '1' }]);
  assert.equal(taskDefinition.containerDefinitions[0].environment[0].value, '0');
  assert.deepEqual(result.input.containerDefinitions[1], taskDefinition.containerDefinitions[1]);
  assert.equal(result.input.cpu, '1024');
  assert.equal(result.input.taskDefinitionArn, undefined);
});

test('opt-out activation preserves existing receipt state and other settings', async () => {
  const { aws } = fixture();
  const { input } = await planVerifiedSettings(aws, { ...config, receipts: 'preserve', rollout: 'enable' });
  const env = Object.fromEntries(input.containerDefinitions[0].environment.map(({ name, value }) => [name, value]));
  assert.equal(env[receiptKey], '0');
  assert.equal(env.CERTSCORE_REVIEWED_OPT_OUT_ROLLOUT_ENABLED, '1');
  assert.equal(env.KEEP, '1');
});

test('settings-only planning rejects an unverified running digest or revision and skips a no-op', async () => {
  await assert.rejects(planVerifiedSettings(fixture({ runningDigest: 'unknown' }).aws, config), /digest is unverified/);
  await assert.rejects(planVerifiedSettings(fixture({ installedImage: `${image}:${'c'.repeat(40)}` }).aws, config), /requested revision/);
  assert.equal((await planVerifiedSettings(fixture({ receipt: '1' }).aws, config)).input, undefined);
});


test('explicit policy restoration changes only the materializer grant and preserves existing privacy receipts', async () => {
 const {aws,taskDefinition}=fixture({receipt:'1'});
 const {input}=await planVerifiedSettings(aws,{...config,receipts:'preserve',policyReceipts:'true'});
 const env=Object.fromEntries(input.containerDefinitions[0].environment.map(e=>[e.name,e.value]));
 assert.equal(env.CERTSCORE_AUDIT_POLICY_PROVENANCE_ENABLED,'1');assert.equal(env[receiptKey],'1');assert.equal(env.KEEP,'1');
 assert.equal(taskDefinition.containerDefinitions[0].environment.some(e=>e.name==='CERTSCORE_AUDIT_POLICY_PROVENANCE_ENABLED'),false);
 assert.equal(input.cpu,taskDefinition.cpu);
});
