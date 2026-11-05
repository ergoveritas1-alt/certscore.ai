import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
const exec = promisify(execFile);

export function assertReleaseToolchain(node: string, pnpm: string, expected: string) {
  if (!/^v?(22|23|24)\./.test(node)) throw new Error('Release preparation requires Node >=22 <25.');
  if (pnpm.trim() !== expected.replace(/^pnpm@/, '')) throw new Error(`Release preparation requires ${expected}.`);
}

// These checks never mutate AWS, download data, invoke a scanner or print credentials.
export async function checkReleasePrerequisites(input: { deployment?: boolean; scanner?: boolean } = {}) {
  const manifest = JSON.parse(await readFile('package.json', 'utf8'));
  const pnpm = await exec('pnpm', ['--version']);
  assertReleaseToolchain(process.version, pnpm.stdout, manifest.packageManager);
  if (input.deployment) {
    for (const [bin, args, label] of [
      ['gh', ['auth', 'status'], 'GitHub authentication'],
      ['aws', ['sts', 'get-caller-identity', '--query', 'Account', '--output', 'text'], 'AWS authentication'],
      ['docker', ['info', '--format', '{{.OSType}}/{{.Architecture}}'], 'Docker daemon'],
      ['docker', ['buildx', 'inspect'], 'Docker Buildx'],
    ] as const) {
      try { await exec(bin, [...args], { timeout: 30_000, maxBuffer: 1024 * 1024 }); }
      catch { throw new Error(`${label} prerequisite failed; command output omitted to protect credentials.`); }
      console.log(`${label}: verified`);
    }
  }
  if (input.scanner) {
    // Retain the canonical offline freshness/type check before any expensive work.
    await exec(process.execPath, ['scripts/verify-iplocate.mjs']);
    console.log('IP country/ASN databases: verified');
  }
}
