import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import test from 'node:test';
import pg from 'pg';

const require=createRequire(import.meta.url);
const serverOnly=require.resolve('server-only');
(require.cache as Record<string,unknown>)[serverOnly]={id:serverOnly,filename:serverOnly,loaded:true,exports:{}};

test('real OAuth code exchange and refresh preserve consented scopes and reject replay', {skip:!process.env.OAUTH_TRIAL_TEST_DATABASE_URL}, async()=>{
  const url=new URL(process.env.OAUTH_TRIAL_TEST_DATABASE_URL!);
  assert.ok(['localhost','127.0.0.1'].includes(url.hostname));
  const schema='oauth_test_'+randomUUID().replaceAll('-','');
  const admin=new pg.Client({connectionString:url.toString()});await admin.connect();
  const old={DATABASE_URL:process.env.DATABASE_URL,DATABASE_READ_URL:process.env.DATABASE_READ_URL};
  let db: typeof import('@website-signal-risk-scanner/db')|undefined;
  try {
    await admin.query(`create schema ${schema}`);
    url.searchParams.set('options',`-c search_path=${schema}`);
    process.env.DATABASE_URL=url.toString();process.env.DATABASE_READ_URL=url.toString();
    await admin.query(`set search_path to ${schema};
      create table mcp_oauth_clients(client_id text primary key,client_name text,redirect_uris jsonb,scope text[],token_endpoint_auth_method text default 'none',requester_ip_hash text);
      create table organizations(id uuid,plan text,plan_status text);
      create table organization_members(organization_id uuid,user_id uuid);
      create table mcp_oauth_scan_create_grants(grant_kind text,grantee_id text,revoked_at timestamptz);
      create table mcp_oauth_authorization_codes(code_hash text primary key,client_id text,redirect_uri text,code_challenge text,code_challenge_method text,scope text[],organization_id uuid,owner_user_id text,expires_at timestamptz,consumed_at timestamptz);
      create table mcp_oauth_refresh_tokens(token_hash text primary key,family_id text,client_id text,scope text[],organization_id uuid,owner_user_id text,redirect_uri text,expires_at timestamptz,revoked_at timestamptz,last_used_at timestamptz);
    `);
    const oauth=await import('./mcp-oauth');
    db=await import('@website-signal-risk-scanner/db');
    const org=randomUUID(),user=randomUUID();
    await admin.query("insert into organizations values ($1,'free','active');",[org]);
    await admin.query('insert into organization_members values ($1,$2)',[org,user]);
    const callback='http://localhost:8787/callback';
    const registered=await oauth.registerMcpOAuthClient({clientName:'Cursor OAuth local fixture',redirectUris:[callback],requestedScopes:['scan:read','scan:create','mcp'],requesterIpHash:null});
    const client=await oauth.getMcpOAuthClient(registered.clientId);assert.ok(client);
    const context={clientId:client.clientId,organizationId:org,ownerUserId:user};
    const resolution=await oauth.resolveMcpOAuthRequestedScopes({client,context,requestedScopes:['scan:read','mcp']});
    assert.ok(resolution.approvedScopes.includes('scan:create'));
    const verifier='a'.repeat(64),challenge=createHash('sha256').update(verifier).digest('base64url');
    const code=await oauth.createAuthorizationCode({...context,redirectUri:callback,codeChallenge:challenge,scopes:resolution.approvedScopes});
    const request={clientId:client.clientId,code,codeVerifier:verifier,redirectUri:callback};
    assert.equal(await oauth.exchangeAuthorizationCode({...request,codeVerifier:'b'.repeat(64)}),null);
    assert.equal(await oauth.exchangeAuthorizationCode({...request,redirectUri:'http://localhost:8787/other'}),null);
    const grant=await oauth.exchangeAuthorizationCode(request);assert.ok(grant);
    assert.equal(await oauth.exchangeAuthorizationCode(request),null);
    const consent = {...context, redirectUri:callback, scopes: resolution.approvedScopes};
    assert.equal(await oauth.hasReusableMcpOAuthConsent(consent), false, 'first connection requires consent');
    const legacy=await oauth.createRefreshToken({...context,redirectUri:null,scopes:grant.scope});
    assert.equal(await oauth.hasReusableMcpOAuthConsent(consent), false, 'historical grants cannot imply approval of a destination');
    await oauth.rotateRefreshToken(legacy);
    assert.equal(await oauth.hasReusableMcpOAuthConsent(consent), false, 'refresh does not upgrade a historical grant');
    const refresh=await oauth.createRefreshToken({...context,redirectUri:callback,scopes:grant.scope});
    assert.equal(await oauth.hasReusableMcpOAuthConsent(consent), true, 'existing full grant reconnects');
    assert.equal(await oauth.hasReusableMcpOAuthConsent({...consent,redirectUri:'https://other.example/callback'}), false, 'approval is tied to its exact redirect');
    assert.equal(await oauth.hasReusableMcpOAuthConsent({...consent, ownerUserId:randomUUID()}), false);
    assert.equal(await oauth.hasReusableMcpOAuthConsent({...consent, organizationId:randomUUID()}), false);
    assert.equal(await oauth.hasReusableMcpOAuthConsent({...consent, clientId:'another-client'}), false);
    assert.equal(await oauth.hasReusableMcpOAuthConsent({...consent, scopes:['unsupported:scope']}), false);
    await admin.query("update organizations set plan_status='inactive' where id=$1",[org]);
    assert.equal(await oauth.hasReusableMcpOAuthConsent(consent), false);
    await admin.query("update organizations set plan_status='active' where id=$1",[org]);
    await admin.query('delete from organization_members where user_id=$1',[user]);
    assert.equal(await oauth.hasReusableMcpOAuthConsent(consent), false);
    await admin.query('insert into organization_members values ($1,$2)',[org,user]);
    const rotated=await oauth.rotateRefreshToken(refresh);assert.ok(rotated);
    assert.deepEqual(rotated.row.scope,grant.scope);
    assert.equal(await oauth.hasReusableMcpOAuthConsent(consent),true,'rotation preserves consent');
    assert.equal(await oauth.rotateRefreshToken(refresh),null);
    assert.equal(await oauth.hasReusableMcpOAuthConsent(consent),false,'replay revokes the family and consent');
    const readOnly=await oauth.createRefreshToken({...context,redirectUri:callback,scopes:['scan:read','mcp']});
    const readRotated=await oauth.rotateRefreshToken(readOnly);assert.ok(readRotated);
    assert.deepEqual(readRotated.row.scope,['scan:read','mcp']);
    assert.equal(await oauth.hasReusableMcpOAuthConsent(consent),false,'read-only grants cannot silently acquire create');
    assert.equal(await oauth.hasReusableMcpOAuthConsent({...consent,scopes:['scan:read','mcp']}),true);
    await admin.query("update mcp_oauth_refresh_tokens set expires_at=now()-interval '1 second'");
    assert.equal(await oauth.hasReusableMcpOAuthConsent({...consent,scopes:['scan:read','mcp']}),false,'expired grants require consent');
  } finally {
    if(db){await db.getReadPool().end();await db.getWritePool().end();}
    for(const [key,value] of Object.entries(old)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
    await admin.query(`drop schema ${schema} cascade`);await admin.end();
  }
});
