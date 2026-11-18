import assert from 'node:assert/strict';
import { readFile, rename, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { compareUpdate } from '../tools/compare-update.mjs';
import { connectTools } from '../tools/connect-tools.mjs';
import { sha256 } from '../tools/lib/lock.mjs';
import { changeManaged, fixture, readLock, snapshot, writeLock, writeProjectFile } from './update-fixture.mjs';

const guide = '.foundation/guide.md';
const added = '.foundation/new.md';
const retired = '.foundation/templates/adr.md';
const skill = '.agents/skills/foundation-spec-review/SKILL.md';
const skillTemplate = '.foundation/skills/foundation-spec-review/SKILL.md.template';

test('reports_added_changed_removed_and_ignores_project_content_without_writing', async (t) => {
  const input = await fixture(t);
  const { projectRoot, candidateRoot } = input;
  const changes = { [added]: '새 문서', [guide]: '새 안내', [retired]: null };
  await changeManaged(candidateRoot, changes);
  for (const path of ['README.md', 'AGENTS.md', 'docs/project/profile.md', 'contracts/api.yaml', 'openspec/config.yaml', '.foundation/local.md']) {
    await writeProjectFile(projectRoot, path, '프로젝트 문서 ' + path);
    await writeProjectFile(candidateRoot, path, '후보 문서 ' + path);
  }
  const before = await snapshot(projectRoot);
  const candidateBefore = await snapshot(candidateRoot);
  const result = await compareUpdate(input);
  assert.equal(result.fromVersion, '0.1.0');
  assert.equal(result.toVersion, '0.2.0');
  assert.deepEqual(result.added, [added]);
  assert.deepEqual(result.changed, [guide]);
  assert.deepEqual(result.removed, [retired]);
  assert.deepEqual(result.conflicts, []);
  assert.deepEqual(result.connectionRefresh, []);
  assert.ok(result.manualActions.length > 0);
  assert.deepEqual(await snapshot(projectRoot), before);
  assert.deepEqual(await snapshot(candidateRoot), candidateBefore);
});

test('local_edit_and_local_delete_are_conflicts_even_if_the_candidate_already_matches', async (t) => {
  const input = await fixture(t);
  const { projectRoot, candidateRoot } = input;
  await changeManaged(candidateRoot, { [guide]: '새 안내', [retired]: null, [added]: '신규 후보' });
  await writeProjectFile(projectRoot, guide, '새 안내');
  await rm(join(projectRoot, retired));
  await writeProjectFile(projectRoot, added, '미등록 지역 파일');
  const before = await snapshot(projectRoot);
  const result = await compareUpdate(input);
  assert.deepEqual(result.conflicts, [
    { path: guide, reason: 'local-edit', matchesCandidate: true },
    { path: added, reason: 'untracked-path', matchesCandidate: false },
    { path: retired, reason: 'local-delete', matchesCandidate: true },
  ]);
  assert.deepEqual(await snapshot(projectRoot), before);
});

test('marks_connection_refresh_and_preserves_a_direct_edit', async (t) => {
  const input = await fixture(t);
  const { projectRoot, candidateRoot } = input;
  await connectTools({ projectRoot, tools: ['codex'] });
  await changeManaged(candidateRoot, { [skillTemplate]: '새 연결 원본' });
  assert.deepEqual((await compareUpdate(input)).connectionRefresh, [
    { path: skill, reason: 'source-changed' },
  ]);
  await writeProjectFile(projectRoot, skill, '지역 수정');
  const before = await snapshot(projectRoot);
  const result = await compareUpdate(input);
  assert.deepEqual(result.connectionRefresh, [{ path: skill, reason: 'local-edit' }]);
  assert.deepEqual(result.conflicts, [{ path: skill, reason: 'local-edit', matchesCandidate: false }]);
  assert.deepEqual(await snapshot(projectRoot), before);
});

test('rejects_unknown_schema_and_corrupt_manifest', async (t) => {
  const input = await fixture(t);
  const { projectRoot, candidateRoot } = input;
  const projectLock = await readLock(projectRoot);
  const candidateLock = await readLock(candidateRoot);
  await writeLock(projectRoot, { ...projectLock, schemaVersion: 2 });
  await assert.rejects(compareUpdate(input), { code: 'INVALID_LOCK' });
  await writeLock(projectRoot, projectLock);
  for (const files of [
    { ...candidateLock.managedFiles, [guide]: 'not-a-hash' },
    { ...candidateLock.managedFiles, [guide]: '0'.repeat(64) },
    { ...candidateLock.managedFiles, ['.foundation/GUIDE.md']: candidateLock.managedFiles[guide] },
    { ...candidateLock.managedFiles, [guide + '/file']: candidateLock.managedFiles[guide] },
    { ...candidateLock.managedFiles, ['.foundation/../AGENTS.md']: '0'.repeat(64) },
    { ...candidateLock.managedFiles, ['docs/project/profile.md']: sha256(await readFile(join(candidateRoot, 'docs/project/profile.md'))) },
  ]) {
    await writeLock(candidateRoot, { ...candidateLock, managedFiles: files });
    await assert.rejects(compareUpdate(input), { code: 'INVALID_CANDIDATE' });
  }
  await writeLock(candidateRoot, { ...candidateLock, schemaVersion: 99 });
  await assert.rejects(compareUpdate(input), { code: 'INVALID_CANDIDATE' });
  await writeLock(candidateRoot, candidateLock);
  await rm(join(candidateRoot, guide));
  await assert.rejects(compareUpdate(input), { code: 'INVALID_CANDIDATE' });
});

test('rejects linked candidate assets and reports blocked local paths without following them', async (t) => {
  const input = await fixture(t);
  const { dir, projectRoot, candidateRoot } = input;
  const candidateChecks = join(candidateRoot, '.foundation', 'checks');
  await rename(candidateChecks, join(dir, 'candidate-checks'));
  const localChecks = join(projectRoot, '.foundation', 'checks');
  await symlink(localChecks, candidateChecks, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(compareUpdate(input), { code: 'INVALID_CANDIDATE' });
  await rm(candidateChecks);
  await rename(localChecks, join(dir, 'local-checks'));
  await writeProjectFile(projectRoot, '.foundation/checks', 'blocked ancestor');
  await changeManaged(candidateRoot, Object.fromEntries(
    Object.keys((await readLock(candidateRoot)).managedFiles)
      .filter((path) => path.startsWith('.foundation/checks/'))
      .map((path) => [path, '새 관리 파일']),
  ));
  const report = await compareUpdate(input);
  assert.ok(report.conflicts.length > 0);
  assert.ok(report.conflicts.every(({ path, reason }) => path.startsWith('.foundation/checks/') && reason === 'local-path'));
});
