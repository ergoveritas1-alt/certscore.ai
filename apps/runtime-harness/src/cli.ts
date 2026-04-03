import path from "node:path";
import { mkdir } from "node:fs/promises";
import { executeMode } from "./core/capture";
import { createComparisonReport, modeSlug, writeHybridAutoReportBundle, writeRuntimeArtifacts } from "./core/report";
import type { RuntimeFactory } from "./core/capture";
import type { AutoDecisionSummary, RuntimeLogger, RuntimeMode, RuntimeOptions } from "./core/types";
import { PlaywrightCdpRuntime } from "./runtimes/playwrightCdp";
import { PlaywrightLocalRuntime } from "./runtimes/playwrightLocal";
import { PlaywrightRemoteCdpRuntime } from "./runtimes/playwrightRemoteCdp";
import { SeleniumChromeRuntime } from "./runtimes/seleniumChrome";
import { applyHybridAutoRuntimeTiming } from "./hybrid-auto-browser-plan";
import { createHybridAutoBrowserPassRunner, runHybridAutoSession } from "./hybrid-auto-browser-pass";

type CliArgs = {
  mode: RuntimeMode | "all" | "auto";
  url: string;
};

function parseArgs(argv: string[]): CliArgs {
  let url: string | null = null;
  let mode: CliArgs["mode"] = "all";

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];
    if (current === "--url" && next) {
      url = next;
      index += 1;
      continue;
    }
    if (current === "--mode" && next) {
      mode = next as CliArgs["mode"];
      index += 1;
    }
  }

  if (!url) {
    throw new Error("Usage: pnpm --filter @website-signal-risk-scanner/runtime-harness scan -- --url https://example.com --mode all");
  }

  return { mode, url };
}

function runtimeLogger(): RuntimeLogger {
  return {
    log(message) {
      console.info(`${new Date().toISOString()} ${message}`);
    }
  };
}

function modeFactories(): Record<RuntimeMode, RuntimeFactory> {
  return {
    "playwright-cdp": ({ context, options }) => new PlaywrightCdpRuntime(context, options),
    "playwright-local": ({ context, options }) => new PlaywrightLocalRuntime(context, options),
    "playwright-remote-cdp": ({ context, options }) => new PlaywrightRemoteCdpRuntime(context, options),
    "selenium-chrome": ({ context, options }) => new SeleniumChromeRuntime(context, options)
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outputRoot = process.env.SCAN_OUTPUT_DIR
    ? path.resolve(process.env.SCAN_OUTPUT_DIR)
    : path.resolve(process.cwd(), "tmp", "runtime-harness", stamp);
  const baseOptions = {
    chromeRemoteDebuggingUrl: process.env.CHROME_REMOTE_DEBUGGING_URL ?? "http://127.0.0.1:9222",
    outputDir: outputRoot,
    remoteCdpWsEndpoint: process.env.REMOTE_CDP_WS_ENDPOINT ?? null,
    userAgent: process.env.SCAN_USER_AGENT ?? null
  };
  const observeMsOverride = process.env.SCAN_OBSERVE_MS ? Number.parseInt(process.env.SCAN_OBSERVE_MS, 10) : null;
  const timeoutMsOverride = process.env.SCAN_TIMEOUT_MS ? Number.parseInt(process.env.SCAN_TIMEOUT_MS, 10) : null;

  const requestedModes: RuntimeMode[] =
    args.mode === "all"
      ? ["playwright-local", "playwright-cdp", "playwright-remote-cdp", "selenium-chrome"]
      : args.mode === "auto"
        ? ["playwright-local"]
        : [args.mode];
  const logger = runtimeLogger();
  const factories = modeFactories();
  const hybridAutoBrowserPassRunner = createHybridAutoBrowserPassRunner();
  const results = [];
  let autoDecisionSummary: AutoDecisionSummary | null = null;

  await mkdir(outputRoot, { recursive: true });

  for (const mode of requestedModes) {
    const options: RuntimeOptions =
      mode === "playwright-local" || mode === "playwright-cdp"
        ? applyHybridAutoRuntimeTiming({
            ...baseOptions,
            mode,
            observeMsOverride,
            timeoutMsOverride
          })
        : {
            ...baseOptions,
            mode,
            observeMs: observeMsOverride ?? 10_000,
            timeoutMs: Math.max(timeoutMsOverride ?? 30_000, (observeMsOverride ?? 10_000) + 5_000)
          };
    try {
      const result =
        mode === "playwright-local" || mode === "playwright-cdp"
          ? (
              await hybridAutoBrowserPassRunner.execute({
                logger,
                mode,
                options,
                requestedUrl: args.url,
                runtimeFactory: factories[mode]
              })
            ).runtimeResult
          : await executeMode({
              logger,
              mode,
              options,
              requestedUrl: args.url,
              runtimeFactory: factories[mode]
            });
      results.push(result);
      if (mode !== "playwright-local" && mode !== "playwright-cdp") {
        await writeRuntimeArtifacts(path.join(outputRoot, modeSlug(mode)), result);
      }
      console.info(`${new Date().toISOString()} [${mode}] complete -> ${path.join(outputRoot, modeSlug(mode))}`);
    } catch (error) {
      console.error(`${new Date().toISOString()} [${mode}] failed`, error);
    }
  }

  if (args.mode === "auto") {
    try {
      const autoSession = await runHybridAutoSession({
        async buildOptions(mode) {
          return applyHybridAutoRuntimeTiming({
            ...baseOptions,
            chromeRemoteDebuggingUrl:
              mode === "playwright-cdp" ? process.env.CHROME_REMOTE_DEBUGGING_URL ?? "http://127.0.0.1:9222" : null,
            mode,
            observeMsOverride,
            timeoutMsOverride
          });
        },
        logger,
        requestedUrl: args.url,
        runner: hybridAutoBrowserPassRunner,
        runtimeFactories: {
          "playwright-cdp": factories["playwright-cdp"],
          "playwright-local": factories["playwright-local"]
        }
      });
      autoDecisionSummary = autoSession.autoDecisionSummary;
      results.push(...autoSession.results);
      for (const result of autoSession.results) {
        console.info(`${new Date().toISOString()} [${result.mode}] complete -> ${path.join(outputRoot, modeSlug(result.mode))}`);
      }
    } catch (error) {
      console.error(`${new Date().toISOString()} [auto] failed`, error);
    }
  }

  const report = createComparisonReport(args.url, results);
  const paths = await writeHybridAutoReportBundle(outputRoot, report, autoDecisionSummary);
  console.info(`${new Date().toISOString()} comparison json ${paths.jsonPath}`);
  console.info(`${new Date().toISOString()} comparison markdown ${paths.markdownPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
