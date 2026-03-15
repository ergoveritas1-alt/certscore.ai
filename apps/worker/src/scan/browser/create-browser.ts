import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { chromium, type BrowserContextOptions } from "playwright";

function collectBrowserSearchRoots() {
  const configured = process.env.PLAYWRIGHT_BROWSERS_PATH;
  const roots = new Set<string>();

  if (configured && configured !== "0") {
    roots.add(configured);
  }

  roots.add("/ms-playwright");
  roots.add(path.join(homedir(), "Library", "Caches", "ms-playwright"));
  roots.add(path.join(homedir(), ".cache", "ms-playwright"));

  return [...roots];
}

function findBrowserExecutable() {
  const fileCandidates = new Set(["chrome-headless-shell", "Chromium", "chrome", "chromium"]);

  for (const root of collectBrowserSearchRoots()) {
    if (!existsSync(root)) {
      continue;
    }

    const firstLevel = readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory());

    for (const browserDir of firstLevel) {
      const browserPath = path.join(root, browserDir.name);
      const stack = [{ dir: browserPath, depth: 0 }];

      while (stack.length > 0) {
        const current = stack.pop();

        if (!current || current.depth > 4) {
          continue;
        }

        for (const entry of readdirSync(current.dir, { withFileTypes: true })) {
          const entryPath = path.join(current.dir, entry.name);

          if (entry.isFile() && fileCandidates.has(entry.name)) {
            return entryPath;
          }

          if (entry.isDirectory()) {
            stack.push({
              dir: entryPath,
              depth: current.depth + 1
            });
          }
        }
      }
    }
  }

  return undefined;
}

export async function createBrowser(input?: {
  contextOptions?: BrowserContextOptions;
}) {
  let browser;
  const executablePath = findBrowserExecutable();

  try {
    browser = await chromium.launch({
      headless: true,
      executablePath,
      args: ["--no-sandbox", "--disable-dev-shm-usage"]
    });
  } catch (error) {
    throw new Error(
      `Failed to launch Chromium for CertScore scanning. Run pnpm --filter @website-signal-risk-scanner/worker playwright:install and verify the worker runtime can access browser binaries. ${
        error instanceof Error ? error.message : "Unknown browser launch error"
      }`
    );
  }

  const context = await browser.newContext({
    viewport: {
      width: 1366,
      height: 768
    },
    ignoreHTTPSErrors: true,
    ...input?.contextOptions
  });

  return {
    browser,
    context
  };
}
