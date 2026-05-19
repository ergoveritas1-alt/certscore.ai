#!/usr/bin/env bash
set -u

BASE_URL="${BASE_URL:-https://certscore.ai}"
FAILURES=0
LAST_BODY=""
LAST_HEADERS=""
LAST_STATUS=""
LAST_CONTENT_TYPE=""
LAST_ROUTE=""
LAST_REQUEST_ID=""

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

print_result() {
  local result="$1"
  local label="$2"
  printf '%s %s status=%s content-type=%s route=%s request-id=%s\n' \
    "$result" "$label" "${LAST_STATUS:-n/a}" "${LAST_CONTENT_TYPE:-n/a}" "${LAST_ROUTE:-n/a}" "${LAST_REQUEST_ID:-n/a}"
}

fail() {
  local label="$1"
  local message="$2"
  FAILURES=$((FAILURES + 1))
  print_result "FAIL" "$label"
  printf '  %s\n' "$message"
  if [[ -n "${LAST_BODY:-}" && -f "$LAST_BODY" ]]; then
    printf '  Body: '
    head -c 300 "$LAST_BODY" | tr '\n' ' '
    printf '\n'
  fi
}

pass() {
  print_result "PASS" "$1"
}

header_value() {
  local name="$1"
  awk -v key="$(printf '%s' "$name" | tr '[:upper:]' '[:lower:]')" '
    BEGIN { FS=":" }
    {
      line=$0
      sub(/\r$/, "", line)
      split(line, parts, ":")
      header=tolower(parts[1])
      if (header == key) {
        sub(/^[^:]*:[[:space:]]*/, "", line)
        print line
      }
    }
  ' "$LAST_HEADERS" | tail -n 1
}

request() {
  local path="$1"
  LAST_BODY="$tmp_dir/body.$RANDOM"
  LAST_HEADERS="$tmp_dir/headers.$RANDOM"
  LAST_STATUS="$(curl -sS -L -D "$LAST_HEADERS" -o "$LAST_BODY" -w '%{http_code}' "$BASE_URL$path" || true)"
  LAST_CONTENT_TYPE="$(header_value content-type)"
  LAST_ROUTE="$(header_value x-certscore-route)"
  LAST_REQUEST_ID="$(header_value x-certscore-request-id)"
}

node_check() {
  local label="$1"
  local script="$2"
  BODY_FILE="$LAST_BODY" node -e "$script" >/dev/null 2>&1
  local status=$?
  if [[ $status -ne 0 ]]; then
    fail "$label" "JSON/body validation failed."
    return 1
  fi
  return 0
}

require_diag_headers() {
  local label="$1"
  if [[ "$(header_value x-certscore-pulse)" != "v1" ]]; then
    fail "$label" "Missing x-certscore-pulse: v1."
    return 1
  fi
  if [[ -z "$LAST_ROUTE" ]]; then
    fail "$label" "Missing x-certscore-route."
    return 1
  fi
  if [[ -z "$LAST_REQUEST_ID" ]]; then
    fail "$label" "Missing x-certscore-request-id."
    return 1
  fi
  return 0
}

check_json_route() {
  local label="$1"
  local path="$2"
  local expected_status="$3"
  request "$path"
  if [[ "$LAST_STATUS" != "$expected_status" ]]; then
    fail "$label" "Expected HTTP $expected_status."
    return
  fi
  if [[ "$LAST_CONTENT_TYPE" != application/json* ]]; then
    fail "$label" "Expected JSON content type."
    return
  fi
  require_diag_headers "$label" || return
  pass "$label"
}

check_json_route "health" "/api/v1/pulse-health" "200"
check_json_route "self-test" "/api/v1/pulse-self-test" "200"
node_check "self-test body" '
  const fs = require("fs");
  const body = JSON.parse(fs.readFileSync(process.env.BODY_FILE, "utf8"));
  if (body.ok !== true || body.type !== "certscore_pulse_self_test") process.exit(1);
  if (body.capabilities?.method !== "automated_runtime_analysis") process.exit(1);
  if (!body.capabilities?.observes?.includes("pre_consent_tracking")) process.exit(1);
  if (!body.disclaimer?.includes("automated public-web observations for review")) process.exit(1);
'

request "/api/v1/pulse?url=https://example.com&detail=tiny"
if [[ "$LAST_STATUS" != "200" && "$LAST_STATUS" != "202" ]]; then
  fail "tiny pulse" "Expected HTTP 200 or 202."
elif [[ "$LAST_CONTENT_TYPE" != application/json* ]]; then
  fail "tiny pulse" "Expected JSON content type."
elif ! require_diag_headers "tiny pulse"; then
  true
elif [[ "$LAST_STATUS" == "200" ]]; then
  node_check "tiny pulse" '
    const fs = require("fs");
    const body = JSON.parse(fs.readFileSync(process.env.BODY_FILE, "utf8"));
    const requiredLinks = ["canonicalPulseUrl", "fullReportUrl", "markdownUrl", "docsUrl", "findingsReferenceUrl"];
    if (body.type !== "certscore_pulse") process.exit(1);
    if (!body.summary || !body.disclaimer) process.exit(1);
    if (!requiredLinks.every((key) => body.links?.[key])) process.exit(1);
    if (body.feedback?.email !== "support@certscore.ai") process.exit(1);
    if (body.request?.pulseRequestId || body.feedback?.feedbackUrl) {
      if (!body.feedback?.feedbackUrl || !body.feedback?.positiveUrl || !body.feedback?.negativeUrl) process.exit(1);
    }
    if (body.capabilities?.method !== "automated_runtime_analysis") process.exit(1);
    if (body.agentInterpretation?.responseClass !== "completed_pulse") process.exit(1);
    const topFindings = Array.isArray(body.topFindings) ? body.topFindings : [];
    const risk = body.summary?.riskLevel;
    const score = typeof body.summary?.score === "number" ? body.summary.score : null;
    if (topFindings.length === 0 && ((score !== null && score < 70) || (risk && risk !== "clear" && risk !== "monitor")) && !body.summary.coverageNote) {
      process.exit(1);
    }
  ' && pass "tiny pulse"
else
  pass "tiny pulse"
fi

request "/api/v1/pulse?url=https://example.com&detail=full"
if [[ "$LAST_STATUS" != "200" && "$LAST_STATUS" != "202" ]]; then
  fail "full pulse" "Expected HTTP 200 or 202."
elif [[ "$LAST_CONTENT_TYPE" != application/json* ]]; then
  fail "full pulse" "Expected JSON content type."
elif ! require_diag_headers "full pulse"; then
  true
elif [[ "$LAST_STATUS" == "200" ]]; then
  node_check "full pulse" '
    const fs = require("fs");
    const body = JSON.parse(fs.readFileSync(process.env.BODY_FILE, "utf8"));
    const interruptions = body.coverage?.interruptions;
    if (interruptions !== undefined) {
      if (!Array.isArray(interruptions)) process.exit(1);
      if (!interruptions.every((item) => item && typeof item === "object" && !Array.isArray(item))) process.exit(1);
    }
    if (body.capabilities?.method !== "automated_runtime_analysis") process.exit(1);
    if (body.agentInterpretation?.responseClass !== "completed_pulse") process.exit(1);
  ' && pass "full pulse"
else
  pass "full pulse"
fi

request "/api/v1/pulse?url=https://example.com&format=markdown&detail=standard"
if [[ "$LAST_STATUS" != "200" ]]; then
  fail "markdown pulse" "Expected HTTP 200."
elif [[ "$LAST_CONTENT_TYPE" != text/markdown* ]]; then
  fail "markdown pulse" "Expected markdown content type."
elif ! require_diag_headers "markdown pulse"; then
  true
elif ! grep -q "CertScore provides automated public-web observations for review" "$LAST_BODY"; then
  fail "markdown pulse" "Missing canonical disclaimer."
elif ! grep -Eq "automated runtime analysis|automated public-web" "$LAST_BODY"; then
  fail "markdown pulse" "Missing capabilities or purpose language."
elif grep -q "Scan completed: Not available" "$LAST_BODY"; then
  fail "markdown pulse" "Markdown shows unavailable completed timestamp."
elif ! grep -q "| Field | Value |" "$LAST_BODY"; then
  fail "markdown pulse" "Missing top summary table."
elif ! grep -q "## Highest-priority findings" "$LAST_BODY"; then
  fail "markdown pulse" "Missing stable highest-priority findings heading."
elif ! grep -q "## Privacy and consent signals" "$LAST_BODY"; then
  fail "markdown pulse" "Missing stable privacy and consent heading."
elif ! grep -q "## Coverage and limitations" "$LAST_BODY"; then
  fail "markdown pulse" "Missing stable coverage heading."
else
  pass "markdown pulse"
fi

request "/api/v1/pulse?url=%3A%3A%3A%3A"
if [[ "$LAST_STATUS" != "400" ]]; then
  fail "invalid URL" "Expected HTTP 400."
elif [[ "$LAST_CONTENT_TYPE" != application/json* ]]; then
  fail "invalid URL" "Expected JSON content type."
elif ! require_diag_headers "invalid URL"; then
  true
else
  node_check "invalid URL" '
    const fs = require("fs");
    const body = JSON.parse(fs.readFileSync(process.env.BODY_FILE, "utf8"));
    if (body.type !== "certscore_pulse_error") process.exit(1);
    if (body.error?.code !== "invalid_url") process.exit(1);
    if (!body.disclaimer) process.exit(1);
    if (body.agentInterpretation?.responseClass !== "api_error") process.exit(1);
  ' && pass "invalid URL"
fi

request "/api/v1/pulse/status/pulse_job_nonexistent_test"
if [[ "$LAST_STATUS" != "404" ]]; then
  fail "nonexistent job" "Expected HTTP 404."
elif [[ "$LAST_CONTENT_TYPE" != application/json* ]]; then
  fail "nonexistent job" "Expected JSON content type."
elif ! require_diag_headers "nonexistent job"; then
  true
else
  node_check "nonexistent job" '
    const fs = require("fs");
    const body = JSON.parse(fs.readFileSync(process.env.BODY_FILE, "utf8"));
    if (body.type !== "certscore_pulse_error") process.exit(1);
    if (body.error?.code !== "not_found") process.exit(1);
    if (!body.disclaimer) process.exit(1);
  ' && pass "nonexistent job"
fi

check_openapi() {
  local label="$1"
  local path="$2"
  request "$path"
  if [[ "$LAST_STATUS" != "200" ]]; then
    fail "$label" "Expected HTTP 200."
    return
  fi
  if [[ "$LAST_CONTENT_TYPE" != application/json* ]]; then
    fail "$label" "Expected JSON content type."
    return
  fi
  require_diag_headers "$label" || return
  node_check "$label" '
    const fs = require("fs");
    const body = JSON.parse(fs.readFileSync(process.env.BODY_FILE, "utf8"));
    const schemas = body.components?.schemas ?? {};
    for (const name of ["PulseResponse", "PulseStatus", "PulseError", "PulseFeedback", "PulseCapabilities", "PulseAgentInterpretation", "PulseCoverageInterruption"]) {
      if (!schemas[name]) process.exit(1);
    }
    if (!body.paths?.["/api/v1/pulse"]?.get?.responses?.["200"]?.content?.["application/json"]?.schema) process.exit(1);
    const serialized = JSON.stringify(body);
    if (!serialized.includes("capabilities") || !serialized.includes("agentInterpretation")) process.exit(1);
    for (const header of ["x-certscore-pulse", "x-certscore-route", "x-certscore-request-id"]) {
      if (!serialized.includes(header)) process.exit(1);
    }
    if (!serialized.includes("Retry-After")) process.exit(1);
    if (body.paths?.["/api/v1/openapi.chatgpt.json"]) process.exit(1);
    if (body.info?.title?.includes("GPT Action")) {
      const ops = [];
      const walk = (value) => {
        if (!value || typeof value !== "object") return;
        if (value.operationId) ops.push(value.operationId);
        for (const child of Object.values(value)) walk(child);
      };
      walk(body.paths);
      if (!ops.includes("getPulseForUrl") || !ops.includes("getPulseJobStatus")) process.exit(1);
    }
  ' && pass "$label"
}

check_openapi "openapi" "/api/v1/openapi.json"
check_openapi "chatgpt openapi" "/api/v1/openapi.chatgpt.json"

if [[ "$FAILURES" -gt 0 ]]; then
  printf '\n%d Pulse public verification check(s) failed for %s\n' "$FAILURES" "$BASE_URL"
  exit 1
fi

printf '\nAll Pulse public verification checks passed for %s\n' "$BASE_URL"
