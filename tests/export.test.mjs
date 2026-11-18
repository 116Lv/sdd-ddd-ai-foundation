import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs, { cp, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { exportProject } from '../tools/export-project.mjs';

const sourceRoot = fileURLToPath(new URL('../', import.meta.url));
const cli = fileURLToPath(new URL('../tools/export-project.mjs', import.meta.url));
const projectName = '봄 $& {{OTHER}}';
const version = '0.1.0';

async function scratch(t) {
  const parent = await realpath(tmpdir());
  const dir = await mkdtemp(join(parent, 'foundation-export-'));
  t.after(async () => {
    assert.equal(dirname(await realpath(dir)), parent);
    assert.match(relative(parent, dir), /^foundation-export-[^\\/]+$/);
    await rm(dir, { recursive: true, force: true });
  });
  return dir;
}

async function filesIn(dir, prefix = '') {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = prefix + entry.name;
    if (entry.isDirectory()) files.push(...await filesIn(join(dir, entry.name), path + '/'));
    else files.push(path);
  }
  return files.sort();
}

async function writeMap(root, entries) {
  await mkdir(join(root, 'releases'), { recursive: true });
  await writeFile(join(root, 'releases', 'distribution-map.json'), JSON.stringify(entries));
}

function exportTo(targetDir, overrides = {}) {
  return exportProject({ sourceRoot, targetDir, version, projectName, ...overrides });
}

test('exports_only_declared_assets', async (t) => {
  const dir = await scratch(t);
  const source = join(dir, 'source');
  await cp(join(sourceRoot, 'distribution'), join(source, 'distribution'), { recursive: true });
  await cp(join(sourceRoot, 'releases', 'distribution-map.json'), join(source, 'releases', 'distribution-map.json'));
  await cp(join(sourceRoot, 'integrations'), join(source, 'integrations'), { recursive: true });
  await cp(join(sourceRoot, 'tools'), join(source, 'tools'), { recursive: true });
  await writeFile(join(source, 'AGENTS.md'), 'source development instructions');
  await writeFile(join(source, 'package.json'), '{}');
  await writeFile(join(source, 'distribution', 'managed', 'undeclared.md'), 'extra');

  const targetDir = join(dir, 'projects', '봄');
  const { projectDir, lock } = await exportTo(targetDir, { sourceRoot: source });
  assert.equal(projectDir, targetDir);
  assert.deepEqual(await filesIn(projectDir), [
    '.foundation/checklists/completion.md',
    '.foundation/checklists/spec-design.md',
    '.foundation/checks/check-project.mjs',
    '.foundation/checks/cli.mjs',
    '.foundation/checks/markdown.mjs',
    '.foundation/guide.md',
    '.foundation/integrations/claude/CLAUDE.md.template',
    '.foundation/integrations/tools.json',
    '.foundation/skills/foundation-completion-review/SKILL.md.template',
    '.foundation/skills/foundation-spec-review/SKILL.md.template',
    '.foundation/templates/adr.md',
    '.foundation/templates/context-map.md',
    '.foundation/templates/domain-rules.md',
    '.foundation/templates/runbook.md',
    '.foundation/templates/state-model.md',
    '.foundation/templates/verification.md',
    '.foundation/tools/connect-tools.mjs',
    '.foundation/tools/lib/lock.mjs',
    '.foundation/tools/lib/paths.mjs',
    '.foundation/workflow.md',
    'AGENTS.md',
    'CONTRIBUTING.md',
    'README.md',
    'docs/README.md',
    'docs/domain/glossary.md',
    'docs/product/brief.md',
    'docs/project/profile.md',
    'foundation.lock.json',
  ]);
  assert.match(await readFile(join(projectDir, 'README.md'), 'utf8'), /^# 봄 \$& \{\{OTHER\}\}\r?\n/);
  assert.match(await readFile(join(projectDir, 'AGENTS.md'), 'utf8'), /^# 봄 \$& \{\{OTHER\}\} 작업 지침/);
  const guide = await readFile(join(source, 'distribution', 'managed', 'guide.md'));
  assert.deepEqual(await readFile(join(projectDir, '.foundation', 'guide.md')), guide);
  assert.equal(lock.schemaVersion, 1);
  assert.equal(lock.foundationVersion, version);
  assert.deepEqual(lock.compatibility, { openspec: '2.1.0' });
  assert.deepEqual(lock.connections, { tools: [], files: {} });
  assert.equal(lock.managedFiles['.foundation/guide.md'], createHash('sha256').update(guide).digest('hex'));
  const managed = (await filesIn(projectDir)).filter((path) => path.startsWith('.foundation/'));
  assert.deepEqual(Object.keys(lock.managedFiles), managed);

  const again = await exportTo(join(dir, 'repeat'), { sourceRoot: source });
  const lockBytes = await readFile(join(projectDir, 'foundation.lock.json'));
  assert.deepEqual(JSON.parse(lockBytes), lock);
  assert.deepEqual(await readFile(join(again.projectDir, 'foundation.lock.json')), lockBytes);
});

test('preserves_nonempty_target', async (t) => {
  const dir = await scratch(t);
  const targetDir = join(dir, 'project');
  await mkdir(targetDir);
  await writeFile(join(targetDir, '.existing'), 'keep');
  await assert.rejects(exportTo(targetDir), { code: 'TARGET_NOT_EMPTY' });
  assert.deepEqual(await readdir(targetDir), ['.existing']);
  assert.equal(await readFile(join(targetDir, '.existing'), 'utf8'), 'keep');
});

test('replaces_an_empty_target_with_a_complete_export', async (t) => {
  const dir = await scratch(t);
  const targetDir = join(dir, 'project');
  await mkdir(targetDir);
  const result = await exportTo(targetDir);
  assert.equal(result.projectDir, targetDir);
  assert.deepEqual(JSON.parse(await readFile(join(targetDir, 'foundation.lock.json'), 'utf8')), result.lock);
  assert.deepEqual(await readdir(dir), ['project']);
});

test('rejects_path_escape_and_symlink', async (t) => {
  const dir = await scratch(t);
  const source = join(dir, 'source');
  const targetDir = join(dir, 'project');
  const outside = join(dir, 'outside');
  const mapped = { source: 'distribution/managed/guide.md', target: '.foundation/guide.md', mode: 'managed' };
  await mkdir(outside);
  await writeFile(join(outside, 'guide.md'), 'keep');
  await mkdir(join(source, 'distribution', 'managed'), { recursive: true });
  await writeFile(join(source, mapped.source), 'local');
  for (const entry of [
    { ...mapped, source: '../outside/guide.md' },
    { ...mapped, source: join(outside, 'guide.md') },
    { ...mapped, target: '.foundation/../../outside/guide.md' },
    { ...mapped, target: 'C:outside/guide.md' },
    { ...mapped, target: '.foundation\\..\\outside\\guide.md' },
  ]) {
    await writeMap(source, [entry]);
    await assert.rejects(exportTo(targetDir, { sourceRoot: source }), { code: 'INVALID_PATH' });
  }
  const link = join(source, 'distribution', 'managed', 'link');
  const linkType = process.platform === 'win32' ? 'junction' : 'dir';
  await symlink(outside, link, linkType);
  await writeMap(source, [{ ...mapped, source: 'distribution/managed/link/guide.md' }]);
  await assert.rejects(exportTo(targetDir, { sourceRoot: source }), { code: 'SYMLINK_PATH' });
  await writeMap(source, [mapped]);
  const targetParentLink = join(dir, 'target-parent-link');
  await symlink(outside, targetParentLink, linkType);
  await assert.rejects(exportTo(join(targetParentLink, 'project'), { sourceRoot: source }), { code: 'SYMLINK_PATH' });
  await assert.rejects(exportTo(targetParentLink, { sourceRoot: source }), { code: 'SYMLINK_PATH' });
  const sourceLink = join(dir, 'source-link');
  await symlink(source, sourceLink, linkType);
  await assert.rejects(exportTo(targetDir, { sourceRoot: sourceLink }), { code: 'SYMLINK_PATH' });
  await assert.rejects(lstat(targetDir), { code: 'ENOENT' });
  assert.deepEqual(await readdir(outside), ['guide.md']);
  assert.equal(await readFile(join(outside, 'guide.md'), 'utf8'), 'keep');
});

test('an_invalid_mapping_leaves_an_empty_target_intact', async (t) => {
  const dir = await scratch(t);
  const source = join(dir, 'source');
  const targetDir = join(dir, 'project');
  await mkdir(targetDir);
  await mkdir(join(source, 'distribution', 'managed'), { recursive: true });
  const sourcePath = 'distribution/managed/guide.md';
  await writeFile(join(source, sourcePath), 'local');
  const entry = { source: sourcePath, target: '.foundation/guide.md', mode: 'managed' };
  for (const entries of [
    [entry, { ...entry, source: 'distribution/managed/missing.md', target: '.foundation/missing.md' }],
    [entry, { ...entry, target: '.foundation/GUIDE.md' }],
    [entry, { ...entry, target: '.foundation/guide.md/sub.md' }],
    [{ ...entry, target: 'foundation.lock.json' }],
    [{ source: 'distribution/starter/package.json.template', target: 'package.json', mode: 'starter' }],
    [{ source: 'tools/connect-tools.mjs', target: '.foundation/tools/renamed.mjs', mode: 'managed' }],
  ]) {
    await writeMap(source, entries);
    await assert.rejects(exportTo(targetDir, { sourceRoot: source }), { code: 'INVALID_MAP' });
    assert.deepEqual(await readdir(targetDir), []);
    assert.deepEqual((await readdir(dir)).sort(), ['project', 'source']);
  }
});

test('export_keeps_its_staging_write_error_when_cleanup_also_fails', async (t) => {
  const dir = await scratch(t);
  const targetDir = join(dir, 'project');
  const writeError = Object.assign(new Error('staging write failed'), { code: 'ENOSPC' });
  const writeMock = t.mock.method(fs, 'writeFile', async () => { throw writeError; });
  const remove = fs.rm;
  const rmMock = t.mock.method(fs, 'rm', async (path, options) => {
    if (dirname(path) === dir && basename(path).startsWith('.foundation-stage-')) {
      throw Object.assign(new Error('staging cleanup denied'), { code: 'EPERM' });
    }
    return remove(path, options);
  });
  syncBuiltinESMExports();
  t.after(() => {
    rmMock.mock.restore();
    writeMock.mock.restore();
    syncBuiltinESMExports();
  });

  await assert.rejects(exportTo(targetDir), (error) => {
    assert.equal(error, writeError);
    assert.equal(error.code, 'ENOSPC');
    assert.equal(error.cleanupWarning.code, 'EPERM');
    assert.equal(dirname(error.cleanupWarning.path), dir);
    return true;
  });
  await assert.rejects(lstat(targetDir), { code: 'ENOENT' });
});

test('export_cli_help_and_json_use_documented_exit_statuses', async (t) => {
  const dir = await scratch(t);
  const targetDir = join(dir, 'project');
  const help = spawnSync(process.execPath, [cli, '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /--target-dir/);
  const command = [cli, '--target-dir', targetDir, '--project-name', '봄', '--version', version, '--json'];
  const created = spawnSync(process.execPath, command, { encoding: 'utf8' });
  assert.equal(created.status, 0, created.stderr);
  assert.equal(JSON.parse(created.stdout).projectDir, targetDir);
  const repeated = spawnSync(process.execPath, command, { encoding: 'utf8' });
  assert.equal(repeated.status, 2);
  assert.equal(JSON.parse(repeated.stderr).code, 'TARGET_NOT_EMPTY');
});
