/** Canonical local release entry point: resolve aliases before tsx is loaded. */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
if (!/^v(22|23|24)\./.test(process.version)) throw new Error('Release tools require Node >=22 <25.');
const [script, ...args] = process.argv.slice(2);
if (!script || path.isAbsolute(script) || script.split('/').includes('..')) throw new Error('A repository-relative release script is required.');
const child = spawn(process.execPath, ['--import', 'tsx', script, ...args], {
  cwd: root, stdio: 'inherit',
  env: { ...process.env, TSX_TSCONFIG_PATH: path.join(root, 'tsconfig.base.json') },
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', () => { console.error('Release entry point could not start.'); process.exitCode = 1; });
child.on('exit', (code) => { process.exitCode = code ?? 1; });
