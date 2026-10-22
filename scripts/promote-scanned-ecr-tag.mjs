import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

/** Promote only the scanned immutable digest. An identical tag needs no write. */
export function promoteScannedEcrTag({repository,sourceTag,releaseTag,expectedDigest},aws) {
  if(!/^[a-z0-9][a-z0-9._/-]+$/.test(repository??'') || !/^[a-f0-9]{40}$/.test(sourceTag??'') ||
    !/^mcp-v\d+\.\d+\.\d+(?:[-.][a-z0-9.-]+)?$/.test(releaseTag??'') || !/^sha256:[a-f0-9]{64}$/.test(expectedDigest??''))
    throw Error('Invalid scanned ECR promotion input');
  const read=tag=>{
    const result=aws(['ecr','batch-get-image','--repository-name',repository,'--image-ids',`imageTag=${tag}`,'--output','json']);
    const image=result.images?.[0];
    if((result.failures??[]).some(row=>row.failureCode!=='ImageNotFound'))throw Error('ECR image lookup failed');
    return image;
  };
  const source=read(sourceTag);
  if(source?.imageId?.imageDigest!==expectedDigest || !source.imageManifest)throw Error('Scanned source digest or manifest is unavailable');
  if(read(releaseTag)?.imageId?.imageDigest===expectedDigest)return {status:'reused',digest:expectedDigest};
  const written=aws(['ecr','put-image','--repository-name',repository,'--image-tag',releaseTag,'--image-manifest',source.imageManifest,'--output','json']);
  if(written.image?.imageId?.imageDigest!==expectedDigest)throw Error('Promoted ECR digest does not match scanned source');
  return {status:'promoted',digest:expectedDigest};
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const result=promoteScannedEcrTag({repository:process.env.ECR_MCP_REPOSITORY,sourceTag:process.env.GITHUB_SHA,
    releaseTag:process.env.RELEASE_TAG,expectedDigest:process.env.MCP_IMAGE_DIGEST},args=>JSON.parse(execFileSync('aws',args,{encoding:'utf8'})));
  console.log(JSON.stringify(result));
}
