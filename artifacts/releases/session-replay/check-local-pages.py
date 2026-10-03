"""Read-only HTTP/link/metadata verification; run against localhost:3000."""
from html.parser import HTMLParser
from urllib.request import urlopen
from urllib.parse import urlsplit, urljoin
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import json
base='http://localhost:3000'
paths=['/releases','/releases/session-replay-detection','/insights/session-replay-study-2026','/insights','/guides/session-replay-risk']
class Page(HTMLParser):
 def __init__(self): super().__init__(); self.links=[];self.meta={};self.ids=set();self.canonical=None;self.h1=0
 def handle_starttag(self,tag,attrs):
  a=dict(attrs)
  if 'id' in a:self.ids.add(a['id'])
  if tag=='h1':self.h1+=1
  if tag=='a' and 'href' in a:self.links.append(a['href'])
  if tag=='meta':self.meta[a.get('property') or a.get('name')]=a.get('content')
  if tag=='link' and a.get('rel')=='canonical':self.canonical=a.get('href')
def read(path):
 with urlopen(base+path,timeout=120) as response:
  assert response.status==200
  html=response.read().decode();p=Page();p.feed(html);return p,html
pages={path:read(path) for path in paths}; targets=set();results={}
for path,(p,html) in pages.items():
 assert p.h1==1,(path,p.h1)
 assert p.canonical=='https://certscore.ai'+path,(path,p.canonical)
 for href in p.links:
  target=urlsplit(urljoin(base+path,href))
  if target.netloc=='localhost:3000' and not target.query:targets.add(target.path)
 if 'session-replay-detection' in path or 'session-replay-study-2026' in path:
  assert p.meta['og:image']=='https://certscore.ai/images/releases/session-replay-social-card.png'
  assert p.meta['twitter:card']=='summary_large_image'
  for href in p.links:
   if href.startswith('#'):assert href[1:] in p.ids
  assert 'application/ld+json' in html
 results[path]={'status':200,'h1':p.h1,'canonical':p.canonical,'description':p.meta.get('description'),'socialImage':p.meta.get('og:image')}
def check(path):
 with urlopen(base+path,timeout=120) as response:return path,response.status
with ThreadPoolExecutor(max_workers=3) as pool:
 links=dict(pool.map(check,sorted(targets)))
assert all(status==200 for status in links.values()),links
with urlopen(base+'/sitemap.xml') as r: assert '/insights/session-replay-study-2026' in r.read().decode()
with urlopen(base+'/releases/feed.xml') as r: assert '/releases/session-replay-detection' in r.read().decode()
with urlopen(base+'/images/releases/session-replay-social-card.png') as r:
 image=r.read();assert image[:8]==b'\x89PNG\r\n\x1a\n';assert int.from_bytes(image[16:20],'big')==1200;assert int.from_bytes(image[20:24],'big')==630
result={'result':'PASS','pages':results,'linkedInternalRoutes':links,'sitemapAndRSS':'PASS','socialImage':'1200 x 630 PNG'}
Path('artifacts/releases/session-replay/local-page-verification.json').write_text(json.dumps(result,indent=2)+'\n')
print('PASS:',len(pages),'pages;',len(links),'internal link targets; canonical, OG, X, structured data, sitemap, RSS, PNG')
