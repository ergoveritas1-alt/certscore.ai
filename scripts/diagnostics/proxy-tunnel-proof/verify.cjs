const fs=require('node:fs');
const {bindRequestEndpoint}=require(require('node:path').resolve('scripts/diagnostics/proxy-tunnel-evidence.ts'));
const read=name=>JSON.parse(fs.readFileSync(`/tmp/certscore-proxy-proof/${name}.json`,'utf8'));
(async()=>{
const attempts=read('attempts'),responses=read('responses');
const {sockets,status}=await require('../bounded-netlog-sockets.cjs').extractNetlogSockets('/tmp/certscore-proxy-proof/netlog.json');
if(status!=='extracted')throw Error('Socket extraction unavailable');
const lines=fs.readFileSync('/tmp/certscore-proxy-proof/tunnels.log','utf8').trim().split('\n');
for(const response of responses){const endpoint=bindRequestEndpoint(response.connectionId,sockets,attempts,lines);if(!endpoint)throw Error('No exact endpoint binding');console.log(JSON.stringify({...response,...endpoint}));}
if(responses.length!==2)throw Error('Expected two independent responses');

})().finally(()=>fs.rmSync('/tmp/certscore-proxy-proof/netlog.json',{force:true})).catch(e=>{console.error(e);process.exitCode=1});
