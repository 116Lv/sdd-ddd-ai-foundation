import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { appendFile, cp, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, rmdir, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { checkProject } from '../distribution/managed/checks/check-project.mjs';
import { exportProject } from '../tools/export-project.mjs';

const sourceRoot = fileURLToPath(new URL('../', import.meta.url));
const fixture = fileURLToPath(new URL('./fixtures/checks/change/', import.meta.url));
const changeName = 'reserve-product';
const changePath = 'openspec/changes/reserve-product/';
const specPath = changePath + 'specs/reservations/spec.md';
const briefPath = 'docs/product/brief.md';

async function scratch(t) {
  const parent = await realpath(tmpdir());
  const dir = await mkdtemp(join(parent, 'foundation-check-'));
  t.after(async () => {
    assert.equal(dirname(await realpath(dir)), parent);
    assert.match(relative(parent, dir), /^foundation-check-[^\\/]+$/);
    await rm(dir, { recursive: true, force: true });
  });
  return dir;
}

async function starter(t) {
  const targetDir = join(await scratch(t), 'starter');
  return (await exportProject({ sourceRoot, targetDir, projectName: '예약', version: '0.1.0' })).projectDir;
}

async function change(t) {
  const projectRoot = await scratch(t);
  await cp(fixture, join(projectRoot, changePath), { recursive: true });
  return projectRoot;
}

async function replace(projectRoot, path, previous, next) {
  const file = join(projectRoot, path);
  const content = (await readFile(file, 'utf8')).replaceAll('\r\n', '\n');
  assert.ok(content.includes(previous));
  await writeFile(file, content.replace(previous, next));
}

function locations(result) {
  return result.findings.map(({ code, path, message }) => {
    assert.ok(message.trim());
    return [code, path];
  });
}

test('valid_starter_passes', async (t) => {
  const projectRoot = await starter(t);
  const profile = join(projectRoot, 'docs/project/profile.md');
  const before = await readFile(profile);
  const entries = (await readdir(projectRoot)).sort();
  assert.match(before.toString('utf8'), /미정/u);
  assert.deepEqual(await checkProject({ projectRoot }), { status: 'pass', findings: [] });
  assert.deepEqual(await readFile(profile), before);
  assert.deepEqual((await readdir(projectRoot)).sort(), entries);
});

test('empty_required_section_fails', async (t) => {
  const projectRoot = await starter(t);
  await replace(projectRoot, briefPath, '미정. 제품이 해결할 문제와 사용자가 얻을 결과를 적습니다.', '<!-- 작성 예정 -->\n- ');
  const result = await checkProject({ projectRoot });
  assert.equal(result.status, 'fail');
  assert.deepEqual(locations(result), [['EMPTY_SECTION', briefPath]]);
});

test('missing_internal_file_fails', async (t) => {
  const projectRoot = await starter(t);
  await replace(projectRoot, 'README.md', '](docs/product/brief.md)', '](docs/product/missing.md "제품 개요")');
  const result = await checkProject({ projectRoot });
  assert.equal(result.status, 'fail');
  assert.deepEqual(locations(result), [['MISSING_LINK_TARGET', 'README.md']]);
  assert.match(result.findings[0].message, /docs\/product\/missing\.md/);
});

test('korean_encoded_path_resolves', async (t) => {
  const projectRoot = await starter(t);
  await writeFile(join(projectRoot, 'docs/예약 안내.md'), '# 예약 안내');
  await replace(projectRoot, briefPath, '## 목표', '[예약 안내](../%EC%98%88%EC%95%BD%20%EC%95%88%EB%82%B4.md#목표)\n\n## 목표');
  assert.deepEqual(await checkProject({ projectRoot }), { status: 'pass', findings: [] });
});

test('change_mode_checks_selected_native_artifacts', async (t) => {
  const projectRoot = await change(t);
  assert.deepEqual(await checkProject({ projectRoot, changeName }), { status: 'pass', findings: [] });
});

test('change_proposal_requires_foundation_sections', async (t) => {
  const projectRoot = await change(t);
  await replace(projectRoot, changePath + 'proposal.md', '## Out of Scope', '## 기타');
  assert.deepEqual(locations(await checkProject({ projectRoot, changeName })), [['MISSING_SECTION', changePath + 'proposal.md']]);
});

test('duplicate_ac_fails', async (t) => {
  const projectRoot = await change(t);
  const otherSpec = changePath + 'specs/stock/spec.md';
  await mkdir(dirname(join(projectRoot, otherSpec)));
  const before = await readFile(join(projectRoot, specPath), 'utf8');
  await writeFile(join(projectRoot, otherSpec), before.slice(0, before.indexOf('#### Scenario: [AC-002]')));
  const result = await checkProject({ projectRoot, changeName });
  assert.equal(result.status, 'fail');
  assert.deepEqual(locations(result), [['DUPLICATE_AC', otherSpec]]);
  assert.match(result.findings[0].message, /AC-001/);
});

test('unknown_task_ac_fails', async (t) => {
  const projectRoot = await change(t);
  const tasks = changePath + 'tasks.md';
  await replace(projectRoot, tasks, '(AC: AC-002)', '(AC: AC-002, AC-999)');
  const result = await checkProject({ projectRoot, changeName });
  assert.equal(result.status, 'fail');
  assert.deepEqual(locations(result), [['UNKNOWN_TASK_AC', tasks]]);
  assert.match(result.findings[0].message, /AC-999/);
});

test('rejects_unlinked_tasks_and_untraced_scenarios', async (t) => {
  const projectRoot = await change(t);
  const tasks = changePath + 'tasks.md';
  await replace(projectRoot, tasks, '(AC: AC-002)', '`(AC: AC-002)`');
  const result = await checkProject({ projectRoot, changeName });
  assert.deepEqual(locations(result), [['MISSING_TASK_AC', tasks], ['UNTRACED_AC', specPath]]);
});

test('ignores_code_fence_samples', async (t) => {
  const projectRoot = await change(t);
  const tasks = changePath + 'tasks.md';
  await replace(projectRoot, tasks, '## 1. 예약 처리', [
    '## 1. 예약 처리',
    '', '  ~~~~md', '  [가짜 파일](missing.md)', '  ~~~',
    '- [ ] 가짜 작업 (AC: AC-999)', '  ~~~~',
    '`[가짜 파일](missing.md)`와 [참조형][가짜]와 [앵커](#missing)',
    '[가짜]: missing.md',
    '[외부](https://example.test/missing.md)',
    '',
  ].join('\n'));
  await replace(projectRoot, specPath, '## ADDED Requirements', [
    '## ADDED Requirements', '', '```markdown', '#### Scenario: [AC-001] 예시', '```', '',
  ].join('\n'));
  assert.deepEqual(await checkProject({ projectRoot, changeName }), { status: 'pass', findings: [] });
});

test('an_unmatched_backtick_does_not_hide_a_link_in_the_next_block', async (t) => {
  const projectRoot = await change(t);
  const tasks = changePath + 'tasks.md';
  await appendFile(join(projectRoot, tasks), '\n\n문장의 닫히지 않은 `\n## 다음 항목\n[실제 링크](missing.md) `\n');
  assert.deepEqual(locations(await checkProject({ projectRoot, changeName })), [['MISSING_LINK_TARGET', tasks]]);
});

test('fences_inside_comments_do_not_hide_subsequent_links', async (t) => {
  const projectRoot = await change(t);
  const proposal = changePath + 'proposal.md';
  await appendFile(join(projectRoot, proposal), '\n\n<!--\n~~~markdown\n-->\n\n[실제 링크](missing.md)\n');
  assert.deepEqual(locations(await checkProject({ projectRoot, changeName })), [['MISSING_LINK_TARGET', proposal]]);
});

test('ignores_links_in_indented_code_blocks', async (t) => {
  const projectRoot = await change(t);
  await appendFile(join(projectRoot, changePath + 'tasks.md'), '\n\n설명 문단\n\n    [예시](missing.md)\n');
  assert.deepEqual(await checkProject({ projectRoot, changeName }), { status: 'pass', findings: [] });
});

test('recognizes_links_after_an_escaped_exclamation_and_backticks_in_angle_destinations', async (t) => {
  const projectRoot = await change(t);
  const tasks = changePath + 'tasks.md';
  await appendFile(join(projectRoot, tasks), '\n\n\\![실제 링크](first.md)\n[두 번째 링크](<file`name`.md>)\n');
  const result = await checkProject({ projectRoot, changeName });
  assert.deepEqual(locations(result), [['MISSING_LINK_TARGET', tasks], ['MISSING_LINK_TARGET', tasks]]);
  assert.match(result.findings[0].message, /first\.md/u);
  assert.match(result.findings[1].message, /file`name`\.md/u);
});

test('keeps_links_after_code_blocks_that_contain_comment_markers', async (t) => {
  const projectRoot = await change(t);
  const proposal = changePath + 'proposal.md';
  await appendFile(join(projectRoot, proposal), '\n\n~~~markdown\n<!--\n[예시](example.md)\n~~~\n\n[실제 링크](missing.md)\n');
  const result = await checkProject({ projectRoot, changeName });
  assert.deepEqual(locations(result), [['MISSING_LINK_TARGET', proposal]]);
  assert.match(result.findings[0].message, /missing\.md/u);
});

test('ignores_links_inside_image_alt_text', async (t) => {
  const projectRoot = await change(t);
  const tasks = changePath + 'tasks.md';
  await appendFile(join(projectRoot, tasks), '\n\n![그림 설명 [예시](missing.md)](missing.png)\n');
  assert.deepEqual(await checkProject({ projectRoot, changeName }), { status: 'pass', findings: [] });
});

test('reports_external_file_references_without_following_symlinks', async (t) => {
  const projectRoot = await change(t);
  const dir = join(projectRoot, changePath);
  const outside = await scratch(t);
  await writeFile(join(outside, 'present.md'), '# 외부');
  await symlink(outside, join(dir, 'outside'), process.platform === 'win32' ? 'junction' : 'dir');
  const proposal = changePath + 'proposal.md';
  await replace(projectRoot, proposal, '결제 처리.', '[외부](../../../../outside.md)\n[링크](outside/present.md)');
  const result = await checkProject({ projectRoot, changeName });
  assert.deepEqual(locations(result), [['EXTERNAL_LINK', proposal], ['EXTERNAL_LINK', proposal]]);
});

test('spec_free_changes_require_explicit_skip_specs_for_the_selected_change', async (t) => {
  const projectRoot = await change(t);
  await rm(join(projectRoot, specPath));
  await rmdir(dirname(join(projectRoot, specPath)));
  await writeFile(join(projectRoot, changePath + 'tasks.md'), '- [ ] 입력 사본 준비 (SETUP: 검증 자료 준비)\n');
  const result = await checkProject({ projectRoot, changeName });
  assert.deepEqual(locations(result), [['MISSING_SPECS', changePath + 'specs']]);
  await writeFile(join(projectRoot, '.openspec.yaml'), 'skip_specs: true\n');
  const unrelated = join(projectRoot, 'openspec/changes/unrelated');
  await mkdir(unrelated);
  await writeFile(join(unrelated, '.openspec.yaml'), 'skip_specs: true\n');
  assert.equal((await checkProject({ projectRoot, changeName })).status, 'fail');
  const config = join(projectRoot, changePath, '.openspec.yaml');
  await writeFile(config, 'rules:\n  skip_specs: true\n');
  assert.equal((await checkProject({ projectRoot, changeName })).status, 'fail');
  await writeFile(config, 'schema: spec-driven\nskip_specs: true # documentation only\n');
  await replace(projectRoot, changePath + 'proposal.md', '## Capabilities\n\n- `reservations`\n\n', '');
  await writeFile(join(projectRoot, changePath + 'tasks.md'), '- [ ] 문서의 명령 예시를 실행한다 (CHANGE: reserve-product)\n');
  assert.deepEqual(await checkProject({ projectRoot, changeName }), { status: 'pass', findings: [] });
});

test('rejects_empty_specs_even_when_the_file_exists', async (t) => {
  const projectRoot = await change(t);
  await writeFile(join(projectRoot, specPath), '# 예약\n<!-- 시나리오 작성 예정 -->\n');
  await writeFile(join(projectRoot, changePath + 'tasks.md'), '- [ ] 테스트 준비 (SETUP: 데이터 준비)\n');
  assert.deepEqual(locations(await checkProject({ projectRoot, changeName })), [['MISSING_SCENARIO', specPath]]);
});

test('reports_missing_leaf_specs_alongside_valid_namespaced_specs', async (t) => {
  const projectRoot = await change(t);
  const specs = join(projectRoot, changePath, 'specs');
  await mkdir(join(specs, 'commerce'));
  await rename(join(specs, 'reservations'), join(specs, 'commerce', 'reservations'));
  await mkdir(join(specs, 'commerce', 'stock'));
  assert.deepEqual(locations(await checkProject({ projectRoot, changeName })), [
    ['MISSING_FILE', changePath + 'specs/commerce/stock/spec.md'],
  ]);
});

test('finds_explicit_nested_specs_under_a_capability_and_ignores_support_folders', async (t) => {
  const projectRoot = await change(t);
  const capability = dirname(join(projectRoot, specPath));
  await mkdir(join(capability, 'assets'));
  await mkdir(join(capability, 'details'));
  const spec = await readFile(join(projectRoot, specPath), 'utf8');
  await writeFile(join(capability, 'details/spec.md'), spec.replace('AC-001', 'AC-003').replace('AC-002', 'AC-004'));
  await appendFile(join(projectRoot, changePath + 'tasks.md'), '\n- [ ] 세부 동작 (AC: AC-003, AC-004)\n');
  assert.deepEqual(await checkProject({ projectRoot, changeName }), { status: 'pass', findings: [] });
});

test('exported_cli_runs_with_node_and_returns_documented_exit_statuses', async (t) => {
  const projectRoot = await starter(t);
  const cli = join(projectRoot, '.foundation/checks/cli.mjs');
  const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', cwd: projectRoot });
  const help = run('--help');
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /--change/);
  const valid = run('--json');
  assert.equal(valid.status, 0, valid.stderr);
  assert.deepEqual(JSON.parse(valid.stdout), { status: 'pass', findings: [] });
  await rm(join(projectRoot, briefPath));
  const invalid = run('--json');
  assert.equal(invalid.status, 1, invalid.stderr);
  assert.ok(locations(JSON.parse(invalid.stdout)).some(([code, path]) => code === 'MISSING_FILE' && path === briefPath));
  const badInput = run('--json', '--change', '../escape');
  assert.equal(badInput.status, 2, badInput.stderr);
  assert.equal(JSON.parse(badInput.stderr).code, 'INVALID_CHANGE_NAME');
});

test('api_errors_for_a_missing_project_root_use_a_stable_code', async () => {
  await assert.rejects(checkProject(null), { code: 'INVALID_PROJECT_ROOT' });
});

test('mixed_deltas_require_each_added_and_modified_requirement_to_have_traced_scenarios', async t => {
  const projectRoot = await change(t);
  const path = join(projectRoot, specPath);
  const valid = await readFile(path, 'utf8');
  const renamed = '## RENAMED Requirements\n- FROM: `### Requirement: 이전 이름`\n- TO: `### Requirement: 새 이름`\n';
  for (const op of ['ADDED', 'MODIFIED']) {
    await writeFile(path, [renamed, valid, '## ' + op + ' Requirements', '### Requirement: 추가 검사', '사용자는 확인해야 한다 (MUST).'].join('\n\n'));
    const result = await checkProject({ projectRoot, changeName });
    assert.deepEqual(locations(result), [['MISSING_SCENARIO', specPath]]);
    assert.match(result.findings[0].message, /추가 검사/u);
  }
  await writeFile(path, renamed + '\n' + valid);
  await writeFile(join(projectRoot, changePath + 'tasks.md'),
    '- [ ] 시나리오 구현 (CHANGE: reserve-product)\n- [ ] 재고가 없을 때 검증 (AC: AC-002)\n');
  const result = await checkProject({ projectRoot, changeName });
  assert.ok(result.findings.some(({ code, message }) => code === 'UNTRACED_AC' && message.includes('AC-001')));
});
