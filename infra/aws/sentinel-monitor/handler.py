import base64, datetime, hashlib, hmac, json, os, time, uuid, urllib.parse, urllib.request, urllib.error
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
    return sm.get_secret_value(SecretId=name).get("SecretString", "").strip()

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

def html_escape(value):
    return (str(value).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;").replace("'", "&#39;"))

def acquire_hour_lock(hour, run_id):
    """Prevent overlapping hourly runs from consuming duplicate scan quota."""
    try:
        ddb.put_item(
            Item={"pk": "lock#hour#" + str(hour), "runId": run_id, "expiresAt": int(time.time()) + 2 * 3600},
            ConditionExpression="attribute_not_exists(pk)"
        )
        return True
    except ddb.meta.client.exceptions.ConditionalCheckFailedException:
        return False

def corpus_preflight(pages):
    """Validate page availability and canary provenance before spending scan quota."""
    issues = []
    for page in pages:
        url = ROOT + page["url"]
        try:
            req = urllib.request.Request(url, headers={"user-agent": "CertScore-canary-preflight/1.0"})
            with urllib.request.urlopen(req, timeout=20) as response:
                body = response.read(256 * 1024).decode(errors="replace")
                if response.status != 200:
                    issues.append({"page": page.get("key"), "issue": "preflight HTTP status " + str(response.status)})
                if response.headers.get("X-Test-Environment") != "canary-compliance-testing":
                    issues.append({"page": page.get("key"), "issue": "missing X-Test-Environment canary header"})
                if "CANARY TEST PAGE" not in body and "controlled test environment" not in body:
                    issues.append({"page": page.get("key"), "issue": "canary provenance marker missing from source"})
        except Exception as e:
            issues.append({"page": page.get("key"), "issue": "preflight failed: " + str(e)[:500]})
    return issues

def status(x):
    return str((x or {}).get("status", "")).lower()

def parse_utc_timestamp(value):
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        parsed = datetime.datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=datetime.timezone.utc)
        return parsed.astimezone(datetime.timezone.utc)
    except ValueError:
        return None

def scan_creation_metadata_reports_reuse(created):
    created = created if isinstance(created, dict) else {}
    return bool(
        created.get("reused") is True
        or created.get("executionMode") == "reused_scan"
        or created.get("freshnessDecision") in ("reused_existing_scan", "returned_stale_while_refreshing")
    )

def assess_authoritative_freshness(requested_url, run_started_at, authoritative, created=None):
    """Verify freshness and page identity from the persisted scan resource.

    MCP creation metadata is retained only as a diagnostic because an active
    refresh can transiently describe reuse even when the durable scan is new.
    """
    authoritative = authoritative if isinstance(authoritative, dict) else {}
    returned_url = authoritative.get("url")
    created_at = authoritative.get("createdAt")
    requested = urllib.parse.urlsplit(requested_url) if isinstance(requested_url, str) else None
    returned = urllib.parse.urlsplit(returned_url) if isinstance(returned_url, str) else None
    run_started = parse_utc_timestamp(run_started_at)
    scan_created = parse_utc_timestamp(created_at)
    reasons = []
    reason_codes = []
    if not requested or not requested.hostname or not returned or not returned.hostname:
        reason_codes.append("authoritative_url_unavailable")
        reasons.append("the persisted scan URL was unavailable")
    elif requested.hostname.lower() != returned.hostname.lower() or requested.path != returned.path:
        reason_codes.append("authoritative_path_mismatch")
        reasons.append("the persisted scan did not retain the requested host and page path")
    if run_started is None or scan_created is None:
        reason_codes.append("authoritative_creation_time_unavailable")
        reasons.append("the persisted scan creation time could not be verified")
    elif scan_created < run_started - datetime.timedelta(seconds=30):
        reason_codes.append("authoritative_scan_reused")
        reasons.append("the persisted scan predates the sentinel run")
    issue = bool(reason_codes)
    return {
        "authoritativeCreatedAt": created_at if isinstance(created_at, str) else None,
        "authoritativeUrl": returned_url if isinstance(returned_url, str) else None,
        "creationMetadataFreshnessDecision": created.get("freshnessDecision") if isinstance(created, dict) else None,
        "creationMetadataReportedReuse": scan_creation_metadata_reports_reuse(created),
        "freshness": "reused_or_path_mismatch" if issue else "new_path",
        "freshnessIssue": issue,
        "freshnessReason": "; ".join(reasons) if reasons else None,
        "freshnessReasonCodes": reason_codes,
    }

def load_authoritative_scan(scan_id, api_key):
    headers = {"authorization": "Bearer " + api_key}
    last_error = None
    for attempt in range(3):
        try:
            return request(API + "/api/v2/scans/" + scan_id, headers=headers, timeout=10)
        except Exception as error:
            last_error = error
            if attempt < 2:
                time.sleep(2 * (attempt + 1))
    raise RuntimeError("authoritative scan verification failed: " + str(last_error)[:400])

def rest_scan(url, loc, client, key):
    headers = {"authorization": "Bearer " + key, "x-certscore-client": client, "content-type": "application/json"}
    created = None
    for attempt in range(6):
        try:
            created = request(API + "/api/v2/scans", "POST", headers, {"url": url, "freshness": "refresh", "scanFrom": loc})
            break
        except RuntimeError as e:
            if not any(code in str(e) for code in ("429", "502", "503", "504")) or attempt == 5:
                raise
            time.sleep(10 + attempt * 10)
    sid = scan_id(created)
    if not sid: raise RuntimeError("submission returned no scan id")
    began = time.time()
    while True:
        try:
            st = request(API + "/api/v2/scans/" + sid + "/status", headers=headers)
        except RuntimeError as e:
            if any(code in str(e) for code in ("502", "503", "504")) and time.time() - began < 840:
                time.sleep(15)
                continue
            raise
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
    call = None
    payload = None
    sid = None
    for attempt in range(3):
        call, _ = mcp_post({"jsonrpc": "2.0", "id": 2 + attempt, "method": "tools/call", "params": {"name": "scan_site", "arguments": {"url": url, "freshness": "refresh", "scanFrom": loc, "waitForCompletion": True}}}, session)
        result = call.get("result", call); payload = result.get("structuredContent", result) if isinstance(result, dict) else result
        if isinstance(payload, dict) and "content" in payload: payload = payload["content"]
        sid = scan_id(payload if isinstance(payload, dict) else result)
        if sid:
            break
        if attempt < 2:
            time.sleep(15 * (attempt + 1))
    if not sid:
        diagnostic = json.dumps(call, ensure_ascii=False)[:500] if call is not None else "empty MCP response"
        raise RuntimeError("MCP submission returned no scan id: " + diagnostic)
    evidence, _ = mcp_post({"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "get_scan_bundle", "arguments": {"scanId": sid, "detail": "evidence", "maxBytes": 24000}}}, session)
    return sid, payload, {"scan": payload, "evidence": evidence}, payload

def signals(value):
    text = json.dumps(value, ensure_ascii=False).lower()
    aliases = {"pre_consent_storage":["pre_consent","pre-consent","storage"],"fingerprinting":["fingerprint"],"policy_runtime_comparison":["policy/runtime","policy_runtime","comparison"],"consent_controls":["consent","accept","reject"],"responsive_geometry":["geometry","viewport"],"aria_controls":["aria"],"shadow_dom":["shadow"],"split_labels":["split_label","nested span"],"false_positive_decoy":["false_positive","decoy"],"truncated_policy":["truncated"],"wrong_domain_supplement":["wrong-domain","wrong_domain"],"missing_topics":["missing_topics","insufficient"],"third_party_iframe":["iframe"],"canvas_fingerprinting":["canvas"],"rtl_layout":["rtl"],"mixed_scripts":["mixed-script","cjk","arabic"],"necessary_only":["necessary-only","essential only"],"localized_controls":["localized","locale"]}
    return {k: any(w in text for w in ws) for k, ws in aliases.items()}

def handler(event, context):
    run_id, started = str(uuid.uuid4()), time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    scanner_failures = []
    corpus_issues = []
    hour = int(time.time() // 3600)
    if not acquire_hour_lock(hour, run_id):
        result = {"runId": run_id, "startedAt": started, "hour": hour, "jobs": 0, "failures": 0, "scannerFailures": 0, "corpusIssues": 0, "skipped": "overlapping_hourly_run"}
        print(json.dumps(result))
        return result
    try:
        manifest = None
        manifest_error = None
        for attempt in range(3):
            try:
                manifest = request(ROOT + "/.well-known/certscore-canary/manifest.json")
                break
            except Exception as e:
                manifest_error = e
                if attempt < 2:
                    time.sleep(5 * (attempt + 1))
        if manifest is None:
            raise RuntimeError(str(manifest_error))
    except Exception as e:
        # Keep the monitor useful during an edge-cache/origin transition. The five
        # sentinel contracts are also pinned here so a manifest outage is itself
        # recorded as a corpus diagnostic rather than preventing all scans or
        # generating a misleading scanner alert.
        corpus_issues.append({"issue": "sentinel manifest unavailable: " + str(e)[:500]})
        manifest = {"sentinelCorpus": {"pages": [
            {"key":"sentinel-broad-baseline","url":"/.well-known/certscore-canary/sentinels/broad-baseline.html","expectedSignals":["pre_consent_storage","fingerprinting","policy_runtime_comparison","consent_controls"]},
            {"key":"sentinel-consent-stress","url":"/.well-known/certscore-canary/sentinels/consent-stress.html","expectedSignals":["responsive_geometry","aria_controls","shadow_dom","split_labels"]},
            {"key":"sentinel-privacy-evidence","url":"/.well-known/certscore-canary/sentinels/privacy-evidence.html","expectedSignals":["false_positive_decoy","truncated_policy","wrong_domain_supplement","missing_topics"]},
            {"key":"sentinel-runtime-transport","url":"/.well-known/certscore-canary/sentinels/runtime-transport.html","expectedSignals":["third_party_iframe","storage","canvas_fingerprinting"]},
            {"key":"sentinel-multilingual-rtl","url":"/.well-known/certscore-canary/sentinels/multilingual-rtl.html","expectedSignals":["rtl_layout","mixed_scripts","necessary_only","localized_controls"]}
        ]}}
    pages = manifest.get("sentinelCorpus", {}).get("pages", [])
    if len(pages) != 5: raise RuntimeError("sentinel manifest does not contain exactly five pages")
    corpus_issues.extend(corpus_preflight(pages))
    key = ssm.get_parameter(Name="/certscore/sentinel/api-key", WithDecryption=True)["Parameter"]["Value"]
    jwt_secret = get_secret("certscore/oauth-jwt-secret")
    # Run exactly three scans per transport (API, SDK, MCP), one from each
    # location. The three page assignments rotate hourly, so all five sentinel
    # contracts are covered over a rolling three-hour window and each page is
    # exercised by every transport over the full rotation.
    selected_pages = [pages[(hour + slot) % len(pages)] for slot in range(len(TRANSPORTS))]
    jobs = [
        {"page": selected_pages[transport_index], "location": loc, "transport": transport}
        for transport_index, transport in enumerate(TRANSPORTS)
        for loc in LOCATIONS
    ]
    results = []
    for job_index, job in enumerate(jobs):
        throttle_seconds = 0 if job_index == 0 else 8 + ((hour + job_index * 7) % 8)
        if throttle_seconds:
            time.sleep(throttle_seconds)
        t = time.time(); p, loc, transport = job["page"], job["location"], job["transport"]
        try:
            fn = mcp_scan if transport == "mcp" else rest_scan
            out = fn(ROOT + p["url"], loc, jwt_secret) if transport == "mcp" else fn(ROOT + p["url"], loc, transport, key)
            sid, st, bundle, created = out; observed = signals(bundle)
            missing = [s for s in p.get("expectedSignals", []) if not observed.get(s)]
            requested_url = ROOT + p["url"]
            try:
                authoritative = load_authoritative_scan(sid, key)
                freshness = assess_authoritative_freshness(requested_url, started, authoritative, created)
            except Exception as error:
                freshness = assess_authoritative_freshness(requested_url, started, {}, created)
                freshness["freshnessVerificationError"] = str(error)[:500]
            freshness_issue = freshness["freshnessIssue"]
            row = {"page": p["key"], "requestedUrl": requested_url, "location": loc, "transport": transport, "scanId": sid, "status": status(st), "durationMs": int((time.time()-t)*1000), "throttleSeconds": throttle_seconds, "expectedSignals": p.get("expectedSignals", []), "observedSignals": [name for name, present in observed.items() if present], "missing": missing, "comparison": "findings_and_evidence", **freshness}
            if missing: corpus_issues.append({**row, "issue": "required signals missing: " + ", ".join(missing)})
            if freshness_issue: scanner_failures.append({**row, "issue": "freshness/path invariant failed: " + freshness["freshnessReason"]})
            if status(st) not in {"completed", "completed_limited", "complete", "limited"}:
                scanner_failures.append({**row, "issue": "scan did not reach a completed terminal status"})
        except Exception as e:
            row = {"page": p["key"], "location": loc, "transport": transport, "durationMs": int((time.time()-t)*1000), "throttleSeconds": throttle_seconds, "error": str(e)}
            scanner_failures.append({**row, "issue": str(e)})
        results.append(row)
    # Regional/transport variance is diagnostic only. It identifies signals that
    # appear on at least one fresh scan but disappear on another, without treating
    # an intentional canary miss as a scanner alert.
    variance = []
    for page in pages:
        page_rows = [r for r in results if r.get("page") == page.get("key") and "error" not in r]
        for signal in page.get("expectedSignals", []):
            present = [f"{r.get('location')}/{r.get('transport')}" for r in page_rows if signal in r.get("observedSignals", [])]
            absent = [f"{r.get('location')}/{r.get('transport')}" for r in page_rows if signal in r.get("missing", [])]
            if present and absent:
                variance.append({"page": page.get("key"), "signal": signal, "present": present, "missing": absent})
    failures = corpus_issues + scanner_failures
    run = {"runId": run_id, "startedAt": started, "hour": hour, "jobs": len(results), "selectedPages": [p["key"] for p in selected_pages], "failures": len(failures), "scannerFailures": len(scanner_failures), "corpusIssues": len(corpus_issues), "regionalVariance": variance, "results": results}
    ddb.put_item(Item={"pk": "run#" + run_id, **run, "expiresAt": int(time.time()) + 90 * 86400})
    if scanner_failures:
        summary = f"{len(scanner_failures)} scanner execution issue(s) detected across {len(results)} sentinel scans. {len(corpus_issues)} expected canary-signal mismatch(es) were recorded for diagnostics but are not alert conditions."
        def failure_line(f):
            return "- page={page} location={location} transport={transport} scanId={sid} issue={issue}".format(
                page=f.get("page", "n/a"), location=f.get("location", "n/a"), transport=f.get("transport", "n/a"),
                sid=f.get("scanId", "n/a"), issue=f.get("issue", "unknown issue")
            )
        body_lines = [
            "EXECUTIVE SUMMARY: " + summary,
            "",
            "Hourly ErgoVeritas sentinel run " + run_id,
            "Started: " + started,
            "",
            *[failure_line(f) for f in scanner_failures]
        ]
        body = "\n".join(body_lines)
        html_rows = "".join(
            "<li><code>page=" + html_escape(f.get("page", "n/a")) + " location=" + html_escape(f.get("location", "n/a")) + " transport=" + html_escape(f.get("transport", "n/a")) + " scanId=" + html_escape(f.get("scanId", "n/a")) + "</code><br>" + html_escape(f.get("issue", "unknown issue")) + "</li>"
            for f in scanner_failures
        )
        html = (
            "<html><body>"
            "<p><strong>EXECUTIVE SUMMARY</strong><br>" + html_escape(summary) + "</p>"
            "<p>Hourly ErgoVeritas sentinel run <code>" + html_escape(run_id) + "</code><br>Started: " + html_escape(started) + "</p>"
            "<h3>Details</h3><ul>" + html_rows + "</ul>"
            "</body></html>"
        )
        ses.send_email(
            FromEmailAddress=os.environ.get("ALERT_FROM", "support@certscore.ai"),
            Destination={"ToAddresses": ["support@certscore.ai"]},
            Content={"Simple": {
                "Subject": {"Data": "[CertScore scanner alert] " + str(len(scanner_failures)) + " issue(s)"},
                "Body": {"Text": {"Data": body}, "Html": {"Data": html}}
            }}
        )
    print(json.dumps(run)); return run
