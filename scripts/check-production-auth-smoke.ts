type SmokeResult = {
  name: string;
  ok: boolean;
  detail: string;
};

const baseUrl = new URL(process.env.LIVE_BASE_URL ?? "https://certscore.ai");
const apexBaseUrl = new URL(process.env.APEX_BASE_URL ?? "https://certscore.ai");
const wwwBaseUrl = new URL(process.env.WWW_BASE_URL ?? "https://www.certscore.ai");

function absoluteUrl(base: URL, path: string) {
  return new URL(path, base).toString();
}

function pass(name: string, detail: string): SmokeResult {
  return { name, ok: true, detail };
}

function fail(name: string, detail: string): SmokeResult {
  return { name, ok: false, detail };
}

async function request(path: string, init: RequestInit = {}) {
  return await fetch(absoluteUrl(baseUrl, path), {
    redirect: "manual",
    ...init
  });
}

async function checkVersion() {
  const response = await request("/api/version");
  if (!response.ok) {
    return fail("version", `Expected 2xx from /api/version, got ${response.status}.`);
  }

  const payload = (await response.json()) as { runtimeTarget?: string; appUrl?: string; gitSha?: string };
  if (payload.runtimeTarget !== "ecs-fargate") {
    return fail("version", `Expected runtimeTarget ecs-fargate, got ${payload.runtimeTarget ?? "missing"}.`);
  }

  return pass("version", `ecs-fargate ${payload.gitSha ?? "unknown-sha"}`);
}

async function checkGoogleButton() {
  const response = await request("/login");
  if (!response.ok) {
    return fail("login", `Expected 2xx from /login, got ${response.status}.`);
  }

  const html = await response.text();
  if (!html.includes("Continue with Google") && !html.includes("Sign in with Google")) {
    return fail("login", "Google OAuth option was not visible in the rendered login HTML.");
  }

  return pass("login", "Google OAuth option is rendered.");
}

async function checkGoogleRedirect() {
  const response = await request("/auth/google?next=%2Fapp");
  const location = response.headers.get("location") ?? "";

  if (![302, 303, 307, 308].includes(response.status)) {
    return fail("google redirect", `Expected redirect from /auth/google, got ${response.status}.`);
  }

  if (!location.startsWith("https://accounts.google.com/")) {
    return fail("google redirect", `Expected Google Accounts redirect, got ${location || "missing location"}.`);
  }

  const redirectUri = new URL(location).searchParams.get("redirect_uri");
  const expectedRedirectUri = absoluteUrl(apexBaseUrl, "/api/auth/callback/google");
  if (redirectUri !== expectedRedirectUri) {
    return fail("google redirect", `Expected redirect_uri ${expectedRedirectUri}, got ${redirectUri ?? "missing"}.`);
  }

  return pass("google redirect", `redirect_uri=${redirectUri}`);
}

async function checkLogoutRedirect() {
  const response = await request("/logout");
  const location = response.headers.get("location") ?? "";
  const expectedLocation = absoluteUrl(apexBaseUrl, "/login?message=signed_out");

  if (![302, 303, 307, 308].includes(response.status)) {
    return fail("logout", `Expected redirect from /logout, got ${response.status}.`);
  }

  if (location !== expectedLocation) {
    return fail("logout", `Expected ${expectedLocation}, got ${location || "missing location"}.`);
  }

  return pass("logout", location);
}

async function checkWwwCanonicalRedirect() {
  const target = new URL("/login?message=signed_out", wwwBaseUrl);
  const response = await fetch(target, { redirect: "manual" });
  const location = response.headers.get("location") ?? "";
  const expectedLocation = absoluteUrl(apexBaseUrl, "/login?message=signed_out");

  if (![301, 308].includes(response.status)) {
    return fail("www canonical", `Expected permanent redirect from ${target.host}, got ${response.status}.`);
  }

  if (location !== expectedLocation) {
    return fail("www canonical", `Expected ${expectedLocation}, got ${location || "missing location"}.`);
  }

  return pass("www canonical", location);
}

async function main() {
  const checks = [checkVersion, checkGoogleButton, checkGoogleRedirect, checkLogoutRedirect, checkWwwCanonicalRedirect];
  const results = await Promise.all(checks.map((check) => check()));

  for (const result of results) {
    const prefix = result.ok ? "PASS" : "FAIL";
    console.log(`${prefix} ${result.name}: ${result.detail}`);
  }

  const failures = results.filter((result) => !result.ok);
  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
