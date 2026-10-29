import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { transformSync } from "esbuild";

// Execute the actual client component with deterministic hooks, timers and a
// deferred HTTP response. This exercises manual/poll races without a real scan.
function mount(active = false) {
  const slots: unknown[] = [];
  let cursor = 0;
  let effects: Array<() => (() => void) | undefined> = [];
  const timers = new Map<number, { callback: () => Promise<void>; delay: number }>();
  let timerId = 0;
  let reloads = 0;
  const href = "https://certscore.ai/app/admin/scans?traffic=external&scanFrom=eu_de&timeSpan=24h&details=1&page=2&q=a%26b";
  const location = { href, reload: () => { reloads++; } };
  const requests: Array<{ url: string; options: RequestInit }> = [];
  let respond = async () => ({ fingerprint: "scan:one:running", hasActiveScans: true });
  const document = { visibilityState: "visible" };
  const react = {
    useState(initial: unknown) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], (value: unknown) => { slots[index] = value; }];
    },
    useRef(initial: unknown) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useCallback: (callback: unknown) => callback,
    useMemo: (callback: () => unknown) => callback(),
    useEffect: (effect: () => (() => void) | undefined) => { effects.push(effect); },
  };
  const jsx = (type: unknown, props: Record<string, any>) => ({ type, props });
  const module = { exports: {} as Record<string, any> };
  const source = readFileSync("apps/web/app/app/admin/scans/admin-scans-auto-refresh.tsx", "utf8");
  const code = transformSync(source, { loader: "tsx", format: "cjs", jsx: "automatic" }).code;
  runInNewContext(code, {
    exports: module.exports, module, AbortController, document,
    window: {
      location,
      setTimeout(callback: () => Promise<void>, delay: number) {
        timers.set(++timerId, { callback, delay });
        return timerId;
      },
      clearTimeout(id: number) { timers.delete(id); },
    },
    fetch: async (url: string, options: RequestInit) => {
      requests.push({ url, options });
      const body = await respond();
      return { ok: true, json: async () => body };
    },
    require(name: string) {
      if (name === "react") return react;
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      throw new Error(`Unexpected runtime dependency: ${name}`);
    },
  });
  const view = () => {
    cursor = 0;
    effects = [];
    return module.exports.AdminScansAutoRefresh({ targets: [{ kind: "scan", id: "one", status: active ? "running" : "completed" }] });
  };
  const button = () => view().props.children[0].props;
  view();
  const cleanup = effects.map(effect => effect()).filter(Boolean) as Array<() => void>;
  return {
    button, document, location, requests, timers,
    get reloads() { return reloads; },
    respond(callback: typeof respond) { respond = callback; },
    fireNext() {
      const entry = timers.entries().next().value;
      assert.ok(entry, "Expected a scheduled status check");
      timers.delete(entry[0]);
      return entry[1].callback();
    },
    unmount() { cleanup.forEach(callback => callback()); },
  };
}

test("manual refresh performs exactly one document reload, retains every URL filter and disables the pending control", () => {
  const ui = mount();
  const href = ui.location.href;
  assert.equal(ui.button().disabled, false);
  ui.button().onClick();
  ui.button().onClick();
  assert.equal(ui.reloads, 1);
  assert.equal(ui.location.href, href);
  assert.equal(ui.button().disabled, true);
  assert.equal(ui.button().children, "Refreshing…");
  assert.equal(ui.requests.length, 0);
  assert.equal(ui.timers.size, 0, "Idle pages must not poll");
});

test("active polling preserves cadence and reloads both panels only after a changed fingerprint", async () => {
  const ui = mount(true);
  assert.equal([...ui.timers.values()][0]!.delay, 1200);
  await ui.fireNext();
  assert.equal(ui.reloads, 0);
  assert.equal([...ui.timers.values()][0]!.delay, 2500);
  assert.equal(ui.requests[0]!.url, "/api/admin/scans/live-status");
  assert.equal(ui.requests[0]!.options.method, "POST");
  assert.equal(ui.requests[0]!.options.cache, "no-store");
  ui.respond(async () => ({ fingerprint: "scan:one:completed", hasActiveScans: false }));
  await ui.fireNext();
  assert.equal(ui.reloads, 1);
  assert.equal(ui.timers.size, 0);
});

test("a status response arriving after a manual refresh cannot initiate a second navigation", async () => {
  const ui = mount(true);
  let resolve!: (value: { fingerprint: string; hasActiveScans: boolean }) => void;
  ui.respond(() => new Promise(done => { resolve = done; }));
  const poll = ui.fireNext();
  ui.button().onClick();
  resolve({ fingerprint: "scan:one:completed", hasActiveScans: false });
  await poll;
  assert.equal(ui.reloads, 1);
  assert.equal(ui.timers.size, 0);
});

test("hidden pages defer polling and unmount aborts an in-flight status response", async () => {
  const ui = mount(true);
  ui.document.visibilityState = "hidden";
  await ui.fireNext();
  assert.equal(ui.requests.length, 0);
  assert.equal([...ui.timers.values()][0]!.delay, 5000);
  ui.document.visibilityState = "visible";
  let resolve!: (value: { fingerprint: string; hasActiveScans: boolean }) => void;
  ui.respond(() => new Promise(done => { resolve = done; }));
  const poll = ui.fireNext();
  ui.unmount();
  assert.equal(ui.requests[0]!.options.signal!.aborted, true);
  resolve({ fingerprint: "scan:one:completed", hasActiveScans: false });
  await poll;
  assert.equal(ui.reloads, 0);
  assert.equal(ui.timers.size, 0);
});
