import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {getPredeployPlan} from './predeploy';
test('form lifecycle stays mandatory in fast/full preflight and web/validation release workflows',()=>{
 for(const file of ['packages/certscore-scan-core/src/post-accept-observer.ts','packages/certscore-contracts/src/post-accept-form-snapshots.ts','apps/web/lib/scans/post-accept-form-projection.ts','apps/v2-dag-lambda/src/handler.ts','scripts/local-policy-lambda-worker.ts'])
  for(const full of [true,false])assert.ok(getPredeployPlan([file],{full}).checks.some(x=>x.key==='post-accept-forms'),file);
 for(const file of ['web-aws-ecs-deploy.yml','validation-aws-deploy.yml']){
  const workflow=readFileSync('.github/workflows/'+file,'utf8');assert.ok(workflow.includes('run: pnpm test:post-accept-forms'));assert.ok(workflow.includes('playwright install --with-deps chromium'));
 }
});
