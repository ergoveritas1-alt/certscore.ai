import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
const root=process.cwd();
const source=path.join(root,'infra/aws/ergoveritas-embeds');
const out=path.join(root,'tmp/ergoveritas-embed-deploy');mkdirSync(out,{recursive:true});
const bucket='ergoveritas-com-static-199536052647',region='us-west-1',distribution='E3334DYFHSC1PR';
function aws(...args:string[]){return JSON.parse(execFileSync('aws',[...args,'--output','json'],{encoding:'utf8'}));}
if(aws('sts','get-caller-identity').Account!=='199536052647')throw Error('Unexpected AWS account');
const origins=aws('cloudfront','get-distribution','--id',distribution).Distribution.DistributionConfig.Origins.Items;
if(!origins.some((o:{DomainName:string})=>o.DomainName===`${bucket}.s3.${region}.amazonaws.com`))throw Error('Unexpected CloudFront origin');
const script='<script defer src="/.well-known/certscore-embeds/embeds.js"></script>';
const documents=['index.html','legal/index.html','privacy/index.html','terms/index.html'].map(key=>{
 const stem=key.replaceAll('/','-');const original=path.join(out,stem+'.before.html');
 const head=aws('s3api','get-object','--region',region,'--bucket',bucket,'--key',key,original);
 const html=readFileSync(original,'utf8');
 if(!html.includes('</body>'))throw Error('Document has no body boundary: '+key);
 const changed=html.includes(script)?html:html.replace('</body>',script+'\n</body>');
 const prepared=path.join(out,stem+'.after.html');writeFileSync(prepared,changed);
 return {key,head,html,changed,prepared};
});
console.log({bucket,documents:documents.map(d=>({key:d.key,bytesAdded:d.changed.length-d.html.length})),embedCounts:{'/':1,'/legal':2,'/privacy':3,'/terms':1}});
if(!process.argv.includes('--apply'))process.exit(0);
for(const name of ['card.html','chart.html','notice.html','embeds.js']){
 const file=path.join(source,name);const sha=createHash('sha256').update(readFileSync(file)).digest('hex');
 aws('s3api','put-object','--region',region,'--bucket',bucket,'--key',`.well-known/certscore-embeds/${name}`,'--body',file,'--content-type',name.endsWith('.js')?'application/javascript':'text/html','--cache-control','public,max-age=60','--server-side-encryption','AES256','--metadata',`source-sha256=${sha}`);
}
for(const {key,head,html,changed,prepared} of documents)if(changed!==html)aws('s3api','put-object','--region',region,'--bucket',bucket,'--key',key,'--body',prepared,'--content-type',head.ContentType||'text/html','--cache-control',head.CacheControl||'public,max-age=300','--server-side-encryption','AES256','--if-match',head.ETag);
const invalidation=aws('cloudfront','create-invalidation','--distribution-id',distribution,'--paths','/','/index.html','/legal*','/privacy*','/terms*','/.well-known/certscore-embeds/*').Invalidation.Id;
console.log({invalidation});
execFileSync('aws',['cloudfront','wait','invalidation-completed','--distribution-id',distribution,'--id',invalidation],{stdio:'inherit'});
console.log('ErgoVeritas embed assets published; invalidation completed.');
