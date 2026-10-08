import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { hasVerifiedBuildTypecheck } from "../apps/web/build-typecheck.mjs";
import { runtimeBaseDockerInputs, runtimeBaseInputsChanged, runtimeBaseSourceFingerprint } from "./lib/runtime-base-inputs.mjs";

test("web typecheck reuse requires the successful exact-SHA CI receipt", async () => {
  const sha = "a".repeat(40);
  for (const env of [{}, {BUILD_GIT_SHA:sha}, {BUILD_GIT_SHA:sha,WEB_TYPECHECK_VERIFIED_SHA:"b".repeat(40)},
    {BUILD_GIT_SHA:"main",WEB_TYPECHECK_VERIFIED_SHA:"main"}]) assert.equal(hasVerifiedBuildTypecheck(env), false);
  assert.equal(hasVerifiedBuildTypecheck({BUILD_GIT_SHA:sha,WEB_TYPECHECK_VERIFIED_SHA:sha}), true);
  const workflow = await readFile(".github/workflows/web-aws-ecs-deploy.yml", "utf8");
  const step = workflow.slice(workflow.indexOf("- name: Typecheck web"), workflow.indexOf("- name: Test Marketplace Light"));
  assert.ok(step.indexOf("set -euo pipefail") < step.indexOf("/web typecheck"));
  assert.ok(step.indexOf("/web typecheck") < step.indexOf('echo "verified_sha='));
  assert.match(workflow, /WEB_TYPECHECK_VERIFIED_SHA="\$\{\{ steps.web-typecheck.outputs.verified_sha \}\}"/);
  const evaluate = (receipt: string) => execFileSync(process.execPath, ["--input-type=module", "-e",
    "import config from './apps/web/next.config.mjs'; process.stdout.write(String(config.typescript.ignoreBuildErrors));"],
    {encoding:"utf8",env:{...process.env,BUILD_GIT_SHA:sha,WEB_TYPECHECK_VERIFIED_SHA:receipt}});
  assert.equal(evaluate(""), "false");
  assert.equal(evaluate(sha), "true");
});

test("application build optimization does not require a Chromium runtime-base rebuild", async () => {
  const dockerfile = await readFile("apps/validation-worker/Dockerfile", "utf8");
  const before = execFileSync("git", ["show", "HEAD:apps/validation-worker/Dockerfile"], {encoding:"utf8"});
  assert.equal(runtimeBaseDockerInputs(before,"validation"),runtimeBaseDockerInputs(dockerfile,"validation"));
  assert.notEqual(runtimeBaseDockerInputs(dockerfile,"validation"),
    runtimeBaseDockerInputs(dockerfile.replace("awscli procps","awscli procps curl"),"validation"));
  assert.notEqual(runtimeBaseDockerInputs(dockerfile,"validation"),
    runtimeBaseDockerInputs(dockerfile.replace("FROM node:22-bookworm-slim AS build","FROM node:24-bookworm-slim AS build"),"validation"));
  const build = dockerfile.split("FROM build AS validation-worker-prod-deps")[0]!;
  assert.doesNotMatch(build, /ARG BUILD_(?:GIT_SHA|GIT_REF|IMAGE_TAG|RUNTIME_TARGET)/);
  assert.ok(build.indexOf("tsc -p packages/certscore-scan-core/tsconfig.json") < build.indexOf("COPY apps/web ./apps/web"));
  assert.doesNotMatch(build, /pnpm --filter @certscore\/(scan-core|vendor-resolver) build/);
});

test("runtime-base input selection detects real dependency changes and fails closed", async () => {
  const read = (values: Record<string,string>) => async (file:string) => {
    if (!(file in values)) throw new Error("Missing input");
    return values[file]!;
  };
  const old = {'package.json':JSON.stringify({scripts:{build:"old"},dependencies:{example:"1.0"}})};
  const scriptsOnly = {'package.json':JSON.stringify({scripts:{build:"new"},dependencies:{example:"1.0"}})};
  assert.equal(await runtimeBaseInputsChanged("validation",['package.json'],read(old),read(scriptsOnly)),false);
  assert.equal(await runtimeBaseInputsChanged("validation",['package.json'],read(old),
    read({'package.json':JSON.stringify({dependencies:{example:"2.0"}})})),true);
  for (const file of ['pnpm-lock.yaml','.npmrc','patches/example.patch']) {
    assert.equal(await runtimeBaseInputsChanged("validation",[file],read({}),read({})),true);
  }
  assert.equal(await runtimeBaseInputsChanged("web",['apps/web/Dockerfile'],read({}),read({})),true);
  assert.equal(await runtimeBaseInputsChanged("validation",['apps/validation-worker/src/index.ts'],read({}),read({})),false);
});

test("web base fingerprint detects source drift even if the previous deploy failed", async () => {
  const dockerfile = await readFile("apps/web/Dockerfile", "utf8");
  const sources: Record<string,string> = {
    'apps/web/Dockerfile':dockerfile,
    'pnpm-lock.yaml':'dependency-lock-v1',
    'package.json':JSON.stringify({scripts:{build:'old'},dependencies:{example:'1'}}),
    'apps/web/app/page.tsx':'old-page',
  };
  const fingerprint = (values: Record<string,string>) => runtimeBaseSourceFingerprint("web", Object.keys(values),
    async file => values[file]!);
  const published = await fingerprint(sources);
  assert.match(published,/^[a-f0-9]{64}$/);
  assert.equal(await fingerprint({...sources,'apps/web/app/page.tsx':'new-page',
    'package.json':JSON.stringify({scripts:{build:'new'},dependencies:{example:'1'}})}),published);
  assert.notEqual(await fingerprint({...sources,'pnpm-lock.yaml':'failed-deploy-dependency-lock-v2'}),published);
  assert.notEqual(await fingerprint({...sources,'apps/web/Dockerfile':dockerfile.replace('pg@8.20.0','pg@8.20.1')}),published);
  await assert.rejects(fingerprint({...sources,'package.json':'invalid-json'}));
});

test("validation publishes its importable cache and web retains exact-image migration and health gates", async () => {
  const validation = await readFile(".github/workflows/validation-aws-deploy.yml","utf8");
  assert.match(validation,/--cache-from "type=registry,ref=\$\{WORKER_CACHE\}"/);
  assert.match(validation,/--cache-to "type=registry,ref=\$\{WORKER_CACHE\},mode=max,image-manifest=true,oci-mediatypes=true,ignore-error=true"/);
  assert.match(validation,/node scripts\/runtime-base-changes.mjs validation/);
  const web = await readFile(".github/workflows/web-aws-ecs-deploy.yml","utf8");
  assert.match(web,/node scripts\/runtime-base-changes.mjs web/);
  assert.match(web,/if \[\[ "\$\{rebuild_runtime_base\}" == "1" \]\]; then/);
  assert.match(web,/base_fingerprint.*imagetools inspect/);
  assert.match(web,/"\$\{base_fingerprint\}" == "\$\{WEB_RUNTIME_INPUTS_FINGERPRINT\}"/);
  assert.match(web,/--label "org.certscore.runtime-inputs=\$\{WEB_RUNTIME_INPUTS_FINGERPRINT\}"/);
  assert.ok(web.indexOf("Apply database migrations from target web image") < web.indexOf("Force ECS deployments"));
  assert.match(web,/aws ecs wait services-stable/);
  assert.match(validation,/aws ecs wait services-stable/);
});

test("ECR release cleanup gives bounded mutable build artifacts higher priority", async () => {
  for (const file of ["infra/aws/web-ecs/main.tf", "infra/aws/validation/main.tf"]) {
    const source = await readFile(file,"utf8");
    const block = source.slice(source.indexOf('resource "aws_ecr_lifecycle_policy" "web"'),
      source.indexOf('\nresource ',source.indexOf('resource "aws_ecr_lifecycle_policy" "web"') + 1));
    for (const [priority, prefix, count] of [[1,"buildcache",1],[2,"runtime-base",2],[3,"validation-worker-runtime-base",2]]) {
      assert.match(block,new RegExp(`rulePriority = ${priority}[\\s\\S]*?tagPrefixList = \\["${prefix}"\\][\\s\\S]*?countNumber\\s*= ${count}`));
    }
    const validation = file.includes("/validation/");
    assert.match(block, new RegExp(`rulePriority = 8[\\s\\S]*?tagStatus\\s*= "untagged"[\\s\\S]*?countNumber\\s*= ${validation ? 1 : 14}`));
    assert.match(block, new RegExp(`rulePriority = 10[\\s\\S]*?tagStatus\\s*= "${validation ? "tagged" : "any"}"[\\s\\S]*?countNumber\\s*= ${validation ? 15 : 20}`));
    if (validation) assert.match(block, /tagPatternList\s*= \["\*"\]/);
  }
});

test("local caches and nested environment files stay out of deployment contexts", async () => {
  const rules = (await readFile(".dockerignore","utf8")).split(/\r?\n/);
  for (const rule of ["**/.turbo","**/*.tsbuildinfo","**/.env","**/.env.*","!**/.env.example"]) {
    assert.ok(rules.includes(rule),`Missing recursive Docker exclusion: ${rule}`);
  }
});
