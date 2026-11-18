import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { transformSync } from "esbuild";

test("the dashboard refreshes only on demand and retains every URL filter", () => {
  const href = "https://certscore.ai/app/admin/scans?traffic=external&scanFrom=eu_de&timeSpan=24h&details=1&page=2&q=a%26b";
  let reloads = 0;
  let isRefreshing = false;
  const location = { href, reload: () => { reloads++; } };
  const refreshRequested = { current: false };
  const react = {
    useState: () => [isRefreshing, (value: boolean) => { isRefreshing = value; }],
    useRef: () => refreshRequested,
    useCallback: (callback: () => void) => callback,
  };
  const module = { exports: {} as Record<string, any> };
  const source = readFileSync("apps/web/app/app/admin/scans/admin-scans-refresh-button.tsx", "utf8");
  const code = transformSync(source, { loader: "tsx", format: "cjs", jsx: "automatic" }).code;
  const unexpected = () => assert.fail("The dashboard must not poll or schedule a refresh.");
  runInNewContext(code, {
    exports: module.exports,
    module,
    window: { location, setTimeout: unexpected, setInterval: unexpected },
    fetch: unexpected,
    require(name: string) {
      if (name === "react") return react;
      if (name === "react/jsx-runtime") return { jsx: (_: string, props: unknown) => props };
      throw new Error(`Unexpected runtime dependency: ${name}`);
    },
  });
  const button = () => module.exports.AdminScansRefreshButton();
  assert.equal(button().disabled, false);
  assert.equal(reloads, 0);
  button().onClick();
  button().onClick();
  assert.equal(reloads, 1);
  assert.equal(location.href, href);
  assert.equal(button().disabled, true);
  assert.equal(button().children, "Refreshing…");
});
