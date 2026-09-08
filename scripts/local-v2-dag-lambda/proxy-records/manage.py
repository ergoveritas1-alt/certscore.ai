#!/usr/bin/env python3
"""Maintain only the existing Lambda egress proxy, with temporary /32 SSH access.
Modes: inspect, install (capture disabled), enable, disable. Never prints secrets.
"""
import argparse,base64,hashlib,hmac,io,json,os,pathlib,re,subprocess,tarfile,tempfile,urllib.request
p=argparse.ArgumentParser();p.add_argument('mode',choices=['inspect','install','enable','disable']);p.add_argument('--region',required=True,choices=['eu-central-1','eu-west-1','us-west-1']);a=p.parse_args()
FUNCTION='certscore-v2-dag-local-lambda'
def aws(*args):return json.loads(subprocess.check_output(['aws','--region',a.region,*args,'--output','json']))
config=aws('lambda','get-function-configuration','--function-name',FUNCTION)
variables=config['Environment']['Variables'];proxy=urllib.parse.urlparse(variables['CERTSCORE_V2_DAG_LAMBDA_PROXY_SERVER'])
instances=aws('ec2','describe-instances','--filters','Name=tag:Purpose,Values=lambda-browser-egress-proxy','Name=instance-state-name,Values=running')['Reservations']
selected=[i for r in instances for i in r['Instances'] if i['PrivateIpAddress']==proxy.hostname]
if len(selected)!=1:raise RuntimeError('Active proxy identity ambiguous')
i=selected[0];iid=i['InstanceId'];groups=i['SecurityGroups']
if len(groups)!=1:raise RuntimeError('Expected one proxy security group')
sg=groups[0]['GroupId'];lambda_groups=config['VpcConfig']['SecurityGroupIds']
if len(lambda_groups)!=1:raise RuntimeError('Expected one Lambda security group')
lg=lambda_groups[0]
def update_environments(changes):
 for name in [FUNCTION,FUNCTION+'-inventory']:
  current=aws('lambda','get-function-configuration','--function-name',name)
  env=current['Environment']['Variables']
  if urllib.parse.urlparse(env['CERTSCORE_V2_DAG_LAMBDA_PROXY_SERVER']).hostname!=proxy.hostname:raise RuntimeError('Inventory proxy differs')
  if a.mode=='enable' and not all(env.get(k) for k in ['CERTSCORE_PROXY_RECORDS_URL','CERTSCORE_PROXY_RECORDS_KEY']):raise RuntimeError('Install first')
  env.update(changes)
  if sum(len(k)+len(v) for k,v in env.items())>4096:raise RuntimeError('Lambda environment capacity exceeded')
  with tempfile.TemporaryDirectory() as d:
   f=pathlib.Path(d,'env.json');f.write_text(json.dumps({'Variables':env}));f.chmod(0o600)
   aws('lambda','update-function-configuration','--function-name',name,'--revision-id',current['RevisionId'],'--environment','file://'+str(f))
  subprocess.run(['aws','--region',a.region,'lambda','wait','function-updated-v2','--function-name',name],check=True)
if a.mode in ['enable','disable']:
 update_environments({'CERTSCORE_PROXY_DESTINATION_ENABLED':'1' if a.mode=='enable' else '0'})
 print(json.dumps({'region':a.region,'mode':a.mode}));raise SystemExit(0)
public_ip=urllib.request.urlopen('https://checkip.amazonaws.com',timeout=5).read().decode().strip()
if not re.fullmatch(r'[0-9.]+',public_ip):raise RuntimeError('Expected IPv4 operator address')
with tempfile.TemporaryDirectory(prefix='certscore-proxy-maint-') as d:
 root=pathlib.Path(d);key=root/'ssh';subprocess.run(['ssh-keygen','-q','-t','ed25519','-N','','-f',str(key)],check=True)
 console=aws('ec2','get-console-output','--instance-id',iid,'--latest')['Output']
 hostkey=next((line.strip() for line in console.splitlines() if line.startswith('ssh-ed25519 ')),None)
 if not hostkey:raise RuntimeError('No AWS-attested SSH host key')
 known=root/'known';known.write_text(i['PublicIpAddress']+' '+ ' '.join(hostkey.split()[:2])+'\n')
 permission=[{'IpProtocol':'tcp','FromPort':22,'ToPort':22,'IpRanges':[{'CidrIp':public_ip+'/32','Description':'Temporary CertScore proxy maintenance'}]}]
 rule=None
 try:
  rule=aws('ec2','authorize-security-group-ingress','--group-id',sg,'--ip-permissions',json.dumps(permission))['SecurityGroupRules'][0]['SecurityGroupRuleId']
  sent=aws('ec2-instance-connect','send-ssh-public-key','--instance-id',iid,'--availability-zone',i['Placement']['AvailabilityZone'],'--instance-os-user','ec2-user','--ssh-public-key','file://'+str(key)+'.pub')
  if not sent.get('Success'):raise RuntimeError('Temporary SSH authorization failed')
  ssh=['ssh','-i',str(key),'-o','BatchMode=yes','-o','ConnectTimeout=10','-o','StrictHostKeyChecking=yes','-o','UserKnownHostsFile='+str(known),'ec2-user@'+i['PublicIpAddress']]
  if a.mode=='inspect':
   subprocess.run(ssh+['free -m; uptime; command -v python3; sudo systemctl is-active squid; sudo squid -v | head -1'],check=True)
  else:
   secret=variables.get('CERTSCORE_PROXY_RECORDS_KEY') or os.urandom(32).hex()
   payload=io.BytesIO()
   with tarfile.open(fileobj=payload,mode='w') as t:
    for name in ['collector.py','install.sh']:
     t.add(pathlib.Path(__file__).with_name(name),arcname=name)
    data=secret.encode();info=tarfile.TarInfo('key');info.size=len(data);info.mode=0o600;t.addfile(info,io.BytesIO(data))
   command="set -eu; d=$(mktemp -d /tmp/certscore-records.XXXXXX); trap 'sudo rm -rf \"$d\"' EXIT; tar -xf - -C \"$d\"; sudo bash \"$d/install.sh\" \"$d\""
   subprocess.run(ssh+[command],input=payload.getvalue(),check=True)
   # Equivalent existing rules are not duplicated.
   ingress=[{'IpProtocol':'tcp','FromPort':43130,'ToPort':43130,'UserIdGroupPairs':[{'GroupId':lg,'Description':'Authenticated destination records'}]}]
   egress=[{'IpProtocol':'tcp','FromPort':43130,'ToPort':43130,'UserIdGroupPairs':[{'GroupId':sg,'Description':'Authenticated destination records'}]}]
   for operation,group,permission in [('authorize-security-group-ingress',sg,ingress),('authorize-security-group-egress',lg,egress)]:
    r=subprocess.run(['aws','--region',a.region,'ec2',operation,'--group-id',group,'--ip-permissions',json.dumps(permission)],capture_output=True,text=True)
    if r.returncode and 'InvalidPermission.Duplicate' not in r.stderr:raise RuntimeError('Records network rule failed')
   update_environments(dict(CERTSCORE_PROXY_RECORDS_KEY=secret,CERTSCORE_PROXY_RECORDS_URL='http://'+proxy.hostname+':43130/records',CERTSCORE_PROXY_DESTINATION_ENABLED='0'))
 finally:
  if rule:aws('ec2','revoke-security-group-ingress','--group-id',sg,'--security-group-rule-ids',rule)
print(json.dumps({'region':a.region,'mode':a.mode,'instance':iid}))
