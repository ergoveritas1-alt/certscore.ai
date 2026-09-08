#!/usr/bin/env python3
"""Bounded local Squid tunnel metadata collector; authenticated scan-owned responses."""
import collections, hashlib, hmac, http.server, json, os, re, socket, threading, time
KEY = open(os.environ['CERTSCORE_PROXY_RECORDS_KEY_FILE'], 'rb').read().strip()
if len(KEY) < 32: raise RuntimeError('Invalid record key')
records = collections.OrderedDict()
lock = threading.Lock()
ID = re.compile(r'^[a-f0-9-]{36}$')
TTL = 120
MAX_RECORDS = 16384

def prune(now):
    while records:
        ident, (at, _) = next(iter(records.items()))
        if now-at <= TTL and len(records) <= MAX_RECORDS: break
        records.popitem(last=False)

def receive():
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.bind(('127.0.0.1', int(os.environ.get('CERTSCORE_PROXY_RECORDS_UDP_PORT','43129'))))
    while True:
        data, _ = sock.recvfrom(1024)
        try:
            line = data.decode('ascii').strip()
            fields = line.split()
            if len(line)>512 or len(fields)!=7 or not ID.fullmatch(fields[1]) or fields[2]!='CONNECT': continue
            with lock:
                now=time.monotonic(); prune(now)
                prior=records.get(fields[1])
                # Duplicate evidence is permanently ambiguous during this record's TTL.
                records[fields[1]]=(now, None if prior else line)
                records.move_to_end(fields[1]); prune(now)
        except (UnicodeError, ValueError): pass

class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self,*args): pass # Never log authorization, hostnames, or request bodies.
    def do_POST(self):
        try:
            self.connection.settimeout(2)
            size=int(self.headers.get('Content-Length','0'))
            if self.path!='/records' or not 0<size<=32768: self.send_error(400); return
            body=self.rfile.read(size)
            signature=self.headers.get('X-CertScore-Proof','')
            expected=hmac.new(KEY,body,hashlib.sha256).hexdigest()
            if not hmac.compare_digest(signature,expected): self.send_error(401); return
            request=json.loads(body)
            ids=request.get('ids'); nonce=request.get('nonce')
            if request.get('version')!=1 or not isinstance(ids,list) or len(ids)>512 or len(set(ids))!=len(ids) or any(not isinstance(x,str) or not ID.fullmatch(x) for x in ids) or not isinstance(nonce,str) or not re.fullmatch('[a-f0-9]{48}',nonce): self.send_error(400); return
            with lock:
                prune(time.monotonic())
                selected=[records[x][1] for x in ids if x in records and records[x][1] is not None]
            payload=json.dumps({'version':1,'records':selected},separators=(',',':')).encode()
            self.send_response(200)
            self.send_header('Content-Type','application/json'); self.send_header('Cache-Control','no-store')
            self.send_header('Content-Length',str(len(payload)))
            self.send_header('X-CertScore-Proof',hmac.new(KEY,nonce.encode()+b'\n'+payload,hashlib.sha256).hexdigest())
            self.end_headers(); self.wfile.write(payload)
        except (ValueError, TypeError, KeyError, OSError):
            self.close_connection=True

# Fixed worker pool: idle/bad clients cannot create unbounded threads.
import concurrent.futures
class Server(http.server.HTTPServer):
    request_queue_size=16
    def __init__(self,*args):
        super().__init__(*args); self.pool=concurrent.futures.ThreadPoolExecutor(max_workers=4); self.slots=threading.BoundedSemaphore(16)
    def get_request(self):
        request,address=super().get_request(); request.settimeout(2); return request,address
    def process_request(self,request,address):
        if not self.slots.acquire(False): self.shutdown_request(request); return
        self.pool.submit(self.finish_bounded,request,address)
    def finish_bounded(self,request,address):
        try: self.finish_request(request,address)
        finally: self.shutdown_request(request); self.slots.release()
threading.Thread(target=receive,daemon=True).start()
Server((os.environ.get('CERTSCORE_PROXY_RECORDS_BIND','127.0.0.1'), int(os.environ.get('CERTSCORE_PROXY_RECORDS_HTTP_PORT','43130'))),Handler).serve_forever()
