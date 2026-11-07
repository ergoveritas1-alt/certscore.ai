import { execFileSync } from 'node:child_process';
import { deploymentInputDecision } from './lib/deployment-inputs.mjs';
const [service, base, head = 'HEAD'] = process.argv.slice(2);
if (!service || !base) throw new Error('Usage: node scripts/deployment-inputs.mjs <web|validation|scanners|mcp> <base> [head]');
const git = args => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
let decision;
try {
  git(['cat-file', '-e', `${base}^{commit}`]); git(['cat-file', '-e', `${head}^{commit}`]);
  const files = git(['diff', '--name-only', '--no-renames', '-z', base, head]).split('\0').filter(Boolean);
  decision = await deploymentInputDecision(service, files, file => git(['show', `${base}:${file}`]), file => git(['show', `${head}:${file}`]));
} catch { decision = { service, deploy: true, reasons: [['comparison', 'unknown/unavailable input; deploy conservatively']], ignored: [] }; }
console.log(JSON.stringify(decision));
