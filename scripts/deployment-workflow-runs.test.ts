import assert from "node:assert/strict";
import test from "node:test";
import { requireExpectedWebRevision, resolveDeploymentWorkflowRun, reusableDeploymentWorkflowRun, type DeploymentWorkflowRun } from "./lib/deployment-workflow-runs";

const sha = "a".repeat(40);
const run = (databaseId: number, status = "in_progress", conclusion: string | null = null): DeploymentWorkflowRun =>
  ({databaseId, headSha: sha, status, conclusion, event: "push"});

test("live verification requires the exact revision and AWS runtime", () => {
  requireExpectedWebRevision({gitSha:sha,runtimeTarget:"ecs-fargate"},sha);
  for (const payload of [null,{}, {gitSha:"b".repeat(40),runtimeTarget:"ecs-fargate"}, {gitSha:sha,runtimeTarget:"unknown"}]) {
    assert.throws(()=>requireExpectedWebRevision(payload,sha));
  }
});

test("active push wins over a newer queued duplicate and canceled runs are not reused", () => {
  assert.equal(reusableDeploymentWorkflowRun([run(3,"completed","cancelled"),run(2,"pending"),run(1)],sha)?.databaseId,1);
  assert.equal(reusableDeploymentWorkflowRun([run(3,"completed","failure"),{...run(4),headSha:"b".repeat(40)}],sha),undefined);
  assert.equal(reusableDeploymentWorkflowRun([run(3,"completed","success"),run(4)],sha)?.databaseId,3);
});

test("delayed push registration is reused without dispatching a second deployment", async () => {
  let time=0, dispatches=0, calls=0;
  const id=await resolveDeploymentWorkflowRun({targetSha:sha,registrationGraceMs:20_000,
    list:async()=>++calls<3?[]:[run(7)],dispatch:async()=>{dispatches++;},
    now:()=>time,sleep:async ms=>{time+=ms;}});
  assert.equal(id,"7");assert.equal(dispatches,0);assert.equal(time,4000);
});

test("missing push registration gets one bounded fallback dispatch", async () => {
  let time=0, dispatched=false, dispatches=0;
  const id=await resolveDeploymentWorkflowRun({targetSha:sha,registrationGraceMs:6000,
    list:async()=>dispatched?[{...run(9),event:"workflow_dispatch"}]:[],
    dispatch:async()=>{dispatches++;dispatched=true;},now:()=>time,sleep:async ms=>{time+=ms;}});
  assert.equal(id,"9");assert.equal(dispatches,1);assert.equal(time,9000);
});

test("an explicit forced dispatch cannot be satisfied by an older push run", async () => {
  let time=0, calls=0, dispatches=0;
  const id=await resolveDeploymentWorkflowRun({targetSha:sha,forceDispatch:true,registrationGraceMs:20_000,
    list:async()=>++calls<3?[run(1),run(2)]:[run(1),run(2),{...run(3),event:"workflow_dispatch"}],
    dispatch:async()=>{dispatches++;},now:()=>time,sleep:async ms=>{time+=ms;}});
  assert.equal(id,"3");assert.equal(dispatches,1);assert.equal(time,6000);
});

test("GitHub discovery failure does not trigger a blind deployment", async () => {
  let dispatches=0;
  await assert.rejects(resolveDeploymentWorkflowRun({targetSha:sha,list:async()=>{throw new Error("unavailable");},
    dispatch:async()=>{dispatches++;},sleep:async()=>{}}),/unavailable/);
  assert.equal(dispatches,0);
});

test("a newly created push run does not masquerade as the requested manual run", async () => {
  let time=0,calls=0;
  await assert.rejects(resolveDeploymentWorkflowRun({targetSha:sha,forceDispatch:true,
    list:async()=>++calls===1?[]:[run(3)],dispatch:async()=>{},now:()=>time,sleep:async ms=>{time+=ms;}}),/Timed out/);
  assert.equal(time,90_000);
});
