import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { transformSync } from "esbuild";

function mount(kind: "snapshot" | "filters", basePath = "/app/admin/scans") {
  const slots: unknown[] = [];
  let cursor = 0;
  const assignments: string[] = [];
  const routes: string[] = [];
  const listeners = new Map<string, (event: { persisted: boolean }) => void>();
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
    useTransition: () => [false, (callback: () => void) => callback()],
    useEffect: (effect: () => unknown) => { effect(); },
  };
  const jsx = (type: unknown, props: Record<string, any>) => ({ type, props });
  const modules = new Map<string, Record<string, any>>();
  function execute(path: string) {
    const module = { exports: {} as Record<string, any> };
    runInNewContext(transformSync(readFileSync(path, "utf8"), { loader: "tsx", format: "cjs", jsx: "automatic" }).code, {
      module, exports: module.exports, URLSearchParams,
      FormData: class {
        constructor(private form: Array<[string, unknown]>) {}
        forEach(callback: (value: unknown, key: string) => void) { this.form.forEach(([key, value]) => callback(value, key)); }
      },
      window: {
        location: { assign: (href: string) => assignments.push(href) },
        addEventListener: (name: string, handler: (event: { persisted: boolean }) => void) => listeners.set(name, handler),
        removeEventListener: (name: string) => listeners.delete(name),
      },
      require(name: string) {
        if (name === "react") return react;
        if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
        if (name === "next/navigation") return { useRouter: () => ({ push: (href: string) => routes.push(href) }) };
        if (name === "next/link") return { default: "a" };
        if (name.endsWith("admin-document-get-form")) return modules.get("document");
        throw new Error(`Unexpected runtime dependency: ${name}`);
      },
    });
    return module.exports;
  }
  modules.set("document", execute("apps/web/components/admin/admin-document-get-form.tsx"));
  const filters = kind === "filters" ? execute("apps/web/app/app/admin/scans/admin-scans-filter-form.tsx") : null;
  const view = () => {
    cursor = 0;
    return kind === "snapshot"
      ? modules.get("document")!.AdminDocumentGetForm({ action: basePath, children: "controls" })
      : filters!.AdminScansFilterForm({ basePath, hasFilters: false, children: "controls", submitFirst: true });
  };
  return { assignments, routes, view, restore: () => listeners.get("pageshow")?.({ persisted: true }) };
}

const entries: Array<[string, unknown]> = [
  ["traffic", "external"], ["scanFrom", "eu_de"], ["details", "1"],
  ["timeSpan", "7d"], ["q", "a&b = c"], ["status", "completed"], ["empty", ""],
];

for (const kind of ["snapshot", "filters"] as const) {
  test(`${kind} applies the chosen period once and preserves the remaining scope`, () => {
    const app = mount(kind);
    let prevented = 0;
    const event = { preventDefault: () => { prevented++; }, currentTarget: entries };
    app.view().props.onSubmit(event);
    app.view().props.onSubmit(event);
    assert.equal(prevented, 2);
    assert.equal(app.assignments.length, 1, "duplicate submits must not race two navigations");
    assert.equal(app.routes.length, 0, "scan filters must not wait on a soft route transition");
    const url = new URL(app.assignments[0]!, "https://certscore.ai");
    assert.equal(url.pathname, "/app/admin/scans");
    assert.equal(url.searchParams.get("timeSpan"), "7d");
    assert.equal(url.searchParams.get("scanFrom"), "eu_de");
    assert.equal(url.searchParams.get("traffic"), "external");
    assert.equal(url.searchParams.get("details"), "1");
    assert.equal(url.searchParams.get("status"), "completed");
    assert.equal(url.searchParams.get("q"), "a&b = c");
    assert.equal(url.searchParams.has("empty"), false);
    assert.equal(app.view().props["aria-busy"], true);
    if (kind === "snapshot") {
      assert.equal(app.view().props.children[0].props.disabled, true);
      assert.equal(app.view().props.children[1].props.role, "status");
    } else {
      assert.equal(app.view().props.children[0].props.disabled, true);
    }
  });
}

test("other admin filter routes preserve their existing soft navigation", () => {
  const app = mount("filters", "/app/admin/pulse");
  app.view().props.onSubmit({ preventDefault() {}, currentTarget: entries });
  assert.equal(app.assignments.length, 0);
  assert.equal(app.routes.length, 1);
  assert.match(app.routes[0]!, /^\/app\/admin\/pulse\?/);
});

test("back/forward cache restoration clears pending state and restores applied controls", () => {
  const app = mount("snapshot");
  let resets = 0;
  const form = Object.assign([...entries], { reset: () => { resets++; } });
  app.view().props.onSubmit({ preventDefault() {}, currentTarget: form });
  assert.equal(app.view().props["aria-busy"], true);
  app.restore();
  assert.equal(resets, 1);
  assert.equal(app.view().props["aria-busy"], false);
  app.view().props.onSubmit({ preventDefault() {}, currentTarget: form });
  assert.equal(app.assignments.length, 2, "a restored page can apply a new filter again");
});
