import { copyFile, lstat, mkdir, mkdtemp, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { workspaceExportsFingerprint } from './release-bootstrap';
import type { ShardResult } from './release-shards';

async function requireDirectory(directory: string) {
  if (!(await lstat(directory)).isDirectory()) throw new Error('Bootstrap artifact contains an unsupported directory.');
}

async function copyOutputs(source: string, destination: string, root: string) {
  let bytes = 0, files = 0;
  async function copyDirectory(from: string, to: string) {
    await requireDirectory(from);
    await mkdir(to, { recursive: true });
    for (const entry of await readdir(from, { withFileTypes: true })) {
      const input = path.join(from, entry.name), output = path.join(to, entry.name);
      if (entry.isDirectory()) await copyDirectory(input, output);
      else if (entry.isFile()) {
        bytes += (await lstat(input)).size;
        if (++files > 10_000 || bytes > 128 * 1024 * 1024) throw new Error('Bootstrap artifact exceeds its size bound.');
        await copyFile(input, output);
      } else throw new Error('Bootstrap artifact contains an unsupported entry.');
    }
  }

  const packages = [];
  await requireDirectory(path.join(source, 'packages'));
  for (const item of await readdir(path.join(root, 'packages'), { withFileTypes: true })) {
    if (!item.isDirectory()) continue;
    const relative = path.join('packages', item.name), manifest = path.join(root, relative, 'package.json');
    try { if (!(await lstat(manifest)).isFile()) throw new Error('Invalid workspace package manifest.'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue; throw error; }
    await requireDirectory(path.join(source, relative));
    await copyDirectory(path.join(source, relative, 'dist'), path.join(destination, relative, 'dist'));
    await copyFile(manifest, path.join(destination, relative, 'package.json'));
    packages.push(relative);
  }
  if (!packages.length) throw new Error('Bootstrap artifact has no workspace packages.');
  return packages;
}

export async function publishBootstrapArtifact(destination: string, receipt: ShardResult, root = process.cwd()) {
  await mkdir(destination);
  try {
    await copyOutputs(root, destination, root);
    if (await workspaceExportsFingerprint(destination) !== receipt.outputsFingerprint) throw new Error('Bootstrap artifact fingerprint changed during export.');
    await writeFile(path.join(destination, 'receipt.json'), JSON.stringify(receipt), { flag: 'wx', mode: 0o600 });
  } catch (error) {
    await rm(destination, { recursive: true, force: true });
    throw error;
  }
}

export async function restoreBootstrapArtifact(source: string, fingerprint: string, root = process.cwd()) {
  await requireDirectory(source);
  const stage = await mkdtemp(path.join(root, 'node_modules', '.release-bootstrap-'));
  const installed: string[] = [];
  try {
    const packages = await copyOutputs(source, stage, root);
    if (await workspaceExportsFingerprint(stage) !== fingerprint) throw new Error('Bootstrap artifact fingerprint mismatch.');
    for (const relative of packages) {
      const target = path.join(root, relative, 'dist');
      try { await lstat(target); throw new Error('Bootstrap artifact requires clean package output directories.'); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      await rename(path.join(stage, relative, 'dist'), target);
      installed.push(target);
    }
  } catch (error) {
    for (const target of installed) await rm(target, { recursive: true, force: true });
    throw error;
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}
