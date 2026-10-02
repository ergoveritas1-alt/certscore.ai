/** Update only the explicitly named isolated research function, preserving its configuration. */
import fs from 'node:fs';import crypto from 'node:crypto';import {execFileSync} from 'node:child_process';
const root='artifacts/research/gpc-controlled-study-2026',name='certscore-gpc-research-20260930',region='us-west-1';
const runtime=JSON.parse(fs.readFileSync(root+'/research_runtime.json'));if(runtime.functionName!==name)throw Error('research_function_identity_mismatch');
const aws=args=>JSON.parse(execFileSync('aws',[...args,'--region',region,'--output','json'],{encoding:'utf8'}));
const live=aws(['lambda','get-function','--function-name',name]);if(!live.Code.ResolvedImageUri.endsWith('@'+runtime.imageDigest))throw Error('unexpected_live_revision');
const digest=fs.readFileSync(root+'/private/uploaded-image-digest.txt','utf8').trim();if(digest!=='sha256:'+crypto.createHash('sha256').update(fs.readFileSync(root+'/private/runtime-image-manifest.json')).digest('hex'))throw Error('upload_not_complete_for_current_image');
const imageUri='199536052647.dkr.ecr.us-west-1.amazonaws.com/certscore-gpc-research@'+digest;
aws(['lambda','update-function-code','--function-name',name,'--revision-id',live.Configuration.RevisionId,'--image-uri',imageUri]);
execFileSync('aws',['lambda','wait','function-updated-v2','--function-name',name,'--region',region]);
fs.writeFileSync(root+'/research_runtime.json',JSON.stringify({...runtime,imageDigest:digest,imageUri,localImageId:execFileSync('docker',['image','inspect','certscore-gpc-research:study-v3','--format','{{.Id}}'],{encoding:'utf8'}).trim()},null,2)+'\n');console.log('Updated isolated research image '+digest);
