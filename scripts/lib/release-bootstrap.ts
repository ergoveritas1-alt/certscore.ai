import { commandWords } from './scan-release-regressions';
export type BuildManifest = { name: string; scripts?: Record<string, string>; dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
/** Expand only reviewed build wrappers. Unknown lifecycle work fails before any build. */
export function planReleaseBootstrap(packages: Array<{ directory: string; manifest: BuildManifest }>) {
  const names = new Set(packages.map(value => value.manifest.name));
  return packages.map(({ directory, manifest }) => {
    if (manifest.scripts?.prebuild || manifest.scripts?.postbuild) throw new Error(`Unreviewed build lifecycle: ${manifest.name}`);
    const words = commandWords(manifest.scripts?.build ?? '');
    const commands: string[][] = [], segments: string[][] = [[]];
    for (const word of words) { if (word === '&&') segments.push([]); else segments.at(-1)!.push(word); }
    const dependencies = new Set(Object.keys({ ...manifest.dependencies, ...manifest.devDependencies }).filter(name => names.has(name)));
    for (const segment of segments) {
      if (segment[0] === 'pnpm' && segment[1] === '--filter' && segment[3] === 'build' && segment.length === 4 && names.has(segment[2]!)) {
        dependencies.add(segment[2]!); continue;
      }
      if ((segment[0] === 'tsc' && segment.length === 3 && segment[1] === '-p' && segment[2] === 'tsconfig.json') ||
        (manifest.name === '@certscore/mcp' && segment[0] === 'esbuild' && segment.includes('--outfile=dist/certscore-mcp.mjs'))) commands.push(segment);
      else throw new Error(`Unreviewed build command in ${manifest.name}`);
    }
    if (!commands.length || commands[0]?.[0] !== 'tsc') throw new Error(`Missing compiler step in ${manifest.name}`);
    return { key: manifest.name, directory, dependencies: [...dependencies], commands };
  });
}

/** Bind bootstrap reuse to actual generated exports as well as source inputs. */
export async function workspaceExportsFingerprint(root = process.cwd()) {
  const { readdir, readFile, stat } = await import('node:fs/promises');
  const { createHash } = await import('node:crypto');
  const path = await import('node:path');
  const hash = createHash('sha256');
  async function walk(directory: string) {
    for (const item of (await readdir(path.join(root, directory), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = `${directory}/${item.name}`;
      if (item.isDirectory()) await walk(file);
      else if (item.isFile()) hash.update(`${file}\0`).update(await readFile(path.join(root, file)));
      else throw new Error('Unsupported bootstrap export entry.');
    }
  }
  for (const entry of (await readdir(path.join(root, 'packages'), { withFileTypes: true })).filter(value => value.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const directory = `packages/${entry.name}`;
    let manifest: Record<string, unknown>;
    try { manifest = JSON.parse(await readFile(path.join(root, directory, 'package.json'), 'utf8')); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue; throw error; }
    const files: string[] = [];
    const collect = (value: unknown) => { if (typeof value === 'string' && !value.includes('*')) files.push(value); else if (value && typeof value === 'object') Object.values(value).forEach(collect); };
    collect(manifest.exports); collect(manifest.main); collect(manifest.types); collect(manifest.bin);
    for (const file of files) {
      if (!file.replace(/^\.\//, '').startsWith('dist/')) continue;
      if (!(await stat(path.join(root, directory, file))).isFile()) throw new Error(`Missing workspace export for ${manifest.name}.`);
    }
    await walk(`${directory}/dist`);
  }
  return hash.digest('hex');
}
