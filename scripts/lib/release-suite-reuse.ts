import { readFileSync } from 'node:fs';

const packages = {
  'test:report-presentation': '@certscore/api-contracts',
  'test:canonical-projection-parity': '@certscore/api-contracts',
  'test:post-refusal-release': '@certscore/vendor-resolver',
} as const;

/** Replace only a reviewed compile prefix. The normal pnpm script still builds
 * its dependencies for callers outside the verified worker. */
export function verifiedSuiteCommand(command: string[]) {
  const [pnpm, script] = command;
  if (command.length !== 2 || pnpm !== 'pnpm' || !script || !Object.hasOwn(packages, script)) return null;
  const { scripts } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  const dependency = packages[script as keyof typeof packages];
  const assertions = `${script}:assertions`;
  if (scripts?.[script] !== `pnpm --filter ${dependency} build && pnpm run ${assertions}` ||
      typeof scripts?.[assertions] !== 'string' || !scripts[assertions].trim() ||
      [`pre${script}`, `post${script}`].some(key => Object.hasOwn(scripts, key))) return null;
  return ['pnpm', 'run', assertions];
}
