"""Upload exact saved OCI layers through bounded ECR API parts; research repository only.
AWS API: https://docs.aws.amazon.com/AmazonECR/latest/APIReference/API_UploadLayerPart.html
"""
import json,subprocess,tarfile,hashlib
from pathlib import Path
root=Path('artifacts/research/gpc-controlled-study-2026');private=root/'private';repo='certscore-gpc-research'
def aws(*args):
 return json.loads(subprocess.check_output(['aws','ecr',*args,'--repository-name',repo,'--region','us-west-1','--output','json','--no-cli-pager']))
manifest=json.loads((private/'runtime-image-manifest.json').read_bytes());digest='sha256:'+hashlib.sha256((private/'runtime-image-manifest.json').read_bytes()).hexdigest()
with tarfile.open(private/'research-image.tar') as archive:
 for descriptor in [manifest['config'],*manifest['layers']]:
  d=descriptor['digest'];check=aws('batch-check-layer-availability','--layer-digests',d)
  if any(x.get('layerAvailability')=='AVAILABLE' for x in check.get('layers',[])):
   print('Available',d,flush=True);continue
  statepath=private/('upload-'+d.split(':')[1]+'.json')
  if statepath.exists():state=json.loads(statepath.read_text())
  else:state={**aws('initiate-layer-upload'),'offset':0};statepath.write_text(json.dumps(state))
  stream=archive.extractfile('blobs/sha256/'+d.split(':')[1]);stream.seek(state['offset'])
  while state['offset']<descriptor['size']:
   chunk=stream.read(min(state['partSize'],20*1024*1024));part=private/'ecr-upload-part.bin';part.write_bytes(chunk)
   first=state['offset'];last=first+len(chunk)-1
   response=aws('upload-layer-part','--upload-id',state['uploadId'],'--part-first-byte',str(first),'--part-last-byte',str(last),'--layer-part-blob','fileb://'+str(part))
   assert response['lastByteReceived']==last
   state['offset']=last+1;statepath.write_text(json.dumps(state));print(d[:19],state['offset'],'/',descriptor['size'],flush=True)
  aws('complete-layer-upload','--upload-id',state['uploadId'],'--layer-digests',d);statepath.unlink()
 result=aws('put-image','--image-tag','study-v3-runtime-'+digest[7:19],'--image-manifest','file://'+str(private/'runtime-image-manifest.json'))
 assert result['image']['imageId']['imageDigest']==digest
 (private/'uploaded-image-digest.txt').write_text(digest+'\n');print('Uploaded runtime manifest',digest,flush=True)
