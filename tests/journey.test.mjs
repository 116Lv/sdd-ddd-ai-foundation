import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, cp, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { packageRelease } from '../tools/package-release.mjs';
import { connectTools } from '../tools/connect-tools.mjs';
import { checkProject } from '../distribution/managed/checks/check-project.mjs';
import { applyExample, change, sourceRoot, starter } from './journey-fixture.mjs';

test('exported_project_excludes_example', async t => {
  const { project } = await starter(t);
  for (const path of ['examples', 'maintainer', 'openspec/changes/' + change, '.github/workflows', 'package.json']) {
    await assert.rejects(access(join(project, path)), { code: 'ENOENT' });
  }
  await access(join(project, '.github/PULL_REQUEST_TEMPLATE.md'));
  assert.deepEqual(await checkProject({ projectRoot: project }), { status: 'pass', findings: [] });
  await applyExample(project);
  for (const changeName of [undefined, change]) {
    assert.deepEqual(await checkProject({ projectRoot: project, changeName }), { status: 'pass', findings: [] });
  }
});

test('fresh_autocrlf_clone_preserves_owned_bytes', async t => {
  const { project, dir } = await starter(t);
  await connectTools({ projectRoot: project, tools: ['codex', 'claude', 'cursor'] });
  const git = (cwd, ...args) => execFileSync('git', ['-c', 'core.autocrlf=true', ...args], {
    cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  });
  git(project, 'init');
  git(project, 'add', '--', '.');
  git(project, '-c', 'user.name=Foundation Test', '-c', 'user.email=fixture@example.invalid',
    '-c', 'commit.gpgsign=false', 'commit', '-m', 'fixture');
  const clone = join(dir, 'fresh');
  git(dir, 'clone', '--no-local', project, clone);
  const before = await readFile(join(project, 'foundation.lock.json'));
  const lock = JSON.parse(before);
  const expected = { ...lock.managedFiles };
  for (const [path, connection] of Object.entries(lock.connections.files)) expected[path] = connection.sha256;
  expected['foundation.lock.json'] = createHash('sha256').update(before).digest('hex');
  const mismatches = [];
  for (const [path, hash] of Object.entries(expected)) {
    if (createHash('sha256').update(await readFile(join(clone, path))).digest('hex') !== hash) mismatches.push(path);
  }
  assert.deepEqual(mismatches, []);
  for (const path of ['src/app.js', '.agents/skills/product/SKILL.md', '.claude/skills/openspec-apply-change/SKILL.md']) {
    assert.match(git(clone, 'check-attr', 'text', '--', path), /: unspecified\s*$/u);
  }
});

test('fresh_source_checkouts_export_identical_lock_starter_and_zip', async t => {
  const { dir } = await starter(t);
  const source = join(dir, 'source');
  const manifestPath = 'releases/distribution-map.json';
  const map = JSON.parse(await readFile(join(sourceRoot, manifestPath)));
  for (const file of ['.gitattributes', manifestPath, 'tools/export-project.mjs', ...map.map(entry => entry.source)]) {
    await cp(join(sourceRoot, file), join(source, file));
  }
  const git = (cwd, ...args) => execFileSync('git', args, {
    cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  });
  git(source, 'init');
  git(source, '-c', 'core.autocrlf=true', 'add', '--', '.');
  git(source, '-c', 'user.name=Foundation Test', '-c', 'user.email=fixture@example.invalid',
    '-c', 'commit.gpgsign=false', 'commit', '-m', 'distribution inputs');
  const exports = [];
  for (const setting of ['true', 'false']) {
    const checkout = join(dir, 'source-' + setting);
    git(dir, 'clone', '--no-local', '--config', 'core.autocrlf=' + setting, source, checkout);
    const targetDir = join(dir, 'project-' + setting);
    execFileSync(process.execPath, ['tools/export-project.mjs', '--target-dir', targetDir,
      '--version', '0.1.0', '--project-name', '예약'], { cwd: checkout, stdio: 'pipe' });
    const zipPath = join(dir, setting + '.zip');
    await packageRelease({ projectDir: targetDir, zipPath });
    exports.push({ targetDir, zipPath });
  }
  for (const file of ['foundation.lock.json', ...map.filter(entry => entry.mode === 'starter').map(entry => entry.target)]) {
    const contents = await Promise.all(exports.map(({ targetDir }) => readFile(join(targetDir, file))));
    assert.ok(contents[0].equals(contents[1]), file);
  }
  const archives = await Promise.all(exports.map(({ zipPath }) => readFile(zipPath)));
  assert.ok(archives[0].equals(archives[1]), 'release ZIP');
});
