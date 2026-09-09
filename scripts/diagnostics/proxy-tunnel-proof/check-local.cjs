// Local-only acceptance check. Does not update scan records or production config.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { startLocalRecordChannel } = require('./local-record-channel.cjs');
const { extractNetlogSockets } = require('../bounded-netlog-sockets.cjs');
const { bindObservedResponseEndpoint } = require('../proxy-tunnel-evidence.ts');
const maxmind = require('maxmind');
const directory = '/tmp/certscore-proxy-proof';
(async () => {
 const country = await maxmind.open(path.resolve('config/iplocate/ip-to-country.mmdb'));
 const network = await maxmind.open(path.resolve('config/iplocate/ip-to-asn.mmdb'));
 for (const reader of [country, network]) {
  const age = Date.now() - reader.metadata.buildEpoch.getTime();
  assert(age >= 0 && age <= 30 * 86400000, 'Lookup database must be current');
 }
 const results = [];
 for (let run = 0; run < 3; run++) {
  try {
   execFileSync(process.execPath, ['scripts/diagnostics/proxy-tunnel-proof/browser.cjs'], { timeout: 45000, stdio: 'pipe' });
   const start = performance.now();
   // Exactly one read at normal browser completion: no polling, sleeps or retry.
   const attempts = JSON.parse(fs.readFileSync(`${directory}/attempts.json`));
   const channel = await startLocalRecordChannel({ tunnelIds: attempts.map(a => a.id), readLines: async () => execFileSync('docker', ['exec', 'certscore-destination-local-check', 'cat', '/tmp/tunnels.log'], { timeout: 2000, maxBuffer: 1024 * 1024 }).toString() });
   let lines;
   try {
    const response = await fetch(channel.url, { headers: { Authorization: `Bearer ${channel.token}` }, signal: AbortSignal.timeout(2000) });
    assert.equal(response.status, 200);
    lines = (await response.json()).records;
   } finally { await channel.close(); }
   const sockets = await extractNetlogSockets(`${directory}/netlog.json`);
   assert.equal(sockets.status, 'extracted');
   const responses = JSON.parse(fs.readFileSync(`${directory}/responses.json`));
   assert.equal(responses.length, 2);
   const destinations = responses.map(response => {
    const endpoint = bindObservedResponseEndpoint(response, sockets.sockets, attempts, lines);
    assert(endpoint, 'Exact response-to-tunnel evidence must be ready without a tail wait');
    const location = country.get(endpoint.ip), operator = network.get(endpoint.ip);
    assert.match(location?.country_code ?? '', /^[A-Z]{2}$/);
    assert(operator?.org && operator?.asn, 'Network lookup must resolve');
    return { lane: response.lane, ip: endpoint.ip, country: location.country_code, provider: operator.org, asn: operator.asn };
   });
   results.push({ run: run + 1, destinations, extractionAndLocalReadMs: +(performance.now() - start).toFixed(1) });
  } finally { fs.rmSync(`${directory}/netlog.json`, { force: true }); }
 }
 const summary = { status: 'local_transport_and_database_pass', productionIntegrated: false, scope: 'Six HTTPS document responses in three independent browser runs; no collection tail wait. Does not establish full scanner/report or production latency parity.', results };
 fs.writeFileSync(`${directory}/local-acceptance.json`, JSON.stringify(summary, null, 2));
 console.log(JSON.stringify(summary, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
