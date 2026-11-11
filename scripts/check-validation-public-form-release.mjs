// Run only after validation CI on a push. Unknown input falls back to installed
// runtime selection. These public forms have no validation worker callers.
import { execFileSync } from 'node:child_process';

const workflow = '.github/workflows/validation-aws-deploy.yml';
const otherWebFiles = new Set([
  '.github/workflows/web-aws-ecs-deploy.yml',
  'apps/web/.env.example',
  'infra/aws/web-ecs/main.tf',
  'infra/aws/web-ecs/variables.tf',
  'scripts/black-friday-browser.test.ts',
  'scripts/check-validation-public-form-release.mjs',
]);
const publicFormPath = /^apps\/web\/(?:app\/(?:\(marketing\)\/black-friday\/|api\/promotions\/black-friday\/|contact-sales\/)|components\/(?:contact-sales\/|promotions\/|ui\/turnstile-challenge\.tsx$)|lib\/(?:promotions\/black-friday\.ts$|turnstile\.ts$)|server\/(?:contact-sales\/|promotions\/|turnstile\.ts$))/;
const git = args => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

const [base, head] = process.argv.slice(2);
let webOnly = false;
try {
  if (![base, head].every(sha => /^[a-f0-9]{40}$/.test(sha ?? ''))) throw new Error('Missing push range');
  git(['merge-base', '--is-ancestor', base, head]);
  const files = git(['diff', '--name-only', '--no-renames', '-z', base, head]).split('\0').filter(Boolean);

  // Allow the rollout selector itself to change when adopting this guard.
  // Other validation workflow settings must match byte for byte.
  const withoutSelector = revision => git(['show', `${revision}:${workflow}`]).replace(
    /^      - name: Select deployment from installed validation runtime inputs\n[\s\S]*?(?=^      - name: )/m,
    '',
  );
  webOnly = files.some(file => publicFormPath.test(file)) && files.every(file =>
    publicFormPath.test(file) || otherWebFiles.has(file) || file.startsWith('docs/') ||
    (file === workflow && withoutSelector(base) === withoutSelector(head))
  );
} catch {
  // Use installed runtime selection when the push range cannot be verified.
}
process.exitCode = webOnly ? 0 : 1;
