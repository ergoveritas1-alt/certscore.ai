const test = require('node:test');
const assert = require('node:assert/strict');
const { startLocalRecordChannel } = require('./local-record-channel.cjs');
const own = '11111111-1111-1111-1111-111111111111';
const other = '22222222-2222-2222-2222-222222222222';
test('channel authenticates and restricts records to exact run-owned tunnels', async () => {
 const line = id => `123 ${id} CONNECT example.com:443 200 1.1.1.1 TCP_TUNNEL`;
 const channel = await startLocalRecordChannel({ tunnelIds: [own], readLines: async () => `${line(own)}\n${line(other)}` });
 try {
  assert.equal((await fetch(channel.url)).status, 401);
  assert.equal((await fetch(channel.url, { headers: { Authorization: 'Bearer wrong' } })).status, 401);
  const response = await fetch(channel.url, { headers: { Authorization: `Bearer ${channel.token}` } });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual((await response.json()).records, [line(own)]);
 } finally { await channel.close(); }
});
test('oversized or unavailable logs do not leak partial records', async () => {
 for (const readLines of [async () => 'x'.repeat(1024 * 1024 + 1), async () => { throw Error('private path'); }]) {
  const channel = await startLocalRecordChannel({ tunnelIds: [own], readLines });
  try {
   const response = await fetch(channel.url, { headers: { Authorization: `Bearer ${channel.token}` } });
   assert.equal(response.status, 503); assert.equal(await response.text(), '');
  } finally { await channel.close(); }
 }
});
