/** Resume a settings-only handoff after the exact production scanner images are already installed. */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { scannerEnvironmentWithinBudget, REVIEWED_WORKER_FLAGS } from './lib/scanner-env-budget.mjs';

const [sha, mode = '--check', ...rest] = process.argv.slice(2);
if (!/^[0-9a-f]{40}$/.test(sha ?? '') || !['--check', '--apply'].includes(mode) || rest.length) throw Error('Supply the exact installed scanner revision and --check or --apply.');
const regions = ['us-west-1', 'eu-west-1', 'eu-central-1'];
const primary = 'certscore-v2-dag-local-lambda';
const functions = [primary, `${primary}-inventory`];
function aws(region, service, operation, args, query) {
  const result = execFileSync('aws', [service, operation, '--region', region, ...args, '--query', query, '--output', 'json'], {
    stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', maxBuffer: 1_000_000,
  });
  return JSON.parse(result);
}
const installed = (region, name) => aws(region, 'lambda', 'get-function', ['--function-name', name], '{image:Code.ResolvedImageUri,vars:Configuration.Environment.Variables,rev:Configuration.RevisionId,memory:Configuration.MemorySize,timeout:Configuration.Timeout,state:Configuration.State,update:Configuration.LastUpdateStatus}');
const plans = [];
let phase = 'preflight';
try {
  for (const [cluster, service, container] of [['certscore-web-cluster','certscore-web-certscore','certscore-web'],['certscore-validation-cluster','certscore-validation-worker','validation-worker']]) {
    const serviceState=aws('us-west-1','ecs','describe-services',['--cluster',cluster,'--services',service],'services[0].{task:taskDefinition,running:runningCount,desired:desiredCount,deploys:deployments[].rolloutState}');
    if (!serviceState || serviceState.running!==serviceState.desired || serviceState.desired<1 || !isDeepStrictEqual(serviceState.deploys,['COMPLETED'])) throw Error(`${service} not stable`);
    const def=aws('us-west-1','ecs','describe-task-definition',['--task-definition',serviceState.task],"taskDefinition.containerDefinitions[].{name:name,image:image,flags:environment[?name=='CERTSCORE_CONDITIONAL_SALE_SHARING_OPT_OUT_ENABLED' || name=='CERTSCORE_REVIEWED_OPT_OUT_ROLLOUT_ENABLED']}");
    const c=def.find(x=>x.name===container) ?? def.find(x=>x.image.endsWith(`:${sha}`));
    if(!c?.image.endsWith(`:${sha}`) || (c.flags??[]).some(x=>x.value!=='0')) throw Error(`${service} does not have the verified inactive consumer settings`);
  }
  const digests=new Set();
  for (const region of regions) {
    const digest=aws(region,'ecr','describe-images',['--repository-name',primary,'--image-ids',`imageTag=${sha}`],'imageDetails[0].imageDigest');
    if (!/^sha256:[0-9a-f]{64}$/.test(digest)) throw Error(`${region} lacks the exact scanner image`);
    digests.add(digest);
    for (const [i,name] of functions.entries()) {
      const current=installed(region,name);
      if (!current.rev || !current.image?.endsWith(`@${digest}`) || current.vars?.SCANNER_IMAGE_DIGEST!==digest || current.memory!==3008 || current.timeout!==(i===0?75:25) || current.state!=='Active' || current.update!=='Successful') throw Error(`${region}/${name} scanner provenance, health or settings mismatch`);
      const plan=scannerEnvironmentWithinBudget(region,current.vars,REVIEWED_WORKER_FLAGS,true);
      plans.push({region,name,digest,current,...plan});
      console.log(JSON.stringify({region,name,bytes:plan.bytes,originalBytes:plan.originalBytes,deduplicated:plan.deduplicated,changed:!isDeepStrictEqual(plan.next,current.vars)}));
    }
  }
  if(digests.size!==1) throw Error('Regional scanner image digests differ');
  if (mode==='--apply') {
    for (const p of plans) {
      phase=`settings update ${p.region}/${p.name}`;
      if (!isDeepStrictEqual(p.next,p.current.vars)) {
        const dir=mkdtempSync(join(tmpdir(),'certscore-reviewed-settings-'));
        try {
          const file=join(dir,'environment.json');
          writeFileSync(file,JSON.stringify({Variables:p.next}),{mode:0o600,flag:'wx'});
          aws(p.region,'lambda','update-function-configuration',['--function-name',p.name,'--revision-id',p.current.rev,'--environment',`file://${file}`],'RevisionId');
        } finally { rmSync(dir,{recursive:true,force:true}); }
        execFileSync('aws',['lambda','wait','function-updated-v2','--region',p.region,'--function-name',p.name],{stdio:['ignore','pipe','pipe']});
      }
      const actual=installed(p.region,p.name);
      if(!isDeepStrictEqual(actual.vars,p.next) || actual.memory!==p.current.memory || actual.timeout!==p.current.timeout || actual.image!==p.current.image || actual.state!=='Active' || actual.update!=='Successful') throw Error('Settings readback mismatch');
    }
  }
  console.log(JSON.stringify({status:mode==='--apply'?'worker_settings_verified':'preview_passed',revision:sha,functions:plans.length}));
} catch (error) {
  // AWS can include environment values in errors. Never output raw CLI failures.
  console.error(`${phase}: ${error?.status == null ? error.message : 'AWS request failed; raw environment omitted'}`);
  process.exitCode=1;
}
