import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs, { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, utimes, writeFile } from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { connectTools } from '../tools/connect-tools.mjs';
import { exportProject } from '../tools/export-project.mjs';
import { sha256 } from '../tools/lib/lock.mjs';
import { packageRelease } from '../tools/package-release.mjs';

const sourceRoot = fileURLToPath(new URL('../', import.meta.url));
const cli = join(sourceRoot, 'tools', 'connect-tools.mjs');
const skillNames = ['foundation-completion-review', 'foundation-spec-review'];
const sharedSkills = skillNames.map((name) => '.agents/skills/' + name + '/SKILL.md');
const claudeSkills = skillNames.map((name) => '.claude/skills/' + name + '/SKILL.md');
const skillSources = skillNames.map((name) => '.foundation/skills/' + name + '/SKILL.md.template');
const claudeSource = '.foundation/integrations/claude/CLAUDE.md.template';
const lockName = 'foundation.lock.json';

async function fixture(t) {
  const parent = await realpath(tmpdir());
  const dir = await mkdtemp(join(parent, 'foundation-connect-'));
  t.after(async () => {
    assert.equal(dirname(await realpath(dir)), parent);
    assert.match(relative(parent, dir), /^foundation-connect-[^\\/]+$/);
    await rm(dir, { recursive: true, force: true });
  });
  const { projectDir, lock } = await exportProject({
    sourceRoot,
    targetDir: join(dir, '봄 프로젝트'),
    version: '0.1.0',
    projectName: '봄',
  });
  return { dir, projectRoot: projectDir, lock };
}

async function writeProjectFile(projectRoot, relativePath, bytes) {
  const path = join(projectRoot, relativePath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
}

async function assertCopy(projectRoot, connections, target, source) {
  const bytes = await readFile(join(projectRoot, source));
  assert.deepEqual(await readFile(join(projectRoot, target)), bytes);
  assert.ok((await lstat(join(projectRoot, target))).isFile());
  assert.deepEqual(connections.files[target], { source, sha256: sha256(bytes) });
}

test('shared_skills_for_codex_and_cursor', async (t) => {
  const { projectRoot, lock } = await fixture(t);
  const codex = await connectTools({ projectRoot, tools: ['codex'] });
  assert.deepEqual(codex.created, sharedSkills);
  assert.deepEqual(codex.unchanged, []);
  assert.deepEqual(codex.connections.tools, ['codex']);
  const cursor = await connectTools({ projectRoot, tools: ['cursor'] });
  assert.deepEqual(cursor.created, []);
  assert.deepEqual(cursor.unchanged, sharedSkills);
  assert.deepEqual(cursor.connections.tools, ['codex', 'cursor']);
  assert.deepEqual(Object.keys(cursor.connections.files), sharedSkills);
  for (const [index, path] of sharedSkills.entries()) {
    await assertCopy(projectRoot, cursor.connections, path, skillSources[index]);
  }
  assert.deepEqual(JSON.parse(await readFile(join(projectRoot, lockName))), { ...lock, connections: cursor.connections });
  for (const path of ['.codex', '.cursor', '.claude', 'CLAUDE.md']) {
    await assert.rejects(lstat(join(projectRoot, path)), { code: 'ENOENT' });
  }
});

test('claude_adds_import_and_skill_copies', async (t) => {
  const { projectRoot } = await fixture(t);
  const agents = '# 프로젝트 규칙\r\n작업 전 제품 기준을 확인한다.\r\n';
  await writeProjectFile(projectRoot, 'AGENTS.md', agents);
  const result = await connectTools({ projectRoot, tools: ['claude'] });
  assert.deepEqual(result.created, [...claudeSkills, 'CLAUDE.md']);
  assert.deepEqual(result.connections.tools, ['claude']);
  assert.match(await readFile(join(projectRoot, 'CLAUDE.md'), 'utf8'), /^@AGENTS\.md\r?\n$/);
  assert.equal(await readFile(join(projectRoot, 'AGENTS.md'), 'utf8'), agents);
  await assertCopy(projectRoot, result.connections, 'CLAUDE.md', claudeSource);
  for (const [index, path] of claudeSkills.entries()) {
    await assertCopy(projectRoot, result.connections, path, skillSources[index]);
  }
  await assert.rejects(lstat(join(projectRoot, '.agents')), { code: 'ENOENT' });
});

test('rerun_is_idempotent', async (t) => {
  const { projectRoot } = await fixture(t);
  const first = await connectTools({ projectRoot, tools: ['cursor', 'claude', 'codex', 'cursor'] });
  const files = [lockName, ...first.created];
  const previousTime = new Date('2001-01-01T00:00:00Z');
  const previousBytes = [];
  for (const path of files) {
    const absolute = join(projectRoot, path);
    await utimes(absolute, previousTime, previousTime);
    previousBytes.push(await readFile(absolute));
  }
  const second = await connectTools({ projectRoot, tools: ['codex', 'cursor', 'claude'] });
  assert.deepEqual(second.created, []);
  assert.deepEqual(second.unchanged, first.created);
  assert.deepEqual(second.connections, first.connections);
  for (const [index, path] of files.entries()) {
    const absolute = join(projectRoot, path);
    assert.equal((await lstat(absolute)).mtimeMs, previousTime.getTime());
    assert.deepEqual(await readFile(absolute), previousBytes[index]);
  }
});

test('unmodified_owned_copy_refreshes_from_a_changed_template', async (t) => {
  const { projectRoot, lock } = await fixture(t);
  await connectTools({ projectRoot, tools: ['codex'] });
  const expanded = await connectTools({ projectRoot, tools: ['claude', 'cursor'] });
  assert.deepEqual(expanded.created, [...claudeSkills, 'CLAUDE.md']);
  assert.deepEqual(expanded.unchanged, sharedSkills);
  const original = await readFile(join(projectRoot, skillSources[0]), 'utf8');
  await writeProjectFile(projectRoot, skillSources[0], original + '\n갱신된 검토 안내\n');
  const result = await connectTools({ projectRoot, tools: ['codex'] });
  assert.deepEqual(result.created, [sharedSkills[0]]);
  assert.deepEqual(result.unchanged, [sharedSkills[1]]);
  await assertCopy(projectRoot, result.connections, sharedSkills[0], skillSources[0]);
  assert.deepEqual(result.connections, {
    ...expanded.connections,
    files: { ...expanded.connections.files, [sharedSkills[0]]: result.connections.files[sharedSkills[0]] },
  });
  assert.equal(await readFile(join(projectRoot, claudeSkills[0]), 'utf8'), original);
  const claude = await connectTools({ projectRoot, tools: ['claude'] });
  assert.deepEqual(claude.created, [claudeSkills[0]]);
  await assertCopy(projectRoot, claude.connections, claudeSkills[0], skillSources[0]);
  assert.deepEqual(claude.connections.tools, ['claude', 'codex', 'cursor']);
  assert.deepEqual(JSON.parse(await readFile(join(projectRoot, lockName))).managedFiles, lock.managedFiles);
});

test('modified_connection_aborts_without_writes', async (t) => {
  const { projectRoot } = await fixture(t);
  await connectTools({ projectRoot, tools: ['claude'] });
  const edited = '@AGENTS.md\n\n현지 Claude 지침\n';
  await writeProjectFile(projectRoot, 'CLAUDE.md', edited);
  const lockBytes = await readFile(join(projectRoot, lockName));
  const claudeBytes = await readFile(join(projectRoot, claudeSkills[0]));
  await writeProjectFile(projectRoot, skillSources[0], '새 검토 지침');
  await assert.rejects(connectTools({ projectRoot, tools: ['codex', 'claude'] }), { code: 'CONNECTION_CONFLICT' });
  assert.deepEqual(await readFile(join(projectRoot, lockName)), lockBytes);
  assert.deepEqual(await readFile(join(projectRoot, claudeSkills[0])), claudeBytes);
  assert.equal(await readFile(join(projectRoot, 'CLAUDE.md'), 'utf8'), edited);
  await assert.rejects(lstat(join(projectRoot, '.agents')), { code: 'ENOENT' });
});

test('unowned_target_with_matching_bytes_still_blocks_the_batch', async (t) => {
  const { projectRoot } = await fixture(t);
  const bytes = await readFile(join(projectRoot, skillSources[1]));
  await writeProjectFile(projectRoot, sharedSkills[1], bytes);
  const baseline = await readFile(join(projectRoot, lockName));
  await assert.rejects(connectTools({ projectRoot, tools: ['codex', 'claude'] }), { code: 'CONNECTION_CONFLICT' });
  assert.deepEqual(await readFile(join(projectRoot, sharedSkills[1])), bytes);
  assert.deepEqual(await readFile(join(projectRoot, lockName)), baseline);
  for (const path of [sharedSkills[0], '.claude', 'CLAUDE.md']) {
    await assert.rejects(lstat(join(projectRoot, path)), { code: 'ENOENT' });
  }
});

test('linked_target_ancestor_aborts_without_writes', async (t) => {
  const { dir, projectRoot } = await fixture(t);
  const outside = join(dir, 'outside');
  await mkdir(outside);
  await symlink(outside, join(projectRoot, '.claude'), process.platform === 'win32' ? 'junction' : 'dir');
  const baseline = await readFile(join(projectRoot, lockName));
  await assert.rejects(connectTools({ projectRoot, tools: ['codex', 'claude'] }), { code: 'SYMLINK_PATH' });
  assert.deepEqual(await readdir(outside), []);
  assert.deepEqual(await readFile(join(projectRoot, lockName)), baseline);
  await assert.rejects(lstat(join(projectRoot, '.agents')), { code: 'ENOENT' });
});

test('preserves_openspec_skills', async (t) => {
  const { projectRoot } = await fixture(t);
  const preserved = {
    '.agents/skills/openspec-propose/SKILL.md': 'OpenSpec 제안',
    '.claude/skills/openspec-apply-change/SKILL.md': 'OpenSpec 적용',
    '.cursor/rules/repo.mdc': 'Cursor 로컬 규칙',
    '.claude/settings.json': '{"name":"local"}',
    'openspec/config.yaml': 'schema: spec-driven',
    'AGENTS.md': '# 프로젝트 규칙',
    'docs/product/brief.md': '# 프로젝트 제품 개요',
  };
  for (const [path, bytes] of Object.entries(preserved)) await writeProjectFile(projectRoot, path, bytes);
  const result = await connectTools({ projectRoot, tools: ['codex', 'claude', 'cursor'] });
  for (const [path, text] of Object.entries(preserved)) {
    assert.equal(await readFile(join(projectRoot, path), 'utf8'), text);
    assert.equal(result.connections.files[path], undefined);
  }
});

test('rejects_unsupported_tool', async (t) => {
  const { projectRoot } = await fixture(t);
  const baseline = await readFile(join(projectRoot, lockName));
  for (const tool of ['vim', 'constructor', '../codex']) {
    await assert.rejects(connectTools({ projectRoot, tools: ['codex', tool] }), { code: 'UNSUPPORTED_TOOL' });
  }
  await assert.rejects(connectTools({ projectRoot, tools: [] }), { code: 'INVALID_INPUT' });
  assert.deepEqual(await readFile(join(projectRoot, lockName)), baseline);
  await assert.rejects(lstat(join(projectRoot, '.agents')), { code: 'ENOENT' });
});

test('rolls_back_published_files_when_a_later_write_fails', async (t) => {
  const { projectRoot } = await fixture(t);
  await connectTools({ projectRoot, tools: ['codex'] });
  const baseline = await readFile(join(projectRoot, lockName));
  const previousSkill = await readFile(join(projectRoot, sharedSkills[0]));
  await writeProjectFile(projectRoot, skillSources[0], '새 검토 지침');
  const originalRename = fs.rename;
  const failure = Object.assign(new Error('lock publish failed'), { code: 'EPERM' });
  const mock = t.mock.method(fs, 'rename', async (from, to) => {
    if (to === join(projectRoot, lockName)) throw failure;
    return originalRename(from, to);
  });
  syncBuiltinESMExports();
  t.after(() => {
    mock.mock.restore();
    syncBuiltinESMExports();
  });
  await assert.rejects(connectTools({ projectRoot, tools: ['codex', 'claude'] }), { code: 'EPERM' });
  assert.deepEqual(await readFile(join(projectRoot, lockName)), baseline);
  assert.deepEqual(await readFile(join(projectRoot, sharedSkills[0])), previousSkill);
  await assert.rejects(lstat(join(projectRoot, '.claude')), { code: 'ENOENT' });
  await assert.rejects(lstat(join(projectRoot, 'CLAUDE.md')), { code: 'ENOENT' });
  assert.ok((await readdir(projectRoot)).every((name) => !name.startsWith('.foundation-stage-')));
});

test('overlapping_connections_can_retry_after_the_first_lock_is_published', async (t) => {
  const { projectRoot } = await fixture(t);
  const publishingLock = Promise.withResolvers();
  const proceed = Promise.withResolvers();
  const originalRename = fs.rename;
  const mock = t.mock.method(fs, 'rename', async (from, to) => {
    if (to === join(projectRoot, lockName)) {
      publishingLock.resolve();
      await proceed.promise;
    }
    return originalRename(from, to);
  });
  syncBuiltinESMExports();
  t.after(() => {
    mock.mock.restore();
    syncBuiltinESMExports();
  });

  const first = connectTools({ projectRoot, tools: ['codex'] });
  try {
    await Promise.race([publishingLock.promise, first]);
    await assert.rejects(connectTools({ projectRoot, tools: ['cursor'] }), { code: 'CONNECTION_BUSY' });
  } finally {
    proceed.resolve();
    await first;
  }
  const retry = await connectTools({ projectRoot, tools: ['cursor'] });
  assert.deepEqual(retry.created, []);
  assert.deepEqual(retry.connections.tools, ['codex', 'cursor']);
});

test('connector_cli_reports_usage_input_errors_and_conflicts', async (t) => {
  const { projectRoot } = await fixture(t);
  const run = (...args) => spawnSync(process.execPath, [cli, ...args], { cwd: projectRoot, encoding: 'utf8' });
  const help = run('--help');
  assert.equal(help.status, 0);
  assert.match(help.stdout, /--tool/);
  const invalid = run('--tool', 'vim', '--json');
  assert.equal(invalid.status, 2);
  assert.equal(JSON.parse(invalid.stderr).code, 'UNSUPPORTED_TOOL');
  await writeProjectFile(projectRoot, 'CLAUDE.md', '지역 규칙');
  const conflict = run('--project-root', projectRoot, '--tool', 'claude', '--json');
  assert.equal(conflict.status, 1);
  assert.equal(JSON.parse(conflict.stderr).code, 'CONNECTION_CONFLICT');
  const connected = run('--project-root', projectRoot, '--tool', 'codex', '--json');
  assert.equal(connected.status, 0, connected.stderr);
  assert.deepEqual(JSON.parse(connected.stdout).created, sharedSkills);
});

test('released_zip_runs_its_own_connector', async (t) => {
  const { dir, projectRoot } = await fixture(t);
  const zipPath = join(dir, 'release.zip');
  await packageRelease({ projectDir: projectRoot, zipPath });
  const { unzipSync } = await import('fflate');
  const extractedRoot = join(dir, 'extracted');
  for (const [path, bytes] of Object.entries(unzipSync(await readFile(zipPath)))) {
    if (!path.endsWith('/')) await writeProjectFile(extractedRoot, path, bytes);
  }
  const result = spawnSync(process.execPath, [
    '.foundation/tools/connect-tools.mjs', '--tool', 'codex', '--tool', 'claude', '--tool', 'cursor', '--json',
  ], { cwd: extractedRoot, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const { connections } = JSON.parse(result.stdout);
  assert.deepEqual(connections.tools, ['claude', 'codex', 'cursor']);
  await assertCopy(extractedRoot, connections, sharedSkills[0], skillSources[0]);
  await assertCopy(extractedRoot, connections, claudeSkills[0], skillSources[0]);
  await assertCopy(extractedRoot, connections, 'CLAUDE.md', claudeSource);
  for (const path of ['package.json', 'node_modules', 'tools', 'integrations']) {
    await assert.rejects(lstat(join(extractedRoot, path)), { code: 'ENOENT' });
  }
});
