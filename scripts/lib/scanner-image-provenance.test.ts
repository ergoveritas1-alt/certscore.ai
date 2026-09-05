import assert from "node:assert/strict";
import test from "node:test";
import { scannerImageDigest, synchronizeScannerImage, type ScannerImageControl, type ScannerImageState } from "./scanner-image-provenance";

const digestA = `sha256:${"a".repeat(64)}`;
const digestB = `sha256:${"b".repeat(64)}`;
const image = (digest: string) => `199536052647.dkr.ecr.eu-central-1.amazonaws.com/certscore-v2-dag-local-lambda@${digest}`;
function fixture(options: {failCode?: boolean; conflictEnvironment?: boolean; driftAfterCode?: boolean; incorrectEnvironment?: boolean; digest?: string} = {}) {
  let state: ScannerImageState = {imageUri:image(digestA),revisionId:"r0",state:"Active",updateStatus:"Successful",variables:{KEEP:"unrelated",SECRET:"test-only-secret",SCANNER_IMAGE_DIGEST:options.digest ?? digestA}};
  const calls: string[] = [];
  let revision = 0;
  const guard = (id: string) => { assert.equal(id,state.revisionId); state.revisionId=`r${++revision}`; };
  const control: ScannerImageControl = {
    async read() { return structuredClone(state); },
    async environment(variables,id) {
      calls.push(variables.SCANNER_IMAGE_DIGEST ? "stamp" : "clear");
      if (options.conflictEnvironment) throw new Error("revision_conflict");
      guard(id); state.variables={...variables};
      if (options.incorrectEnvironment) state.variables.KEEP="unexpected";
    },
    async code(uri,id) {
      calls.push("code");
      assert.equal(state.variables.SCANNER_IMAGE_DIGEST,undefined,"old digest must not survive code promotion");
      if (options.failCode) throw new Error("promotion_failed");
      guard(id); state.imageUri=uri;
      if (options.driftAfterCode) state.variables.KEEP="concurrent";
    },
    async wait() {calls.push("wait");},
  };
  return {control,calls,state:()=>state};
}

test("promotion clears old provenance, promotes revision-guarded code, then stamps verified digest", async()=>{
  const f=fixture();
  const result=await synchronizeScannerImage(f.control,image(digestB),true);
  assert.deepEqual(f.calls,["clear","wait","code","wait","stamp","wait"]);
  assert.deepEqual(f.state().variables,{KEEP:"unrelated",SECRET:"test-only-secret",SCANNER_IMAGE_DIGEST:digestB});
  assert.deepEqual(result,{changed:true,imageUri:image(digestB),imageDigest:digestB});
});
test("current-image repair changes only provenance and never promotes code",async()=>{
  const f=fixture({digest:digestB});
  await synchronizeScannerImage(f.control,image(digestA),false);
  assert.deepEqual(f.calls,["stamp","wait"]);
  assert.equal(f.state().variables.SECRET,"test-only-secret");
  assert.equal(f.state().variables.SCANNER_IMAGE_DIGEST,digestA);
});
test("matching current-image provenance is an idempotent no-op",async()=>{
  const f=fixture(); assert.equal((await synchronizeScannerImage(f.control,image(digestA),false)).changed,false); assert.deepEqual(f.calls,[]);
});
test("repair cannot change code or accept mutable, cross-account, invalid or unapproved image identities",async()=>{
  const f=fixture(); await assert.rejects(synchronizeScannerImage(f.control,image(digestB),false),/must not change/);
  await assert.rejects(synchronizeScannerImage(f.control,image(digestB).replace("eu-central-1","eu-west-1"),true),/cannot cross/);
  for (const uri of [image(digestA).replace(`@${digestA}`,":latest"),image("sha256:no"),image(digestA).replace("199536052647","999999999999"),image(digestA).replace("eu-central-1","us-east-1")]) assert.throws(()=>scannerImageDigest(uri));
  assert.deepEqual(f.calls,[]);
});
test("revision conflict halts before any code promotion or new provenance stamp",async()=>{
  const f=fixture({conflictEnvironment:true}); await assert.rejects(synchronizeScannerImage(f.control,image(digestB),true),/revision_conflict/); assert.deepEqual(f.calls,["clear"]);
});
test("failed code promotion leaves provenance unknown instead of falsely stamping new code",async()=>{
  const f=fixture({failCode:true}); await assert.rejects(synchronizeScannerImage(f.control,image(digestB),true),/promotion_failed/); assert.deepEqual(f.calls,["clear","wait","code"]); assert.equal(f.state().variables.SCANNER_IMAGE_DIGEST,undefined); assert.equal(f.state().imageUri,image(digestA));
});
test("concurrent environment drift is not overwritten or reported as success",async()=>{
  const f=fixture({driftAfterCode:true}); await assert.rejects(synchronizeScannerImage(f.control,image(digestB),true),/environment changed/); assert.deepEqual(f.calls,["clear","wait","code","wait"]);
});
test("incorrect final environment fails verification and unhealthy functions cannot mutate",async()=>{
  const f=fixture({incorrectEnvironment:true,digest:digestB}); await assert.rejects(synchronizeScannerImage(f.control,image(digestA),false),/did not converge/);
  const unhealthy=fixture(); unhealthy.state().updateStatus="InProgress"; await assert.rejects(synchronizeScannerImage(unhealthy.control,image(digestA),false),/not healthy/); assert.deepEqual(unhealthy.calls,[]);
});
test("malformed existing digest can be safely repaired from the verified image",async()=>{
  const f=fixture({digest:"not-a-digest"}); await synchronizeScannerImage(f.control,image(digestA),false); assert.equal(f.state().variables.SCANNER_IMAGE_DIGEST,digestA);
});
