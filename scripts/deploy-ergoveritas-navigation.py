"""Publish static crawl navigation and scanner-only robots policy via AWS.
Dry run by default; --apply publishes with ETag guards and saves prior objects.
"""
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]
BUCKET = 'ergoveritas-com-static-199536052647'
REGION = 'us-west-1'
DISTRIBUTION = 'E3334DYFHSC1PR'
OUT = ROOT / 'tmp' / ('ergoveritas-navigation-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
OUT.mkdir(parents=True)

def aws(*args):
    return json.loads(subprocess.check_output(['aws', *args, '--output', 'json'], text=True, stderr=subprocess.PIPE))

assert aws('sts', 'get-caller-identity')['Account'] == '199536052647'
origins = aws('cloudfront', 'get-distribution', '--id', DISTRIBUTION)['Distribution']['DistributionConfig']['Origins']['Items']
assert any(o['DomainName'] == f'{BUCKET}.s3.{REGION}.amazonaws.com' for o in origins)
source = ROOT / 'infra/aws/ergoveritas-navigation'
documents = []
fixture_keys = {f'{p.stem}/index.html': p for p in (source / 'forms').glob('*.html')}
for key in ['index.html', '.well-known/certscore-canary/index.html', 'robots.txt', 'sample_09_03_26_01.html', *fixture_keys]:
    stem = key.replace('/', '_')
    before = OUT / (stem + '.before')
    try:
        head = aws('s3api', 'get-object', '--region', REGION, '--bucket', BUCKET, '--key', key, str(before))
        original = before.read_text()
    except subprocess.CalledProcessError as error:
        if key not in fixture_keys or 'NoSuchKey' not in (error.stderr or ''):
            raise
        head = {'ContentType': 'text/html'}
        original = ''
        before.write_text(original)
    if key == 'index.html':
        snippet = (source / 'homepage.html').read_text()
        if '<!-- ergoveritas-crawl-navigation:start -->' in original:
            changed = re.sub(r'<!-- ergoveritas-crawl-navigation:start -->.*?<!-- ergoveritas-crawl-navigation:end -->\n?', lambda _: snippet, original, flags=re.S)
        else:
            assert original.count('</body>') == 1
            changed = original.replace('</body>', snippet + '</body>')
    elif key == 'sample_09_03_26_01.html':
        changed = original.replace('/.well-known/certscore-canary/broad-baseline-policy.html', '/.well-known/certscore-canary/policy/broad-baseline.html')
    elif key in fixture_keys:
        changed = fixture_keys[key].read_text()
    elif key == 'robots.txt':
        changed = (source / key).read_text()
    else:
        changed = (ROOT / 'infra/aws/ergoveritas-canary' / key).read_text()
    after = OUT / (stem + '.after')
    after.write_text(changed)
    documents.append((key, head, original, changed, after))
print(json.dumps({'backups': str(OUT), 'changed': [d[0] for d in documents if d[2] != d[3]]}), flush=True)
if '--apply' not in sys.argv:
    sys.exit(0)
for key, head, original, changed, after in documents:
    if original == changed:
        continue
    aws('s3api', 'put-object', '--region', REGION, '--bucket', BUCKET, '--key', key,
        '--body', str(after), '--content-type', head.get('ContentType', 'text/html'),
        '--cache-control', 'public,max-age=60', '--server-side-encryption', 'AES256',
        '--metadata', 'source-sha256=' + hashlib.sha256(after.read_bytes()).hexdigest(),
        *(['--if-match', head['ETag']] if head.get('ETag') else ['--if-none-match', '*']))
invalidation = aws('cloudfront', 'create-invalidation', '--distribution-id', DISTRIBUTION,
                   '--paths', '/', '/index.html', '/.well-known/certscore-canary/index.html', '/robots.txt', '/sample_09_03_26_01.html', '/form-inventory-*')['Invalidation']['Id']
print(json.dumps({'invalidation': invalidation}), flush=True)
subprocess.run(['aws', 'cloudfront', 'wait', 'invalidation-completed', '--distribution-id', DISTRIBUTION, '--id', invalidation], check=True)
print('Navigation and robots policy published.', flush=True)
