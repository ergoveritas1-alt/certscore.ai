import test from 'node:test';
import assert from 'node:assert/strict';
import {promoteScannedEcrTag} from './promote-scanned-ecr-tag.mjs';
const input={repository:'certscore-web-mcp',sourceTag:'a'.repeat(40),releaseTag:'mcp-v0.2.30',expectedDigest:'sha256:'+'b'.repeat(64)};
const image={imageId:{imageDigest:input.expectedDigest},imageManifest:'retained-manifest'};
test('identical scanned release tag is reused without put-image',()=>{
 const calls=[];assert.equal(promoteScannedEcrTag(input,args=>{calls.push(args);return {images:[image]};}).status,'reused');
 assert.equal(calls.length,2);assert.ok(calls.every(args=>args[1]==='batch-get-image'));
});
test('missing or older tag promotes exactly the verified source manifest',()=>{
 for(const destination of [{failures:[{failureCode:'ImageNotFound'}]},{images:[{imageId:{imageDigest:'sha256:'+'c'.repeat(64)}}]}]) {
  let count=0;const result=promoteScannedEcrTag(input,args=>{
   count++;if(count===1)return {images:[image]};if(count===2)return destination;
   assert.equal(args[1],'put-image');assert.equal(args[args.indexOf('--image-manifest')+1],image.imageManifest);return {image};
  });assert.equal(result.status,'promoted');assert.equal(count,3);
 }
});
test('source drift, lookup failures and AWS write errors stop promotion',()=>{
 assert.throws(()=>promoteScannedEcrTag(input,()=>({images:[]})),/source digest/);
 let count=0;assert.throws(()=>promoteScannedEcrTag(input,()=>++count===1?{images:[image]}:{failures:[{failureCode:'KmsError'}]}),/lookup failed/);
 count=0;assert.throws(()=>promoteScannedEcrTag(input,()=>{if(++count===1)return {images:[image]};if(count===2)return {};throw Error('AWS denied');}),/AWS denied/);
});
