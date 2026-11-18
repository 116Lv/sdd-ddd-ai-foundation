import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, readFile, rm, rmdir } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { compareUpdate } from '../tools/compare-update.mjs';
import { connectTools } from '../tools/connect-tools.mjs';
import { lockName } from '../tools/lib/lock.mjs';
import { packageRelease } from '../tools/package-release.mjs';
import { recordBaseline } from '../tools/record-baseline.mjs';
import { changeManaged, fixture, readLock, snapshot, writeLock, writeProjectFile } from './update-fixture.mjs';

const guide = '.foundation/guide.md';
const retired = '.foundation/templates/adr.md';
const skill = '.agents/skills/foundation-spec-review/SKILL.md';
const skillTemplate = '.foundation/skills/foundation-spec-review/SKILL.md.template';

test('baseline_requires_installed_files_match_and_retired_assets_be_removed', async (t) => {
  const input = await fixture(t);
  const { projectRoot, candidateRoot } = input;
  const lockPath = join(projectRoot, lockName);
  await changeManaged(candidateRoot, { [guide]: '새 안내', [retired]: null });
  const baseline = await readFile(lockPath);
  await assert.rejects(recordBaseline(input), (error) => {
    assert.equal(error.code, 'BASELINE_CONFLICT');
    assert.deepEqual(error.findings.map(({ path }) => path), [guide, retired]);
    return true;
  });
  assert.deepEqual(await readFile(lockPath), baseline);
  await copyFile(join(candidateRoot, guide), join(projectRoot, guide));
  await assert.rejects(recordBaseline(input), { code: 'BASELINE_CONFLICT' });
  await rm(join(projectRoot, retired));
  const before = await snapshot(projectRoot);
  const result = await recordBaseline(input);
  assert.deepEqual(result, { version: '0.2.0', lockPath });
  const after = await snapshot(projectRoot);
  assert.notEqual(after[lockName], before[lockName]);
  delete after[lockName];
  delete before[lockName];
  assert.deepEqual(after, before);
  assert.deepEqual(await readLock(projectRoot), await readLock(candidateRoot));
});

test('requires_connection_refresh_and_preserves_current_ownership_and_project_content', async (t) => {
  const input = await fixture(t);
  const { projectRoot, candidateRoot } = input;
  await connectTools({ projectRoot, tools: ['codex', 'cursor'] });
  await connectTools({ projectRoot: candidateRoot, tools: ['claude'] });
  await changeManaged(candidateRoot, { [skillTemplate]: '갱신해야 하는 스킬' });
  await copyFile(join(candidateRoot, skillTemplate), join(projectRoot, skillTemplate));
  for (const path of ['AGENTS.md', 'docs/project/profile.md', 'contracts/api.yaml', 'openspec/config.yaml', 'CLAUDE.md']) {
    await writeProjectFile(projectRoot, path, '프로젝트 소유 ' + path);
  }
  const before = await snapshot(projectRoot);
  await assert.rejects(recordBaseline(input), { code: 'BASELINE_CONFLICT' });
  assert.deepEqual(await snapshot(projectRoot), before);
  const { connections } = await connectTools({ projectRoot, tools: ['codex', 'cursor'] });
  assert.deepEqual((await compareUpdate(input)).connectionRefresh, []);
  const refreshed = await snapshot(projectRoot);
  await recordBaseline(input);
  const recorded = await readLock(projectRoot);
  assert.deepEqual(recorded.connections, connections);
  assert.equal(recorded.foundationVersion, '0.2.0');
  assert.deepEqual(recorded.managedFiles, (await readLock(candidateRoot)).managedFiles);
  const after = await snapshot(projectRoot);
  delete after[lockName];
  delete refreshed[lockName];
  assert.deepEqual(after, refreshed);
});

test('blocks_baseline_for_direct_edits_and_retired_connection_ownership', async (t) => {
  const input = await fixture(t);
  const { projectRoot, candidateRoot } = input;
  await connectTools({ projectRoot, tools: ['codex'] });
  await writeProjectFile(projectRoot, skill, '지역 수정');
  await assert.rejects(recordBaseline(input), { code: 'BASELINE_CONFLICT' });
  const adapterPath = '.foundation/integrations/tools.json';
  const adapter = JSON.parse(await readFile(join(candidateRoot, adapterPath)));
  adapter.skills = adapter.skills.filter((name) => name !== 'foundation-spec-review');
  await changeManaged(candidateRoot, { [adapterPath]: JSON.stringify(adapter) });
  await copyFile(join(candidateRoot, adapterPath), join(projectRoot, adapterPath));
  const before = await snapshot(projectRoot);
  assert.deepEqual((await compareUpdate(input)).connectionRefresh, [{ path: skill, reason: 'ownership-changed' }]);
  await assert.rejects(recordBaseline(input), { code: 'BASELINE_CONFLICT' });
  assert.deepEqual(await snapshot(projectRoot), before);
});

test('shares_the_connector_guard_and_leaves_the_lock_unchanged_when_busy', async (t) => {
  const input = await fixture(t);
  const { projectRoot } = input;
  await mkdir(join(projectRoot, '.foundation-connect-lock'));
  const before = await snapshot(projectRoot);
  assert.equal((await compareUpdate(input)).toVersion, '0.2.0');
  await assert.rejects(recordBaseline(input), { code: 'CONNECTION_BUSY' });
  assert.deepEqual(await snapshot(projectRoot), before);
});

test('released_zip_runs_its_own_update_tools_without_repo_or_dependencies', async (t) => {
  const { dir, projectRoot, candidateRoot } = await fixture(t);
  const zipPath = join(dir, 'release.zip');
  await packageRelease({ projectDir: projectRoot, zipPath });
  const { unzipSync } = await import('fflate');
  const extracted = join(dir, 'extracted');
  for (const [path, bytes] of Object.entries(unzipSync(await readFile(zipPath)))) {
    if (!path.endsWith('/')) await writeProjectFile(extracted, path, bytes);
  }

  const run = (cli, ...args) => spawnSync(process.execPath, [
    '.foundation/tools/' + cli + '.mjs', ...args,
  ], { cwd: extracted, encoding: 'utf8' });
  for (const cli of ['compare-update', 'record-baseline']) {
    const help = run(cli, '--help');
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /--candidate-root/);
    if (cli === 'record-baseline') assert.match(help.stdout, /--acknowledge-new-path/);
    const invalid = run(cli, '--json');
    assert.equal(invalid.status, 2, invalid.stderr);
    assert.equal(JSON.parse(invalid.stderr).code, 'INVALID_PATH');
  }
  const args = ['--candidate-root', candidateRoot, '--json'];
  const added = ['.foundation/new-one.md', '.foundation/new-two.md'];
  await changeManaged(candidateRoot, { [guide]: '새 안내', [added[0]]: '새 문서', [added[1]]: '새 양식' });
  const report = run('compare-update', ...args);
  assert.equal(report.status, 0, report.stderr);
  assert.deepEqual(JSON.parse(report.stdout).changed, [guide]);
  assert.deepEqual(JSON.parse(report.stdout).added, added);
  const uninstalled = run('record-baseline', ...args);
  assert.equal(uninstalled.status, 1, uninstalled.stderr);
  assert.equal(JSON.parse(uninstalled.stderr).code, 'BASELINE_CONFLICT');
  for (const path of [guide, ...added]) await copyFile(join(candidateRoot, path), join(extracted, path));
  const applied = run('compare-update', ...args);
  assert.equal(applied.status, 1, applied.stderr);
  assert.deepEqual(JSON.parse(applied.stdout).conflicts, [
    { path: guide, reason: 'local-edit', matchesCandidate: true },
    ...added.map((path) => ({ path, reason: 'untracked-path', matchesCandidate: true })),
  ]);
  const unacknowledged = run('record-baseline', ...args);
  assert.equal(unacknowledged.status, 1, unacknowledged.stderr);
  assert.deepEqual(JSON.parse(unacknowledged.stderr).findings,
    added.map((path) => ({ path, reason: 'new-path-unacknowledged' })));
  const unknown = run('record-baseline', ...args, '--acknowledge-new-path', guide);
  assert.equal(unknown.status, 2, unknown.stderr);
  assert.equal(JSON.parse(unknown.stderr).code, 'INVALID_ACKNOWLEDGEMENT');
  const recorded = run('record-baseline', ...args, ...added.flatMap((path) => ['--acknowledge-new-path', path]));
  assert.equal(recorded.status, 0, recorded.stderr);
  assert.equal(JSON.parse(recorded.stdout).version, '0.2.0');
  const corrupted = await readLock(candidateRoot);
  await writeLock(candidateRoot, { ...corrupted, schemaVersion: 0 });
  const invalid = run('compare-update', ...args);
  assert.equal(invalid.status, 2, invalid.stderr);
  assert.equal(JSON.parse(invalid.stderr).code, 'INVALID_CANDIDATE');
});

test('retired_paths_may_be_replaced_by_the_candidate_file_or_directory_layout', async (t) => {
  const input = await fixture(t);
  const { projectRoot, candidateRoot } = input;
  const formerFile = '.foundation/first';
  const formerDirectory = '.foundation/second';
  await changeManaged(projectRoot, { [formerFile]: '이전 파일', [formerDirectory + '/old.md']: '이전 하위 파일' });
  await changeManaged(candidateRoot, { [formerFile + '/new.md']: '새 하위 파일', [formerDirectory]: '새 파일' });
  const initial = await compareUpdate(input);
  assert.deepEqual(initial.removed, [formerFile, formerDirectory + '/old.md']);
  assert.deepEqual(initial.conflicts, [{ path: formerDirectory, reason: 'local-path', matchesCandidate: false }]);
  await assert.rejects(recordBaseline(input), { code: 'BASELINE_CONFLICT' });

  await rm(join(projectRoot, formerFile));
  await rm(join(projectRoot, formerDirectory, 'old.md'));
  await rmdir(join(projectRoot, formerDirectory));
  await writeProjectFile(projectRoot, formerFile + '/new.md', '새 하위 파일');
  await writeProjectFile(projectRoot, formerDirectory, '새 파일');
  const report = await compareUpdate(input);
  assert.deepEqual(report.conflicts, [
    { path: formerFile, reason: 'local-path', matchesCandidate: true },
    { path: formerFile + '/new.md', reason: 'untracked-path', matchesCandidate: true },
    { path: formerDirectory, reason: 'untracked-path', matchesCandidate: true },
    { path: formerDirectory + '/old.md', reason: 'local-path', matchesCandidate: true },
  ]);
  const acknowledgeNewPaths = [formerFile + '/new.md', formerDirectory];
  assert.equal((await recordBaseline({ ...input, acknowledgeNewPaths })).version, '0.2.0');
});

test('requires_explicit_acknowledgement_for_every_added_managed_path', async (t) => {
  const input = await fixture(t);
  const { candidateRoot, projectRoot } = input;
  const preexisting = '.foundation/local-policy.md';
  const installed = '.foundation/new.md';
  const projectDoc = 'docs/project/profile.md';
  await writeProjectFile(projectRoot, preexisting, '기존 지역 정책');
  await writeProjectFile(projectRoot, projectDoc, '프로젝트 설정');
  await changeManaged(candidateRoot, { [preexisting]: '기존 지역 정책', [installed]: '후보 파일' });
  await copyFile(join(candidateRoot, installed), join(projectRoot, installed));
  const before = await snapshot(projectRoot);

  await assert.rejects(recordBaseline(input), (error) => {
    assert.equal(error.code, 'BASELINE_CONFLICT');
    assert.deepEqual(error.findings, [
      { path: preexisting, reason: 'new-path-unacknowledged' },
      { path: installed, reason: 'new-path-unacknowledged' },
    ]);
    return true;
  });
  await assert.rejects(recordBaseline({ ...input, acknowledgeNewPaths: [installed] }), (error) => {
    assert.equal(error.code, 'BASELINE_CONFLICT');
    assert.deepEqual(error.findings, [{ path: preexisting, reason: 'new-path-unacknowledged' }]);
    return true;
  });
  for (const paths of [installed, [7], [guide], [projectDoc], ['.foundation/not-added.md'], [installed.toUpperCase()]]) {
    await assert.rejects(recordBaseline({ ...input, acknowledgeNewPaths: paths }), {
      code: 'INVALID_ACKNOWLEDGEMENT',
    });
  }
  assert.deepEqual(await snapshot(projectRoot), before);
  const acknowledged = { ...input, acknowledgeNewPaths: [preexisting, installed] };
  await writeProjectFile(projectRoot, installed, '수정된 후보 파일');
  await assert.rejects(recordBaseline(acknowledged), (error) => {
    assert.equal(error.code, 'BASELINE_CONFLICT');
    assert.deepEqual(error.findings, [{ path: installed, reason: 'candidate-mismatch' }]);
    return true;
  });
  assert.equal((await snapshot(projectRoot))[lockName], before[lockName]);
  await copyFile(join(candidateRoot, installed), join(projectRoot, installed));

  assert.equal((await recordBaseline(acknowledged)).version, '0.2.0');
  assert.deepEqual((await readLock(projectRoot)).managedFiles, (await readLock(candidateRoot)).managedFiles);
  const after = await snapshot(projectRoot);
  delete before[lockName];
  delete after[lockName];
  assert.deepEqual(after, before);
});
