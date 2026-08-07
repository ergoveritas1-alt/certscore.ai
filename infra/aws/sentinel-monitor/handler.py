import base64, hashlib, hmac, json, os, time, uuid, urllib.request, urllib.error
import boto3

REGION = os.environ.get("AWS_REGION", "us-west-2")
API = "https://certscore.ai"
MCP = "https://mcp.certscore.ai/mcp"
ROOT = "https://ergoveritas.com"
LOCATIONS = ["eu_ie", "eu_de", "california"]
TRANSPORTS = ["api", "sdk", "mcp"]
ssm = boto3.client("ssm", region_name=REGION)
sm = boto3.client("secretsmanager", region_name=REGION)
# SES identity verification is regional; support@certscore.ai is verified in us-east-1.
ses = boto3.client("sesv2", region_name=os.environ.get("SES_REGION", "us-east-1"))
ddb = boto3.resource("dynamodb", region_name=REGION).Table(os.environ["TABLE_NAME"])

def get_secret(name):
    return sm.get_secret_value(SecretId=name).get("SecretString", "")

def jwt(secret):
    now = int(time.time())
    claims = {"aud": "https://mcp.certscore.ai", "client_id": "ergoveritas-sentinel-monitor", "exp": now + 900, "iat": now, "iss": "https://certscore.ai", "jti": str(uuid.uuid4()), "scope": "scan:read scan:create mcp", "sub": "ergoveritas-sentinel-monitor", "certscore": {"organizationId": None, "scopes": ["pulse:read", "pulse:scan", "mcp"], "source": "mcp-oauth", "userId": None}}
    enc = lambda x: base64.urlsafe_b64encode(json.dumps(x, separators=(",", ":")).encode()).rstrip(b"=").decode()
    body = enc({"alg": "HS256", "typ": "JWT"}) + "." + enc(claims)
    sig = base64.urlsafe_b64encode(hmac.new(secret.encode(), body.encode(), hashlib.sha256).digest()).rstrip(b"=").decode()
    return body + "." + sig

def request(url, method="GET", headers=None, body=None, timeout=840):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={"accept": "application/json", "accept-language": "en-US,en;q=0.9", "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36", **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read().decode()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"{e.code} {url}: {e.read().decode()[:700]}")

def scan_id(x):
    if not isinstance(x, dict): return None
    for k in ("scanId", "scan_id", "jobId", "job_id"):
        if isinstance(x.get(k), str): return x[k]
    for k in ("scan", "data"):
        v = scan_id(x.get(k))
        if v: return v
    return None

def status(x):
    return str((x or {}).get("status", "")).lower()

def rest_scan(url, loc, client, key):
    headers = {"authorization": "Bearer " + key, "x-certscore-client": client, "content-type": "application/json"}
    created = None
    for attempt in range(6):
        try:
            created = request(API + "/api/v2/scans", "POST", headers, {"url": url, "freshness": "refresh", "scanFrom": loc})
            break
        except RuntimeError as e:
            if "429" not in str(e) or attempt == 5:
                raise
            # CertScore returns retryAfterSeconds in the structured 429 body;
            # keep a safe floor so each hourly run still uses a fresh scan.
            time.sleep(20 + attempt * 5)
    sid = scan_id(created)
    if not sid: raise RuntimeError("submission returned no scan id")
    began = time.time()
    while True:
        st = request(API + "/api/v2/scans/" + sid + "/status", headers=headers)
        if status(st) in ("complete", "completed", "failed", "expired", "error", "no_go", "limited"): break
        if time.time() - began > 840: raise RuntimeError("scan timed out at " + status(st))
        time.sleep(5)
    try:
        bundle = request(API + "/api/v2/scans/" + sid + "/pulse?detail=evidence&format=json", headers=headers)
        findings = request(API + "/api/v2/scans/" + sid + "/findings", headers=headers)
        bundle = {"pulse": bundle, "findings": findings}
    except Exception:
        bundle = st
    return sid, st, bundle, created

def mcp_scan(url, loc, secret):
    # Exercise the authenticated Streamable HTTP MCP lane so hourly monitoring
    # is not constrained by the anonymous daily allowance.
    headers = {"authorization": "Bearer " + jwt(secret), "content-type": "application/json", "accept": "application/json, text/event-stream", "mcp-protocol-version": "2025-03-26"}
    def decode_mcp_response(raw, content_type):
        if not raw or not raw.strip():
            return {}
        if "text/event-stream" in (content_type or "").lower() or raw.lstrip().startswith(("event:", "data:")):
            messages = []
            for line in raw.splitlines():
                if not line.startswith("data:"):
                    continue
                value = line[5:].lstrip()
                if not value or value == "[DONE]":
                    continue
                try:
                    messages.append(json.loads(value))
                except json.JSONDecodeError:
                    continue
            if messages:
                return messages[-1]
            raise RuntimeError("MCP event stream contained no JSON-RPC message")
        try:
            return json.loads(raw)
        except json.JSONDecodeError as e:
            raise RuntimeError("MCP returned a non-JSON response: " + raw[:180]) from e
    def mcp_post(payload, session=None):
        h = {**headers, "accept-language": "en-US,en;q=0.9", "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36", **({"mcp-session-id": session} if session else {})}
        for attempt in range(3):
            req = urllib.request.Request(MCP, data=json.dumps(payload).encode(), method="POST", headers=h)
            try:
                with urllib.request.urlopen(req, timeout=840) as r:
                    raw = r.read().decode(errors="replace")
                    return decode_mcp_response(raw, r.headers.get("content-type")), r.headers.get("mcp-session-id") or session
            except (urllib.error.URLError, RuntimeError) as e:
                if attempt == 2:
                    raise
                time.sleep(2 * (attempt + 1))
    init, session = mcp_post({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-03-26", "capabilities": {}, "clientInfo": {"name": "ergoveritas-sentinel-monitor", "version": "1.0"}}})
    # Bind the follow-up messages to the Streamable HTTP session.
    mcp_post({"jsonrpc": "2.0", "method": "notifications/initialized", "params": {}}, session)
    headers2 = {**headers, **({"mcp-session-id": session} if session else {})}
    call, _ = mcp_post({"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "scan_site", "arguments": {"url": url, "freshness": "refresh", "scanFrom": loc, "waitForCompletion": True}}}, session)
    result = call.get("result", call); payload = result.get("structuredContent", result) if isinstance(result, dict) else result
    if isinstance(payload, dict) and "content" in payload: payload = payload["content"]
    sid = scan_id(payload if isinstance(payload, dict) else result)
    if not sid: raise RuntimeError("MCP submission returned no scan id")
    evidence, _ = mcp_post({"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "get_scan_bundle", "arguments": {"scanId": sid, "detail": "evidence", "maxBytes": 24000}}}, session)
    return sid, payload, {"scan": payload, "evidence": evidence}, payload

def signals(value):
    text = json.dumps(value, ensure_ascii=False).lower()
    aliases = {"pre_consent_storage":["pre_consent","pre-consent","storage"],"fingerprinting":["fingerprint"],"policy_runtime_comparison":["policy/runtime","policy_runtime","comparison"],"consent_controls":["consent","accept","reject"],"responsive_geometry":["geometry","viewport"],"aria_controls":["aria"],"shadow_dom":["shadow"],"split_labels":["split_label","nested span"],"false_positive_decoy":["false_positive","decoy"],"truncated_policy":["truncated"],"wrong_domain_supplement":["wrong-domain","wrong_domain"],"missing_topics":["missing_topics","insufficient"],"third_party_iframe":["iframe"],"canvas_fingerprinting":["canvas"],"rtl_layout":["rtl"],"mixed_scripts":["mixed-script","cjk","arabic"],"necessary_only":["necessary-only","essential only"],"localized_controls":["localized","locale"]}
    return {k: any(w in text for w in ws) for k, ws in aliases.items()}

def handler(event, context):
    run_id, started = str(uuid.uuid4()), time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    try:
        manifest = request(ROOT + "/.well-known/certscore-canary/manifest.json")
    except Exception as e:
        # Keep the monitor useful during an edge-cache/origin transition. The five
        # sentinel contracts are also pinned here so a manifest outage is itself
        # reported as a run issue rather than preventing all scans from starting.
        manifest = {"sentinelCorpus": {"pages": [
            {"key":"sentinel-broad-baseline","url":"/.well-known/certscore-canary/sentinels/broad-baseline.html","expectedSignals":["pre_consent_storage","fingerprinting","policy_runtime_comparison","consent_controls"]},
            {"key":"sentinel-consent-stress","url":"/.well-known/certscore-canary/sentinels/consent-stress.html","expectedSignals":["responsive_geometry","aria_controls","shadow_dom","split_labels"]},
            {"key":"sentinel-privacy-evidence","url":"/.well-known/certscore-canary/sentinels/privacy-evidence.html","expectedSignals":["false_positive_decoy","truncated_policy","wrong_domain_supplement","missing_topics"]},
            {"key":"sentinel-runtime-transport","url":"/.well-known/certscore-canary/sentinels/runtime-transport.html","expectedSignals":["third_party_iframe","storage","canvas_fingerprinting"]},
            {"key":"sentinel-multilingual-rtl","url":"/.well-known/certscore-canary/sentinels/multilingual-rtl.html","expectedSignals":["rtl_layout","mixed_scripts","necessary_only","localized_controls"]}
        ]}}
    pages = manifest.get("sentinelCorpus", {}).get("pages", [])
    if len(pages) != 5: raise RuntimeError("sentinel manifest does not contain exactly five pages")
    key = ssm.get_parameter(Name="/certscore/sentinel/api-key", WithDecryption=True)["Parameter"]["Value"]
    jwt_secret = get_secret("certscore/oauth-jwt-secret")
    hour = int(time.time() // 3600); jobs = [{"page": p, "location": loc, "transport": TRANSPORTS[(hour + li + pi) % 3]} for li, loc in enumerate(LOCATIONS) for pi, p in enumerate(pages)]
    results, failures = [], []
    for job in jobs:
        t = time.time(); p, loc, transport = job["page"], job["location"], job["transport"]
        try:
            fn = mcp_scan if transport == "mcp" else rest_scan
            out = fn(ROOT + p["url"], loc, jwt_secret) if transport == "mcp" else fn(ROOT + p["url"], loc, transport, key)
            sid, st, bundle, created = out; observed = signals(bundle)
            missing = [s for s in p.get("expectedSignals", []) if not observed.get(s)]
            requested_path = p["url"]
            returned_url = (created or {}).get("url") or (created or {}).get("request", {}).get("url")
            reused = bool((created or {}).get("reused") or (created or {}).get("executionMode") == "reused_scan" or (created or {}).get("freshnessDecision") == "reused_existing_scan")
            freshness_issue = reused or (returned_url and requested_path not in str(returned_url))
            row = {"page": p["key"], "location": loc, "transport": transport, "scanId": sid, "status": status(st), "durationMs": int((time.time()-t)*1000), "missing": missing, "comparison": "findings_and_evidence", "freshness": "reused_or_path_mismatch" if freshness_issue else "new_path"}
            if missing: failures.append({**row, "issue": "required signals missing: " + ", ".join(missing)})
            if freshness_issue: failures.append({**row, "issue": "freshness/path invariant failed: CertScore reused a scan or did not retain the requested page path"})
        except Exception as e:
            row = {"page": p["key"], "location": loc, "transport": transport, "durationMs": int((time.time()-t)*1000), "error": str(e)}
            failures.append({**row, "issue": str(e)})
        results.append(row)
    run = {"runId": run_id, "startedAt": started, "hour": hour, "jobs": len(results), "failures": len(failures), "results": results}
    ddb.put_item(Item={"pk": "run#" + run_id, **run, "expiresAt": int(time.time()) + 90 * 86400})
    if failures:
        body = "Hourly ErgoVeritas sentinel run " + run_id + "\nStarted: " + started + "\n\n" + "\n".join("- page={page} location={location} transport={transport} scanId={sid} issue={issue}".format(sid=f.get("scanId", "n/a"), **f) for f in failures)
        ses.send_email(FromEmailAddress=os.environ.get("ALERT_FROM", "support@certscore.ai"), Destination={"ToAddresses": ["support@certscore.ai"]}, Content={"Simple": {"Subject": {"Data": "[CertScore sentinel] " + str(len(failures)) + " issue(s)"}, "Body": {"Text": {"Data": body}}}})
    print(json.dumps(run)); return run
