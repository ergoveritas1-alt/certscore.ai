/** Controlled A/R evaluation. No AWS clients, credentials or public targets.
 * Usage: node --import tsx scripts/evaluate-ar-bound-dispatch.ts --baseline /path --out /tmp/results
 * The fixed localhost fixture server fails if port 3000 is already occupied.
 */
import {createServer} from "node:http";
import {spawn, execFileSync} from "node:child_process";
import {createRequire} from "node:module";
import {mkdir, readFile, writeFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import path from "node:path";
import {pathToFileURL} from "node:url";

const arg = (key: string) => process.argv[process.argv.indexOf(key) + 1];
const actions = ["accept", "reject"] as const;
const arms = ["baseline", "candidate_default_off", "candidate"] as const;
const cases = ["direct", "localized", "shadow", "scoped", "closed_shadow", "frame", "ready", "ambiguous", "opaque", "replacement", "fragment", "reload"];
const source = path.resolve(process.argv[1]!);

async function worker() {
  const root = path.resolve(arg("--root")), arm = arg("--arm"), repeat = Number(arg("--repeat"));
  const out = path.resolve(arg("--out"));await mkdir(out, {recursive: true});
  const require = createRequire(path.join(root, "packages/certscore-scan-core/package.json"));
  const {chromium} = require("playwright");
  const accept = await import(pathToFileURL(path.join(root, "packages/certscore-scan-core/src/post-accept-observer.ts")).href);
  const reject = await import(pathToFileURL(path.join(root, "packages/certscore-scan-core/src/post-refusal-observer.ts")).href);
  const browser = await chromium.launch({headless: true});
  const newContext = browser.newContext.bind(browser);let page: any;
  browser.newContext = async (options: unknown) => {
    const context = await newContext(options), newPage = context.newPage.bind(context);
    context.newPage = async () => {page = await newPage();return page;};return context;
  };
  const rows: any[] = [];
  try {
    for (const fixture of cases) for (const action of actions) {
      const id = `${arm}-${repeat}-${fixture}-${action}`;
      const url = `http://localhost:3000/fixture/${fixture}/${action}/${id}`;
      const expected = action === "accept" ? "granted" : "denied";
      const recipe = {recipeId: "paired-local-fixture-v1", resolverMethod: "local_fixture_recipe", controlSelector: "#choice", bannerSelector: "#banner",
        ...(fixture === "scoped" ? {controlSelector: "#banner", accessibleControl: {kind: "scoped_accessible_control", scopeSelector: "#banner", intent: action}} : {}),
        ...(fixture === "closed_shadow" ? {controlSelector: "#host", bannerSelector: "#host", accessibleControl: {kind: "closed_shadow_accessible_control", scopeSelector: "#host", intent: action}} : {}),
        ...(["frame", "reload"].includes(fixture) ? {controlFrameUrl: `${url}?frame=1`} : {}),
        confirmation: {kind: "local_storage_equals", key: "consent", expectedValue: expected}};
      const started = Date.now();let mutation: Promise<unknown> | undefined, packet: any, error: string | undefined;
      try {
        const input = {browser, ...(arm === "candidate" ? {boundControlDispatch: true} : arm === "baseline" ? {boundControlDispatch: false} : {}), url, scanId: id,
          interactionAuthorization: {kind: "loopback", authorizationId: "loopback_local_lab"},
          actionSearchTimeoutMs: action === "accept" ? 14000 : 1500,
          confirmationTimeoutMs: action === "accept" ? 2000 : 1500,
          observationWindowMs: action === "accept" ? 3000 : 8000,
          requireFullConfiguredWindow: true,
          onLifecycleEvent: fixture !== "replacement" ? undefined : () => {
            mutation = page.evaluate(({action, id}: {action: string; id: string}) => {
              const opposite = action === "accept" ? "reject" : "accept";
              const element = document.createElement("button");element.id = "choice";element.type = "button";
              element.textContent = opposite === "accept" ? "Accept all" : "Reject all";
              element.onclick = () => {void fetch(`/clicked/${id}/${opposite}`);};
              document.querySelector("#choice")!.replaceWith(element);
            }, {action, id});
          }};
        packet = action === "accept"
          ? await accept.runPostAcceptObserver({...input, recipe: {...recipe, artifactVersion: "certscore.post_accept_action_recipe.v1"}})
          : await reject.runPostRefusalObserver({...input, recipe: {...recipe, artifactVersion: "certscore.post_refusal_action_recipe.v1"}});
        await mutation;
      } catch (caught) {error = String(caught);}
      const clicks = await fetch(`http://localhost:3000/clicks/${id}`).then(r => r.json()) as any[];
      const registration = packet?.acceptanceRegistration ?? packet?.refusalRegistration;
      const capture = packet?.afterActionCapture;
      rows.push({id, arm, repeat, fixture, action, bindingMode: arm === "candidate" ? "explicit-enabled" : arm === "baseline" ? "baseline-disabled" : "input-and-environment-unset",
        browser: browser.version(), runtime: "local-macos-chromium", region: "local-no-aws",
        totalMs: Date.now() - started, clicks, intendedClick: clicks.length === 1 && clicks[0].action === action,
        wrongClick: clicks.some(row => row.action !== action), expectedConfirmation: !["opaque", "replacement", "ambiguous", "reload"].includes(fixture), confirmed: registration?.status === "confirmed",
        observationComplete: capture?.activationStatus === "completed" && capture.stopReason === "window_elapsed" ||
          registration?.status === "confirmed" && packet?.timing.observationExitReason === "window_elapsed",
        requestedWindowMs: packet?.observationWindowMs, observedWindowMs: capture ? capture.captureEndedAtMs - capture.actionDispatchedAtMs :
          packet?.timing.observationEndedAtMs !== undefined && registration?.actionDispatchedAtMs !== undefined
            ? packet.timing.observationEndedAtMs - registration.actionDispatchedAtMs : packet?.timing.observationMs,
        clickOutcome: packet?.interactionDiagnostics?.click.outcome, error});
      await writeFile(path.join(out, `${id}.json`), JSON.stringify({row: rows.at(-1), packet}, null, 2));
      process.stdout.write(`${id}: ${JSON.stringify(rows.at(-1))}\n`);
    }
    await writeFile(path.join(out, "rows.json"), JSON.stringify(rows, null, 2));
  } finally {await browser.close();}
}

async function main() {
  const baseline = path.resolve(arg("--baseline")), candidate = process.cwd(), out = path.resolve(arg("--out"));
  await mkdir(out, {recursive: true});
  const clicks = new Map<string, any[]>();
  const server = createServer((req, res) => {
    const url = new URL(req.url!, "http://localhost:3000"), parts = url.pathname.split("/");
    if (parts[1] === "clicked") {
      const rows = clicks.get(parts[2]!) ?? [];rows.push({action: parts[3], atEpochMs: Date.now()});clicks.set(parts[2]!, rows);res.end("ok");return;
    }
    if (parts[1] === "clicks") {res.setHeader("content-type", "application/json");res.end(JSON.stringify(clicks.get(parts[2]!) ?? []));return;}
    if (parts[1] !== "fixture") {res.setHeader("content-type", "text/plain");res.end("CertScore.ai local A/R evaluation. Controlled fixtures; no AWS dispatch.\n");return;}
    const [, , fixture, action, id] = parts;
    const label = fixture === "localized" ? action === "accept" ? "Alle Cookies akzeptieren" : "Alle Cookies ablehnen" : action === "accept" ? "Accept all" : "Reject all";
    const choice = `<button type="button" id="choice" ${fixture === "ready" ? "disabled" : ""}>${label}</button>`;
    const html = `<section id="banner" role="dialog" aria-label="Cookie consent"><p>Choose consent to optional analytics cookies.</p>${choice}${fixture === "ambiguous" ? choice : ""}</section>`;
    const listener = `const button=root.querySelector('#choice');button.onclick=()=>{${["opaque","reload"].includes(fixture!) ? "" : `localStorage.setItem('consent','${action === "accept" ? "granted" : "denied"}');`}const sent=fetch('/clicked/${id}/${action}');${fixture === "fragment" ? "location.hash='choice';" : ""}${fixture === "reload" ? "sent.then(()=>location.reload());" : ""}};button.disabled=false;`;
    const reloadState = fixture === "reload" && (clicks.get(id!)?.length ?? 0) > 0 ? `localStorage.setItem('consent','${action === "accept" ? "granted" : "denied"}');` : "";
    let content = ["frame", "reload"].includes(fixture!) && !url.search ? `<iframe src="${url.pathname}?frame=1"></iframe>`
      : ["shadow", "closed_shadow"].includes(fixture!) ? `<div id="host"></div><script>const root=document.querySelector('#host').attachShadow({mode:'${fixture === "closed_shadow" ? "closed" : "open"}'});root.innerHTML=${JSON.stringify(html)};${listener}</script>`
      : `${html}<script>const root=document;${reloadState}${fixture === "ready" ? `setTimeout(()=>{${listener}},250)` : listener}</script>`;
    res.setHeader("content-type", "text/html");res.end(`<!doctype html><html lang="${fixture === "localized" ? "de" : "en"}"><head><title>A/R fixture</title></head><body>${content}</body></html>`);
  });
  await new Promise<void>((resolve, reject) => {server.once("error", reject);server.listen(3000, "localhost", resolve);});
  const pin = (directory: string) => {
    const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "packages/certscore-scan-core/src", "packages/certscore-contracts/src", "packages/shared/src", "packages/certscore-vendor-resolver/src", "packages/web-bot-auth/src", "pnpm-lock.yaml"], {cwd: directory, encoding: "utf8"}).trim().split("\n");
    return Promise.all([...new Set(files)].sort().map(async file => [file, createHash("sha256").update(await readFile(path.join(directory, file))).digest("hex")])).then(Object.fromEntries);
  };
  const sourcePins = {baseline: await pin(baseline), candidate: await pin(candidate)};
  await writeFile(path.join(out, "source-pins.json"), JSON.stringify(sourcePins, null, 2));
  const runs: any[] = [];
  try {
    for (let repeat = 0; repeat < 3; repeat++) for (const arm of [...arms.slice(repeat), ...arms.slice(0, repeat)]) {
      const root = arm === "baseline" ? baseline : candidate, destination = path.join(out, `${arm}-${repeat}`);
      const code = await new Promise<number | null>((resolve, reject) => {
        const environment = {...process.env, TSX_TSCONFIG_PATH: path.join(root, "tsconfig.base.json")};
        if (arm === "candidate_default_off") delete environment.CERTSCORE_AR_BOUND_CONTROL_DISPATCH_ENABLED;
        else environment.CERTSCORE_AR_BOUND_CONTROL_DISPATCH_ENABLED = arm === "candidate" ? "1" : "0";
        const child = spawn(process.execPath, ["--import", "tsx", source, "--worker", "--root", root, "--arm", arm, "--repeat", String(repeat), "--out", destination],
          {cwd: root, env: environment, stdio: "inherit"});
        child.once("error", reject);child.once("exit", resolve);
      });
      runs.push({arm, repeat, exitCode: code});
      await writeFile(path.join(out, "runs.json"), JSON.stringify(runs, null, 2));
      // A failed arm stays recorded and stops further target contact.
      if (code !== 0) throw new Error(`${arm}-${repeat} failed (${code})`);
    }
    const rows = (await Promise.all(runs.map(run => readFile(path.join(out, `${run.arm}-${run.repeat}`, "rows.json"), "utf8").then(JSON.parse)))).flat();
    const quantile = (values: number[], p: number) => [...values].sort((a,b)=>a-b)[Math.ceil(values.length*p)-1];
    const summary = Object.fromEntries(arms.map(arm => {
      const selected = rows.filter(row => row.arm === arm);
      return [arm, {denominator: selected.length, intendedClicks: selected.filter(r=>r.intendedClick).length,
        wrongClicks: selected.filter(r=>r.wrongClick).length, confirmations: selected.filter(r=>r.confirmed).length, correctConfirmations: selected.filter(r=>r.confirmed && r.expectedConfirmation).length,
        falseConfirmations: selected.filter(r=>r.confirmed && !r.expectedConfirmation).length,
        completeObservations: selected.filter(r=>r.observationComplete).length, errors: selected.filter(r=>r.error).length,
        medianMs: quantile(selected.map(r=>r.totalMs), .5), p95Ms: quantile(selected.map(r=>r.totalMs), .95)}];
    }));
    assertSourcePins(sourcePins, {baseline: await pin(baseline), candidate: await pin(candidate)});
    const provenance = {baseline, candidate, sourcePinsVerified: true, baselineCommit: execFileSync("git", ["rev-parse", "HEAD"], {cwd: baseline, encoding: "utf8"}).trim(), fixtureOnly: true,
      noPublicTargets: true, noAws: true, repetitions: 3, sourceSha256: createHash("sha256").update(await readFile(source)).digest("hex")};
    await writeFile(path.join(out, "summary.json"), JSON.stringify({provenance, summary, rows}, null, 2));
    process.stdout.write(JSON.stringify(summary, null, 2));
  } finally {await new Promise<void>(resolve => server.close(()=>resolve()));}
}
function assertSourcePins(before: unknown, after: unknown) {if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error("Source drift during evaluation; retain raw attempts without a summary claim.");}
void (process.argv.includes("--worker") ? worker() : main()).catch(error => {console.error(error);process.exitCode=1;});
