// Local-only channel prototype. Loopback, per-run bearer token, bounded scan-owned records.
// No raw proxy logs, arbitrary paths or URL-based lookups are exposed to clients.
const http = require('node:http');
const { randomBytes, timingSafeEqual } = require('node:crypto');
async function startLocalRecordChannel({ readLines, tunnelIds }) {
 if (tunnelIds.length > 512 || new Set(tunnelIds).size !== tunnelIds.length || tunnelIds.some(id => !/^[a-f0-9-]{36}$/.test(id))) throw Error('Invalid tunnel scope');
 const owned = new Set(tunnelIds), token = randomBytes(32).toString('hex');
 const expected = Buffer.from(`Bearer ${token}`);
 const server = http.createServer(async (request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  const actual = Buffer.from(request.headers.authorization ?? '');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) { response.writeHead(401).end(); return; }
  if (request.method !== 'GET' || request.url !== '/records') { response.writeHead(404).end(); return; }
  try {
   const text = await readLines();
   if (typeof text !== 'string' || Buffer.byteLength(text) > 1024 * 1024) throw Error('Over budget');
   const lines = text.split('\n');
   if (lines.length > 4096) throw Error('Over budget');
   const records = lines.filter(line => owned.has(line.trim().split(/\s+/)[1]));
   if (records.length > 1024 || records.some(line => Buffer.byteLength(line) > 512)) throw Error('Over budget');
   response.setHeader('Content-Type', 'application/json');
   response.end(JSON.stringify({ version: 1, records }));
  } catch { response.writeHead(503).end(); }
 });
 server.requestTimeout = 2000; server.headersTimeout = 2000;
 await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
 return { url: `http://127.0.0.1:${server.address().port}/records`, token,
  close: () => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }) };
}
module.exports = { startLocalRecordChannel };
