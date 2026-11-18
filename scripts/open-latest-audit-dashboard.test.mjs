import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

test('the stable launcher reopens the published snapshot after latest moves', async () => {
  const fixture = await mkdtemp(path.join(tmpdir(), 'audit-latest-launcher-'));
  let browser;
  try {
    browser = await chromium.launch();
    const scripts = path.join(fixture, 'scripts');
    const state = path.join(fixture, 'artifacts', 'daily-scan-audit');
    const first = path.join(state, 'runs', 'first', 'dashboard');
    const second = path.join(state, 'runs', 'second', 'dashboard');
    for (const folder of [scripts, first, second]) await mkdir(folder, { recursive: true });
    await writeFile(path.join(first, 'dashboard.html'), '<h1>First snapshot</h1>');
    await writeFile(path.join(second, 'dashboard.html'), '<h1>Second snapshot</h1>');
    const launcher = path.join(scripts, 'open-latest-audit-dashboard.html');
    await copyFile(fileURLToPath(new URL('./open-latest-audit-dashboard.html', import.meta.url)), launcher);
    const latest = path.join(state, 'latest');
    await symlink(first, latest, 'dir');

    const context = await browser.newContext();
    const outside = [];
    await context.route('**/*', request => {
      if (request.request().url().startsWith('file:')) return request.continue();
      outside.push(request.request().url());
      return request.abort();
    });
    const open = async page => {
      await page.goto(pathToFileURL(launcher).href, { waitUntil: 'commit' });
      await page.waitForURL(url => url.pathname.endsWith('/latest/dashboard.html') && url.searchParams.has('view'));
      return page.url();
    };

    const older = await context.newPage();
    const firstUrl = await open(older);
    assert.equal(await older.locator('h1').textContent(), 'First snapshot');

    const replacement = path.join(state, '.next-latest');
    await symlink(second, replacement, 'dir');
    await rename(replacement, latest);
    assert.equal(await older.locator('h1').textContent(), 'First snapshot');

    const reopened = await context.newPage();
    const secondUrl = await open(reopened);
    assert.notEqual(secondUrl, firstUrl);
    assert.equal(await reopened.locator('h1').textContent(), 'Second snapshot');

    const thirdUrl = await open(older);
    assert.notEqual(thirdUrl, secondUrl);
    assert.notEqual(thirdUrl, firstUrl);
    assert.equal(await older.locator('h1').textContent(), 'Second snapshot');
    assert.deepEqual(outside, []);
  } finally {
    await browser?.close();
    await rm(fixture, { recursive: true, force: true });
  }
});
