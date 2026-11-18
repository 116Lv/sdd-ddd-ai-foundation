import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { exportProject } from '../tools/export-project.mjs';
import { packageRelease } from '../tools/package-release.mjs';

const sourceRoot = fileURLToPath(new URL('../', import.meta.url));
const cli = fileURLToPath(new URL('../tools/package-release.mjs', import.meta.url));

async function scratch(t) {
  const parent = await realpath(tmpdir());
  const dir = await mkdtemp(join(parent, 'foundation-package-'));
  t.after(async () => {
    assert.equal(dirname(await realpath(dir)), parent);
    assert.match(relative(parent, dir), /^foundation-package-[^\\/]+$/);
    await rm(dir, { recursive: true, force: true });
  });
  return dir;
}

test('zip_keeps_hidden_and_korean_paths', async (t) => {
  const dir = await scratch(t);
  const projectDir = join(dir, '봄 프로젝트');
  const zipPath = join(dir, '봄.zip');
  await exportProject({ sourceRoot, targetDir: projectDir, version: '0.1.0', projectName: '봄' });
  await writeFile(join(projectDir, '.foundation', '한글.md'), '한글 내용');

  const result = await packageRelease({ projectDir, zipPath });
  assert.equal(result.zipPath, zipPath);
  const bytes = await readFile(zipPath);
  // The first local header stores 00:00:00 on 2000-01-01 in DOS format.
  assert.equal(bytes.readUInt32LE(10), 0x28210000);
  assert.equal(result.sha256, createHash('sha256').update(bytes).digest('hex'));
  const { unzipSync } = await import('fflate');
  const entries = unzipSync(bytes);
  assert.equal(result.fileCount, Object.keys(entries).filter((path) => !path.endsWith('/')).length);
  assert.equal(Buffer.from(entries['.foundation/한글.md']).toString('utf8'), '한글 내용');
  assert.ok(entries['.foundation/guide.md']);
  assert.ok(entries['.foundation/skills/foundation-spec-review/SKILL.md.template']);
  assert.ok(entries['foundation.lock.json']);
  for (const path of Object.keys(entries)) {
    assert.doesNotMatch(path, /^(?:maintainer\/|examples\/|\.git\/|\.git$|\.superpowers\/|distribution\/|package\.json$|package-lock\.json$)/);
  }
  const repeat = await packageRelease({ projectDir, zipPath: join(dir, 'repeat.zip') });
  assert.equal(repeat.sha256, result.sha256);
});

test('existing_zip_paths_are_preserved', async (t) => {
  const dir = await scratch(t);
  const projectDir = join(dir, 'project');
  const zipPath = join(dir, 'release.zip');
  await mkdir(projectDir);
  await writeFile(join(projectDir, 'README.md'), 'pack');
  await writeFile(zipPath, 'keep');
  await assert.rejects(packageRelease({ projectDir, zipPath }), { code: 'ZIP_EXISTS' });
  assert.equal(await readFile(zipPath, 'utf8'), 'keep');
  assert.deepEqual((await readdir(dir)).sort(), ['project', 'release.zip']);
});

test('zip_rejects_linked_entries_and_output_ancestors', async (t) => {
  const dir = await scratch(t);
  const projectDir = join(dir, 'project');
  const outside = join(dir, 'outside');
  const zipPath = join(dir, 'release.zip');
  const linkType = process.platform === 'win32' ? 'junction' : 'dir';
  await mkdir(projectDir);
  await mkdir(outside);
  await writeFile(join(outside, 'secret.md'), 'outside');
  await symlink(outside, join(projectDir, 'link'), linkType);
  await assert.rejects(packageRelease({ projectDir, zipPath }), { code: 'SYMLINK_PATH' });
  await assert.rejects(lstat(zipPath), { code: 'ENOENT' });
  const outputParent = join(dir, 'output-parent');
  await symlink(outside, outputParent, linkType);
  await assert.rejects(packageRelease({ projectDir: outside, zipPath: join(outputParent, 'release.zip') }), {
    code: 'SYMLINK_PATH',
  });
  assert.deepEqual(await readdir(outside), ['secret.md']);
});

test('package_cli_help_and_json_use_documented_exit_statuses', async (t) => {
  const dir = await scratch(t);
  const projectDir = join(dir, 'project');
  const zipPath = join(dir, 'release.zip');
  await mkdir(projectDir);
  await writeFile(join(projectDir, 'README.md'), 'pack');
  const help = spawnSync(process.execPath, [cli, '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /--zip-path/);
  const command = [cli, '--project-dir', projectDir, '--zip-path', zipPath, '--json'];
  const created = spawnSync(process.execPath, command, { encoding: 'utf8' });
  assert.equal(created.status, 0, created.stderr);
  assert.equal(JSON.parse(created.stdout).fileCount, 1);
  const repeated = spawnSync(process.execPath, command, { encoding: 'utf8' });
  assert.equal(repeated.status, 2);
  assert.equal(JSON.parse(repeated.stderr).code, 'ZIP_EXISTS');
});
