/** Creates only isolated research resources. Never updates a production function or service. */
import {isDeepStrictEqual} from 'node:util';import fs from 'node:fs';import {execFileSync} from 'node:child_process';
const root='artifacts/research/gpc-controlled-study-2026',region='us-west-1',repository='certscore-gpc-research',name='certscore-gpc-research-20260930';
const aws=(args,options={})=>execFileSync('aws',[...args,'--region',region],{encoding:'utf8',...options});
const read=args=>JSON.parse(aws([...args,'--output','json']));
const topology=JSON.parse(fs.readFileSync(root+'/private/aws-research-topology.json'));
const account=read(['sts','get-caller-identity']).Account;if(account!=='199536052647')throw Error('unexpected_account');
try{read(['lambda','get-function','--function-name',name]);throw Error('Research function already exists; inspect exact revision instead of overwriting');}catch(e){if(!String(e.stderr??'').includes('ResourceNotFoundException'))throw e;}
let repo;try{repo=read(['ecr','describe-repositories','--repository-names',repository]).repositories[0];}catch(e){if(!String(e.stderr??'').includes('RepositoryNotFoundException'))throw e;repo=read(['ecr','create-repository','--repository-name',repository,'--image-tag-mutability','IMMUTABLE']).repository;}
const imageId=execFileSync('docker',['image','inspect','certscore-gpc-research:study-v3','--format','{{.Id}}'],{encoding:'utf8'}).trim();
const tag='study-v3-'+imageId.slice(7,19),target=repo.repositoryUri+':'+tag;
let digest;
const uploaded=root+'/private/uploaded-image-digest.txt';
if(fs.existsSync(uploaded)){
 digest=fs.readFileSync(uploaded,'utf8').trim();if(!/^sha256:[0-9a-f]{64}$/.test(digest))throw Error('invalid_uploaded_digest');
 read(['ecr','describe-images','--repository-name',repository,'--image-ids','imageDigest='+digest]);
}else{
 const password=aws(['ecr','get-login-password']);execFileSync('docker',['login','--username','AWS','--password-stdin',repo.repositoryUri.split('/')[0]],{input:password,stdio:['pipe','ignore','pipe']});
 execFileSync('docker',['tag','certscore-gpc-research:study-v3',target]);execFileSync('docker',['push',target],{stdio:'inherit'});
 const top=read(['ecr','batch-get-image','--repository-name',repository,'--image-ids','imageTag='+tag]).images[0];
 const manifest=JSON.parse(top.imageManifest);
 digest=manifest.manifests?.find(m=>m.platform?.architecture==='arm64'&&m.platform?.os==='linux')?.digest??top.imageId.imageDigest;
}
const roleName='certscore-gpc-research-20260930';
const trust={Version:'2012-10-17',Statement:[{Effect:'Allow',Principal:{Service:'lambda.amazonaws.com'},Action:'sts:AssumeRole'}]};
const permissions={Version:'2012-10-17',Statement:[
 {Effect:'Allow',Action:['s3:GetObject','s3:PutObject'],Resource:['arn:aws:s3:::certscore-v2-dag-local-artifacts-us-west-1-199536052647/v2-dag-lambda/local/research/gpc-controlled-study-2026/*']},
 {Effect:'Allow',Action:['logs:CreateLogGroup','logs:CreateLogStream','logs:PutLogEvents'],Resource:['arn:aws:logs:us-west-1:199536052647:log-group:/aws/lambda/'+name+':*']},
 {Effect:'Allow',Action:['ec2:CreateNetworkInterface','ec2:DescribeNetworkInterfaces','ec2:DescribeSubnets','ec2:DeleteNetworkInterface','ec2:AssignPrivateIpAddresses','ec2:UnassignPrivateIpAddresses'],Resource:'*'}
]};
let role;try{role=read(['iam','get-role','--role-name',roleName]).Role;}catch(e){if(!String(e.stderr??'').includes('NoSuchEntity'))throw e;}
fs.writeFileSync(root+'/private/research-role-trust.json',JSON.stringify(trust));fs.writeFileSync(root+'/private/research-role-permissions.json',JSON.stringify(permissions));
if(role){
 const current=read(['iam','get-role-policy','--role-name',roleName,'--policy-name','isolated-research-runtime']).PolicyDocument;
 if(!isDeepStrictEqual(current,permissions)||!isDeepStrictEqual(role.AssumeRolePolicyDocument,trust))throw Error('existing_research_role_differs');
}else{
 role=read(['iam','create-role','--role-name',roleName,'--assume-role-policy-document','file://'+root+'/private/research-role-trust.json']).Role;
 aws(['iam','put-role-policy','--role-name',roleName,'--policy-name','isolated-research-runtime','--policy-document','file://'+root+'/private/research-role-permissions.json']);
}
await new Promise(resolve=>setTimeout(resolve,10000));
const payload={FunctionName:name,Role:role.Arn,PackageType:'Image',Code:{ImageUri:repo.repositoryUri+'@'+digest},Architectures:['arm64'],Timeout:60,MemorySize:3008,EphemeralStorage:{Size:1024},VpcConfig:{SubnetIds:topology.vpcConfig.SubnetIds,SecurityGroupIds:topology.vpcConfig.SecurityGroupIds},Environment:{Variables:{HOME:'/tmp',XDG_CONFIG_HOME:'/tmp',XDG_CACHE_HOME:'/tmp',GPC_RESEARCH_PROXY_SERVER:topology.proxyServer,GPC_RESEARCH_BUCKET:'certscore-v2-dag-local-artifacts-us-west-1-199536052647'}},Tags:{purpose:'isolated-gpc-research',study:'gpc-controlled-2026'}};
fs.writeFileSync(root+'/private/create-research-function.json',JSON.stringify(payload),{mode:0o600});read(['lambda','create-function','--cli-input-json','file://'+root+'/private/create-research-function.json']);
aws(['lambda','wait','function-active-v2','--function-name',name]);
fs.writeFileSync(root+'/research_runtime.json',JSON.stringify({functionName:name,region,imageDigest:digest,imageUri:repo.repositoryUri+'@'+digest,localImageId:imageId,architecture:'arm64',memoryMiB:3008,timeoutSeconds:60},null,2)+'\n');
console.log('Created isolated research function '+name+' at '+digest);
