import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { connectTools } from '../tools/connect-tools.mjs';
import { checkProject } from '../distribution/managed/checks/check-project.mjs';
import { applyExample, change, starter } from './journey-fixture.mjs';

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
