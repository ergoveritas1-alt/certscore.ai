import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const exec = promisify(execFile);
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
export type ReleaseInputs = { sha: string; fingerprint: string; environment: string; node: string; pnpm: string; clean: boolean };
export type CheckReceipt = {
  version: 1; outputsFingerprint?: string; key: string; command: string[]; cwd: string; inputs: ReleaseInputs;
  startedAt: string; completedAt: string; exitStatus: number; durationMs: number;
};

export function releaseEnvironmentFingerprint(environment: NodeJS.ProcessEnv) {
  const relevant = Object.entries(environment).filter(([key]) =>
    !/^(?:npm_|PNPM_|PWD$|OLDPWD$|SHLVL$|_$|TERM|COLORTERM|INIT_CWD$|PREDEPLOY_RECEIPT_DIR$|CODEX_TOOL_CALL_ID$)/i.test(key))
    .sort(([a], [b]) => a.localeCompare(b));
  return hash(JSON.stringify(relevant));
}

export function portableDependencyMetadata(value: string, root: string) {
  return value.replace(/^prunedAt:.*$/m, 'prunedAt: <installation-time>')
    .replace(/^storeDir:.*$/m, 'storeDir: <pnpm-content-store>')
    .split(root).join('<workspace>');
}

export async function releaseInputs(directory = process.cwd(), options: { portableDependencies?: boolean } = {}): Promise<ReleaseInputs> {
  const git = async (args: string[]) => (await exec('git', args, { cwd: directory, maxBuffer: 16 * 1024 * 1024 })).stdout;
  const [shaText, tree, diff, untracked, status, pnpm] = await Promise.all([
    git(['rev-parse', 'HEAD']), git(['rev-parse', 'HEAD^{tree}']), git(['diff', 'HEAD', '--binary', '--no-ext-diff']),
    git(['ls-files', '--others', '--exclude-standard', '-z']), git(['status', '--porcelain', '--untracked-files=normal']), exec('pnpm', ['--version'], { cwd: directory }),
  ]);
  const sha = shaText.trim();
  // Git's tree plus the complete worktree diff bind all tracked bytes without
  // rereading the unchanged repository for every check. Untracked source and
  // ignored runtime configuration are fingerprinted separately, never logged.
  const fingerprint = createHash('sha256').update(tree).update(diff);
  const files = [...untracked.split('\0').filter(Boolean),
    'config/iplocate/ip-to-country.mmdb', 'config/iplocate/ip-to-asn.mmdb',
    'apps/web/.env.local', 'apps/validation-worker/.env.local', 'node_modules/.modules.yaml'];
  for (const file of [...new Set(files)].sort()) {
    fingerprint.update(`${file}\0`);
    try {
      const bytes = await readFile(path.resolve(directory, file));
      fingerprint.update(hash(options.portableDependencies && file === 'node_modules/.modules.yaml' ? portableDependencyMetadata(bytes.toString('utf8'), directory) : bytes));
    }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') fingerprint.update('missing'); else throw error; }
  }
  return { sha, fingerprint: fingerprint.digest('hex'), environment: releaseEnvironmentFingerprint(process.env),
    node: process.version, pnpm: pnpm.stdout.trim(), clean: !status.trim() };
}

export function receiptMatches(value: unknown, expected: { key: string; command: string[]; inputs: ReleaseInputs }, now = Date.now()): value is CheckReceipt {
  if (!value || typeof value !== 'object') return false;
  const r = value as CheckReceipt;
  const start = Date.parse(r.startedAt), end = Date.parse(r.completedAt);
  return r.version === 1 && r.key === expected.key && r.cwd === '.' && r.exitStatus === 0 &&
    Number.isFinite(r.durationMs) && r.durationMs >= 0 && Number.isFinite(start) && Number.isFinite(end) &&
    end >= start && end <= now && now - end <= 24 * 60 * 60 * 1000 &&
    r.inputs?.clean === true && expected.inputs.clean && /^[a-f0-9]{40}$/.test(r.inputs.sha) &&
    JSON.stringify(r.command) === JSON.stringify(expected.command) &&
    ['sha', 'fingerprint', 'environment', 'node', 'pnpm'].every(key => r.inputs[key as keyof ReleaseInputs] === expected.inputs[key as keyof ReleaseInputs]);
}

export async function writeCheckReceipt(directory: string, receipt: CheckReceipt) {
  await mkdir(directory, { recursive: true });
  const filename = path.join(directory, `${receipt.key}-${randomUUID()}.json`);
  // Immutable attempt files: a failed or historical receipt is never relabeled.
  await writeFile(filename, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  return filename;
}
