import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {mkdtemp, readFile, rm} from "node:fs/promises";
import {createRequire} from "node:module";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type {GetObjectCommandOutput} from "@aws-sdk/client-s3";

const require = createRequire(import.meta.url);
require.cache[require.resolve("server-only")] = {exports:{},loaded:true} as NodeModule;

test("both local mirrors retain exact Accept packet bytes at the screenshot reader's lane path", async () => {
  const web = await import("./local-v2-dag-lambda-result-poller");
  const worker = await import("../../../validation-worker/src/validation/local-v2-dag-lambda-results");
  const bundle = Buffer.from('{"scanId":"action-packet-mirror"}');
  const packet = Buffer.from('{"parentScanId":"action-packet-mirror","formSnapshotCapture":{"retained":"original bytes"}}');
  const identity = (body:Buffer) => ({sha256:createHash("sha256").update(body).digest("hex"),sizeBytes:body.length});
  const message = {scanId:"action-packet-mirror",status:"completed",targetEnvironment:"local",
    artifactPointers:{scanArtifactUri:"s3://local-fixture/bundle",postAcceptPacketUri:"s3://local-fixture/packet"},
    artifactMetadata:{scanArtifactUri:identity(bundle),postAcceptPacketUri:identity(packet)}};
  for (const mirror of [web.mirrorLocalV2DagLambdaArtifacts, worker.mirrorLocalV2DagLambdaArtifacts]) {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(),"local-action-packet-"));
    const reads:string[]=[];
    try {
      const input = {workspaceRoot,mirrorAuxiliaryArtifacts:false,parsedMessage:message as any,
        s3Client:{async send(command:{input:{Key?:string}}):Promise<GetObjectCommandOutput> {
          reads.push(command.input.Key!);
          const bytes = command.input.Key === "bundle" ? bundle : packet;
          const blob = new Blob([new Uint8Array(bytes)]);
          return {$metadata:{},Body:Object.assign(blob,{
            transformToByteArray:async () => new Uint8Array(bytes),
            transformToString:async () => bytes.toString(),
            transformToWebStream:() => blob.stream()
          })};
        }}};
      const result = await mirror(input);
      assert.ok(result);
      const retained = result.mirroredArtifacts.find(row => row.field === "postAcceptPacketUri");
      assert.equal(retained?.fileName,"lanes/accept_observation/PostAcceptEvidencePacket.json");
      assert.deepEqual(await readFile(retained!.localPath),packet);
      assert.equal(retained?.sha256,identity(packet).sha256);
      assert.deepEqual(reads.sort(),["bundle","packet"]);
      await assert.rejects(mirror({...input,parsedMessage:{...message,artifactMetadata:{...message.artifactMetadata,
        postAcceptPacketUri:{...identity(packet),sha256:"0".repeat(64)}}} as any}),/checksum mismatch/);
      await assert.rejects(mirror({...input,parsedMessage:{...message,artifactMetadata:{...message.artifactMetadata,
        postAcceptPacketUri:{...identity(packet),sizeBytes:1}}} as any}),/size mismatch/);
      reads.length=0;
      await mirror({...input,parsedMessage:{...message,artifactPointers:{scanArtifactUri:message.artifactPointers.scanArtifactUri}} as any});
      assert.deepEqual(reads,["bundle"],"absent optional packet adds no read");
    } finally {await rm(workspaceRoot,{recursive:true,force:true});}
  }
});
