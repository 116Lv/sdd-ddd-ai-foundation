import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exportProject } from '../tools/export-project.mjs';
import { lockName, sha256 } from '../tools/lib/lock.mjs';

const sourceRoot = fileURLToPath(new URL('../', import.meta.url));

export async function writeProjectFile(root, path, bytes) {
  const absolute = join(root, path);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, bytes);
}

export async function readLock(root) {
  return JSON.parse(await readFile(join(root, lockName)));
}

export async function writeLock(root, lock) {
  await writeProjectFile(root, lockName, JSON.stringify(lock, null, 2) + '\n');
}

export async function fixture(t) {
  const parent = await realpath(tmpdir());
  const dir = await mkdtemp(join(parent, 'foundation-update-'));
  t.after(async () => {
    assert.equal(dirname(await realpath(dir)), parent);
    assert.match(relative(parent, dir), /^foundation-update-[^\\/]+$/);
    await rm(dir, { recursive: true, force: true });
  });
  const projectRoot = join(dir, 'project');
  const candidateRoot = join(dir, 'candidate');
  await exportProject({ sourceRoot, targetDir: projectRoot, version: '0.1.0', projectName: '현지 프로젝트' });
  await exportProject({ sourceRoot, targetDir: candidateRoot, version: '0.2.0', projectName: '새 시작 양식' });
  return { dir, projectRoot, candidateRoot };
}

export async function changeManaged(root, changes) {
  const lock = await readLock(root);
  for (const [path, bytes] of Object.entries(changes)) {
    if (bytes === null) {
      await rm(join(root, path));
      delete lock.managedFiles[path];
    } else {
      await writeProjectFile(root, path, bytes);
      lock.managedFiles[path] = sha256(bytes);
    }
  }
  await writeLock(root, lock);
}

export async function snapshot(root, prefix = '') {
  const paths = await readdir(root, { withFileTypes: true });
  const files = {};
  for (const entry of paths) {
    const absolute = join(root, entry.name);
    const path = prefix + entry.name;
    if (entry.isDirectory()) {
      files[path + '/'] = null;
      Object.assign(files, await snapshot(absolute, path + '/'));
    } else {
      files[path] = sha256(await readFile(absolute));
    }
  }
  return files;
}
