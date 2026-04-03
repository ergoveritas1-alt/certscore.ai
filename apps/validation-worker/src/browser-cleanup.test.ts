import assert from "node:assert/strict";
import test from "node:test";
import { parseBrowserProcessTable } from "./browser-cleanup";

test("parseBrowserProcessTable extracts managed Chrome profile dirs", () => {
  const rows = parseBrowserProcessTable(`
123 30:00 /Applications/Google Chrome.app/Contents/MacOS/Google Chrome --remote-debugging-port=9323 --user-data-dir=/var/folders/tmp/ws01-hybrid-cdp-worker-2-QsGAeM about:blank
456 35:00 /Users/benmasek/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell --headless --user-data-dir=/var/folders/tmp/playwright_chromiumdev_profile-mYzDnG --remote-debugging-pipe
789 00:20 /bin/zsh -lc echo hello
  `);

  assert.deepEqual(
    rows.map((row) => ({
      elapsedSec: row.elapsedSec,
      pid: row.pid,
      profileDir: row.profileDir
    })),
    [
      {
        elapsedSec: 1800,
        pid: 123,
        profileDir: "/var/folders/tmp/ws01-hybrid-cdp-worker-2-QsGAeM"
      },
      {
        elapsedSec: 2100,
        pid: 456,
        profileDir: "/var/folders/tmp/playwright_chromiumdev_profile-mYzDnG"
      }
    ]
  );
});
