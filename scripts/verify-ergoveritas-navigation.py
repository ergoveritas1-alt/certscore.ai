"""Verify live HTML reachability using homepage anchors only; no sitemap seeding."""
import concurrent.futures, csv, hashlib, json, subprocess, urllib.request, urllib.parse, urllib.robotparser
from html.parser import HTMLParser
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
BASE='https://ergoveritas.com'
UA='ConsentCheckBot/1.0 (+https://consentcheck.site/crawler)'
class Links(HTMLParser):
    def __init__(self): super().__init__(); self.links=[]
    def handle_starttag(self,tag,attrs):
        if tag=='a':
            href=dict(attrs).get('href')
            if href: self.links.append(href)
def norm(url):
    p=urllib.parse.urlsplit(url)
    path=p.path
    if path.endswith('/index.html'): path=path[:-10]
    return urllib.parse.urlunsplit((p.scheme,p.netloc,path.rstrip('/') or '/',p.query,''))
def get(item):
    url,parent,depth=item
    row={'url':url,'discovered_from':parent,'depth':depth,'status':None,'links':[]}
    try:
        with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':UA}),timeout=20) as r:
            data=r.read(4_000_000); row.update(status=r.status,final_url=r.url,content_type=r.headers.get('Content-Type',''),sha256=hashlib.sha256(data).hexdigest())
            if 'text/html' in row['content_type']:
                parser=Links();parser.feed(data.decode('utf8',errors='replace'))
                for href in parser.links:
                    target=urllib.parse.urldefrag(urllib.parse.urljoin(r.url,href))[0]
                    parsed=urllib.parse.urlsplit(target)
                    if parsed.scheme=='https' and parsed.netloc=='ergoveritas.com': row['links'].append(target)
    except Exception as e: row['error']=str(e)
    return row
robots=urllib.request.urlopen(urllib.request.Request(BASE+'/robots.txt',headers={'User-Agent':UA})).read().decode()
rp=urllib.robotparser.RobotFileParser();rp.parse(robots.splitlines())
assert rp.can_fetch(UA,BASE+'/')
assert not rp.can_fetch('Googlebot',BASE+'/')
assert not rp.can_fetch('UnknownCrawler',BASE+'/')
queue=[(BASE+'/','',0)];seen={norm(BASE+'/')};rows=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    while queue and len(rows)<500:
        batch=queue;queue=[]
        for row in pool.map(get,batch):
            rows.append(row)
            for target in row['links']:
                identity=norm(target)
                if identity not in seen and rp.can_fetch(UA,target):
                    seen.add(identity);queue.append((target,row['url'],row['depth']+1))
        print('Fetched',len(rows),'queued',len(queue),flush=True)
# Inventory is used only to check completeness after discovery, never to seed URLs.
keys=json.loads(subprocess.check_output(['aws','s3api','list-objects-v2','--bucket','ergoveritas-com-static-199536052647','--region','us-west-1','--query','Contents[].Key','--output','json'],text=True))
excluded={'404.html','404/index.html','googleda543839578c6383.html'}
expected={norm(BASE+'/'+k):k for k in keys if k.endswith('.html') and k not in excluded}
found={norm(row['url']):row for row in rows if row['status']==200 and 'text/html' in row.get('content_type','')}
missing={url:key for url,key in expected.items() if url not in found}
mismatches=[]
for url,key in expected.items():
    local=ROOT/'infra/aws/ergoveritas-canary'/key
    if key.startswith('.well-known/certscore-canary/') and local.exists() and url in found:
        if hashlib.sha256(local.read_bytes()).hexdigest()!=found[url]['sha256']: mismatches.append(url)
summary={'local_fixture_hash_mismatches':mismatches,'expected_content_pages':len(expected),'verified_content_pages':len(expected.keys() & found.keys()),'missing':missing,'total_urls_fetched':len(rows),'max_expected_depth':max((found[u]['depth'] for u in expected if u in found),default=0),'robots':robots,'errors':[r for r in rows if r.get('error')]}
out=ROOT/'tmp/qa';out.mkdir(exist_ok=True,parents=True)
(out/'ergoveritas-homepage-crawl.json').write_text(json.dumps({'summary':summary,'pages':rows},indent=2))
with (out/'ergoveritas-homepage-crawl.csv').open('w') as f:
    fields=['url','discovered_from','depth','status','final_url','content_type','sha256','error']
    w=csv.DictWriter(f,fieldnames=fields,extrasaction='ignore');w.writeheader();w.writerows(rows)
print(json.dumps(summary,indent=2))
assert not missing
assert not mismatches
assert not summary['errors']
