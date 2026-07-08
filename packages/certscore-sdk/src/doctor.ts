#!/usr/bin/env node
import { CertScoreClient } from "./client.js";
import { CertScoreApiError } from "./errors.js";

type DoctorResult = {
  check: string;
  ok: boolean;
  detail: string;
};

function argValue(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function hasArg(name: string) {
  return process.argv.includes(name);
}

function printResult(result: DoctorResult) {
  const marker = result.ok ? "OK" : "WARN";
  console.log(`${marker} ${result.check}: ${result.detail}`);
}

async function fetchJson(url: string) {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  const body = await response.json().catch(() => null);
  return { body, response };
}

async function main() {
  const baseUrl = (argValue("--base-url") ?? process.env.CERTSCORE_BASE_URL ?? "https://certscore.ai").replace(/\/+$/, "");
  const domain = argValue("--domain") ?? "example.com";
  const apiKey = process.env.CERTSCORE_API_KEY;
  const json = hasArg("--json");
  const results: DoctorResult[] = [];

  try {
    const { body, response } = await fetchJson(`${baseUrl}/api/v2/health`);
    results.push({
      check: "api_v2_health",
      detail: response.ok ? `reachable at ${baseUrl}` : `HTTP ${response.status}`,
      ok: response.ok && Boolean(body)
    });
  } catch (error) {
    results.push({
      check: "api_v2_health",
      detail: error instanceof Error ? error.message : String(error),
      ok: false
    });
  }

  if (!apiKey) {
    results.push({
      check: "api_key",
      detail: "CERTSCORE_API_KEY is not set; skipping authenticated SDK checks.",
      ok: false
    });
  } else {
    const prefix = apiKey.startsWith("cs_rw_") ? "cs_rw_" : apiKey.startsWith("cs_ro_") ? "cs_ro_" : apiKey.slice(0, 8);
    results.push({
      check: "api_key",
      detail: `found ${prefix} key in CERTSCORE_API_KEY`,
      ok: true
    });

    const client = new CertScoreClient({ apiKey, baseUrl });
    try {
      const latest = await client.domains.latest(domain);
      results.push({
        check: "sdk_read",
        detail: latest.scan ? `latest scan found for ${latest.domain}` : `no latest scan for ${latest.domain}; auth/read path succeeded`,
        ok: true
      });
    } catch (error) {
      results.push({
        check: "sdk_read",
        detail:
          error instanceof CertScoreApiError
            ? `HTTP ${error.status}${error.code ? ` ${error.code}` : ""}: ${error.message}`
            : error instanceof Error
              ? error.message
              : String(error),
        ok: false
      });
    }
  }

  results.push({
    check: "scan_create",
    detail: "not exercised by doctor; use a cs_rw_ key with scans.create() to create a real scan.",
    ok: true
  });

  if (json) {
    console.log(
      JSON.stringify(
        {
          baseUrl,
          domain,
          ok: results.every((result) => result.ok || result.check === "api_key"),
          results
        },
        null,
        2
      )
    );
    return;
  }

  for (const result of results) {
    printResult(result);
  }

  if (results.some((result) => !result.ok && result.check !== "api_key")) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
