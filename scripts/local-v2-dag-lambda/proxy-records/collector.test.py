import hashlib,hmac,http.client,json,os,pathlib,socket,subprocess,tempfile,time,unittest,uuid
class CollectorTest(unittest.TestCase):
 def test_authentication_scope_and_duplicates(self):
  with tempfile.TemporaryDirectory() as d:
   key=b'a'*64; pathlib.Path(d,'key').write_bytes(key)
   def port(kind):
    s=socket.socket(socket.AF_INET,kind);s.bind(('127.0.0.1',0));p=s.getsockname()[1];s.close();return p
   hp,up=port(socket.SOCK_STREAM),port(socket.SOCK_DGRAM)
   env={**os.environ,'CERTSCORE_PROXY_RECORDS_KEY_FILE':d+'/key','CERTSCORE_PROXY_RECORDS_HTTP_PORT':str(hp),'CERTSCORE_PROXY_RECORDS_UDP_PORT':str(up)}
   p=subprocess.Popen(['python3',str(pathlib.Path(__file__).with_name('collector.py'))],env=env)
   def query(ids,valid=True):
    body=json.dumps({'version':1,'nonce':'b'*48,'ids':ids}).encode();c=http.client.HTTPConnection('127.0.0.1',hp,timeout=2)
    c.request('POST','/records',body,{'X-CertScore-Proof':hmac.new(key if valid else b'bad',body,hashlib.sha256).hexdigest()});r=c.getresponse();data=r.read();proof=r.getheader('X-CertScore-Proof');c.close();return r.status,data,proof
   try:
    for _ in range(30):
     try:query([]);break
     except OSError:time.sleep(.05)
    ident=str(uuid.uuid4());other=str(uuid.uuid4());line=f'123 {ident} CONNECT example.com:443 200 8.8.8.8 TCP_TUNNEL'
    s=socket.socket(socket.AF_INET,socket.SOCK_DGRAM);s.sendto(line.encode(),('127.0.0.1',up));time.sleep(.05)
    self.assertEqual(query([ident],False)[0],401)
    self.assertEqual(json.loads(query([other])[1])['records'],[])
    status,data,proof=query([ident]);self.assertEqual(status,200);self.assertEqual(json.loads(data)['records'],[line]);self.assertEqual(proof,hmac.new(key,b'b'*48+b'\n'+data,hashlib.sha256).hexdigest())
    s.sendto(line.encode(),('127.0.0.1',up));time.sleep(.05);self.assertEqual(json.loads(query([ident])[1])['records'],[]);s.close()
   finally:p.terminate();p.wait(timeout=3)
if __name__=='__main__':unittest.main()
