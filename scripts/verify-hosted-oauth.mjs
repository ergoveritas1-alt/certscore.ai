import assert from 'node:assert/strict';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

export const ISSUER = 'https://certscore.ai';
export const RESOURCE = 'https://mcp.certscore.ai/mcp';
export const CLIENT_ID = 'certscore_cursor_hosted_oauth_v1';
export const CALLBACK = 'http://localhost:8787/callback';
export const SCOPES = ['scan:read', 'scan:create', 'mcp'];

export function verifyMetadata(as, resource) {
  assert.equal(as.issuer, ISSUER, 'Unexpected issuer');
  assert.equal(as.authorization_endpoint, `${ISSUER}/oauth/authorize`);
  assert.equal(as.token_endpoint, `${ISSUER}/api/v2/oauth/token`);
  for (const scope of SCOPES) {
    for (const values of [as.scopes_supported, as.self_serve_scopes, resource.scopes_supported]) {
      assert.ok(Array.isArray(values) && values.includes(scope), `Missing advertised scope: ${scope}`);
    }
  }
  assert.ok(as.code_challenge_methods_supported?.includes('S256'));
  assert.ok(as.token_endpoint_auth_methods_supported?.includes('none'));
  assert.ok(as.response_types_supported?.includes('code'));
  assert.ok(as.grant_types_supported?.includes('authorization_code'));
  assert.equal(resource.resource, RESOURCE);
  assert.deepEqual(resource.authorization_servers, [ISSUER]);
}

export function authorizationRequest() {
  const verifier = randomBytes(32).toString('base64url');
  const state = randomBytes(32).toString('base64url');
  const url = new URL(`${ISSUER}/oauth/authorize`);
  url.search = new URLSearchParams({
    response_type: 'code', client_id: CLIENT_ID, redirect_uri: CALLBACK,
    scope: SCOPES.join(' '), resource: RESOURCE, state,
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256', prompt: 'consent',
  }).toString();
  return { url, verifier, state };
}

export function callbackCode(url, expectedState) {
  assert.equal(url.origin + url.pathname, CALLBACK, 'Unexpected callback');
  const states = url.searchParams.getAll('state');
  assert.equal(states.length, 1, 'Missing or duplicate callback state');
  const actual = Buffer.from(states[0]);
  const expected = Buffer.from(expectedState);
  assert.ok(actual.length === expected.length && timingSafeEqual(actual, expected), 'Callback state mismatch');
  assert.ok(!url.searchParams.has('error'), 'Authorization server returned an OAuth error');
  const codes = url.searchParams.getAll('code');
  assert.ok(codes.length === 1 && codes[0].startsWith('mcp_code_') && codes[0].length < 2048, 'Missing or invalid authorization code');
  return codes[0];
}

export function verifyToken(token) {
  assert.equal(token.token_type?.toLowerCase(), 'bearer', 'Expected bearer token');
  assert.ok(typeof token.access_token === 'string' && token.access_token.length > 0, 'Missing access token');
  assert.ok(Number.isFinite(token.expires_in) && token.expires_in > 0, 'Invalid token lifetime');
  for (const scope of SCOPES) assert.ok(token.scope?.split(/\s+/).includes(scope), `Token missing ${scope}`);
}

export function verifyConnection(tools, result) {
  const names = tools.map(tool => tool.name);
  for (const name of ['certscore_get_connection_status', 'certscore_scan_site', 'certscore_get_scan_status', 'certscore_get_scan_bundle']) {
    assert.ok(names.includes(name), `Missing hosted tool: ${name}`);
  }
  assert.ok(!result.isError, 'Connection status returned an MCP error');
  const payload = result.structuredContent;
  assert.equal(payload?.authenticated, true, 'Connection is not authenticated');
  assert.equal(payload?.diagnostics?.mode, 'hosted_oauth', 'Connection is not Hosted OAuth');
  assert.equal(payload?.diagnostics?.workspaceAccess, 'active', 'Workspace access unavailable');
  assert.equal(payload?.diagnostics?.createAllowedByScope, true, 'Create scope unavailable');
  return { tools: names.length, createAllowedByScope: true, canRequestScanNow: payload.diagnostics.canRequestScanNow === true };
}

async function jsonRequest(url, init) {
  const response = await fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(20_000) });
  // Do not print response bodies, callback URLs, tokens, or arbitrary server errors.
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const safeCode = ['invalid_request', 'invalid_client', 'invalid_grant', 'invalid_scope', 'unsupported_grant_type', 'server_error', 'temporarily_unavailable'].includes(body?.error) ? ` (${body.error})` : '';
    throw new Error(`HTTP ${response.status} from ${new URL(url).pathname}${safeCode}`);
  }
  return response.json();
}

async function authorize(as) {
  const request = authorizationRequest();
  let server;
  let timer;
  try {
    const code = await new Promise((resolve, reject) => {
      let received = false;
      server = createServer((req, res) => {
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Referrer-Policy', 'no-referrer');
        if (req.method !== 'GET' || req.headers.host !== 'localhost:8787' || received) {
          res.writeHead(400).end('Callback rejected.'); return;
        }
        try {
          const code = callbackCode(new URL(req.url, CALLBACK), request.state);
          received = true;
          res.end('Code received. Token exchange and MCP verification are still pending in the terminal. This is not Grok connection success.');
          resolve(code);
        } catch {
          res.writeHead(400).end('Callback rejected: verify OAuth state and authorization outcome in your host.');
        }
      });
      server.on('error', reject);
      server.listen(8787, 'localhost', () => {
        console.log('Open this URL yourself to authorize this diagnostic client (tokens stay in memory):');
        console.log(request.url.toString());
        console.log('prompt=consent is requested; review the CertScore connection destination and access before selecting Connect.');
      });
      timer = setTimeout(() => reject(new Error('Authorization timed out after five minutes')), 300_000);
    });
    const token = await jsonRequest(as.token_endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', client_id: CLIENT_ID,
        redirect_uri: CALLBACK, code, code_verifier: request.verifier, resource: RESOURCE }),
    });
    verifyToken(token);
    console.log('PASS: code exchange and granted scopes.');
    const client = new Client({ name: 'certscore-oauth-diagnostic', version: '1.0.0' });
    try {
      await client.connect(new StreamableHTTPClientTransport(new URL(RESOURCE), {
        requestInit: { headers: { Authorization: `Bearer ${token.access_token}` } },
      }));
      const tools = await client.listTools();
      const result = await client.callTool({ name: 'certscore_get_connection_status', arguments: {} });
      console.log('PASS: diagnostic MCP connection', verifyConnection(tools.tools, result));
      console.log('Grok agent binding and scan/status/bundle: NOT VERIFIED. No scan was created.');
    } finally { await client.close(); }
  } finally {
    clearTimeout(timer);
    if (server) await new Promise(resolve => server.close(resolve));
  }
}

export async function main(args = process.argv.slice(2)) {
  assert.ok(args.every(arg => arg === '--authorize') && args.length <= 1, 'Usage: node scripts/verify-hosted-oauth.mjs [--authorize]');
  const [as, resource] = await Promise.all([
    jsonRequest(`${ISSUER}/.well-known/oauth-authorization-server`),
    jsonRequest('https://mcp.certscore.ai/.well-known/oauth-protected-resource/mcp'),
  ]);
  verifyMetadata(as, resource);
  console.log('PASS: AS and protected-resource metadata; scan:read scan:create mcp advertised.');
  console.log(`Configured public client: ${CLIENT_ID}; exact callback: ${CALLBACK}`);
  if (args.includes('--authorize')) await authorize(as);
  else console.log('Token exchange, client registration, authenticated MCP, and Grok agent binding: NOT VERIFIED. Use --authorize for an independent client check.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    // Assertion messages are authored above; other errors may contain credentials.
    console.error('FAIL:', error.code === 'ERR_ASSERTION' ? error.message.split('\n')[0]
      : /^HTTP \d{3} from \/[a-z0-9/.-]+(?: \((?:invalid_request|invalid_client|invalid_grant|invalid_scope|unsupported_grant_type|server_error|temporarily_unavailable)\))?$/.test(error.message) ? error.message
      : error.code === 'EADDRINUSE' ? 'Port 8787 is occupied. Stop the other OAuth listener before running this independent diagnostic.'
      : 'OAuth diagnostic failed or timed out. No host E2E pass can be claimed.');
    process.exitCode = 1;
  });
}
