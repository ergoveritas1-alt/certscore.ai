/** Read-only runtime/egress configuration audit. */
import fs from 'node:fs';import crypto from 'node:crypto';import {execFileSync} from 'node:child_process';
const root='artifacts/research/gpc-controlled-study-2026',label=process.argv[2]??'start';if(!['start','end'].includes(label))throw Error('invalid audit phase');
const config=JSON.parse(fs.readFileSync(root+'/frozen_config.json'));const aws=args=>JSON.parse(execFileSync('aws',[...args,'--region','us-west-1','--output','json'],{encoding:'utf8'}));
const live=aws(['lambda','get-function','--function-name',config.lambdaFunctionName]);if(!live.Code.ResolvedImageUri.endsWith('@'+config.imageDigest))throw Error('runtime_image_drift');
const snapshot={at:new Date().toISOString(),image:live.Code.ResolvedImageUri,lastModified:live.Configuration.LastModified,revisionId:live.Configuration.RevisionId,memoryMiB:live.Configuration.MemorySize,timeout:live.Configuration.Timeout,role:live.Configuration.Role,environmentSha256:crypto.createHash('sha256').update(JSON.stringify(live.Configuration.Environment?.Variables)).digest('hex')};
if(label==='end'){const start=JSON.parse(fs.readFileSync(root+'/private/runtime-start.json'));for(const k of ['image','lastModified','revisionId','memoryMiB','timeout','role','environmentSha256'])if(snapshot[k]!==start[k])throw Error('runtime_configuration_drift:'+k);}
fs.writeFileSync(root+'/private/runtime-'+label+'.json',JSON.stringify(snapshot,null,2)+'\n',{mode:0o600});console.log(JSON.stringify({phase:label,verified:true,lastModified:snapshot.lastModified}));
