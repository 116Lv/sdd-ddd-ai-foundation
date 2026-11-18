import assert from 'node:assert/strict';
import { copyFile, cp, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { checkProject, proposalHeadings } from '../distribution/managed/checks/check-project.mjs';
import { hasScenarioStep, readMarkdown, sectionBlocks } from '../distribution/managed/checks/markdown.mjs';
import { applyExample, change, openspec, starter } from './journey-fixture.mjs';

const spec = 'specs/reservation-cancellation/spec.md';

test('rules_reach_expected_artifacts', async t => {
  const { project } = await starter(t);
  assert.equal(openspec(project, '--version').trim(), '2.1.0');
  openspec(project, 'init', '--tools', 'none', '--scope', 'project');
  await copyFile(join(project, '.foundation/openspec-rules.yaml'), join(project, 'openspec/config.yaml'));
  openspec(project, 'new', 'change', change);
  for (const [artifact, expected] of Object.entries({
    proposal: proposalHeadings.map(([native]) => native),
    specs: ['[AC-001]'], design: ['docs/domain/'], tasks: ['(AC: AC-001)', '(SETUP:', '(CHANGE:'],
  })) {
    const instructions = JSON.parse(openspec(project, 'instructions', artifact, '--change', change, '--json'));
    assert.equal(instructions.artifactId, artifact);
    assert.match(instructions.context, /\.foundation\/workflow\.md/u);
    for (const term of expected) assert.ok(instructions.rules.some(rule => rule.includes(term)), artifact + ' / ' + term);
  }
});

test('native_spec_format_accepts_ac_heading', async t => {
  const { project } = await starter(t);
  await applyExample(project);
  const document = await readFile(join(project, 'openspec/changes', change, spec), 'utf8');
  assert.match(document, /^#### Scenario: \[AC-001\] \S/mu);
  const report = JSON.parse(openspec(project, 'validate', change, '--strict', '--json'));
  assert.ok(report.items.some(item => item.id === change && item.valid));
});

function scenarioBlocks(source) {
  const markdown = readMarkdown(source);
  return markdown.headings
    .filter(heading => heading.level === 4 && heading.title.startsWith('Scenario: '))
    .map(heading => {
      const blocks = sectionBlocks(markdown, heading);
      assert.ok(hasScenarioStep(blocks, 'WHEN'), heading.title + ' / WHEN');
      assert.ok(hasScenarioStep(blocks, 'THEN'), heading.title + ' / THEN');
      return { title: heading.title, body: blocks.map(block => block.raw).join('').trim() };
    });
}

test('archive_updates_current_specs', async t => {
  const { project } = await starter(t);
  await applyExample(project);
  const osDir = join(project, 'openspec');
  await assert.rejects(readFile(join(osDir, spec)), { code: 'ENOENT' });
  const delta = await readFile(join(osDir, 'changes', change, spec), 'utf8');
  const expectedScenarios = scenarioBlocks(delta);
  assert.ok(expectedScenarios.length >= 4);
  openspec(project, 'archive', change, '--yes');
  const current = await readFile(join(osDir, spec), 'utf8');
  assert.deepEqual(scenarioBlocks(current), expectedScenarios);
  const archive = (await readdir(join(osDir, 'changes/archive'))).find(path => path.endsWith('-' + change));
  assert.ok(archive);
  assert.equal(await readFile(join(osDir, 'changes/archive', archive, spec), 'utf8'), delta);
  await assert.rejects(readFile(join(osDir, 'changes', change, 'proposal.md')), { code: 'ENOENT' });
});

for (const [operation, delta] of [
  ['renamed', '## RENAMED Requirements\n\n- FROM: `### Requirement: 예약자의 취소 요청`\n- TO: `### Requirement: 예약 취소 요청 처리`'],
  ['removed', '## REMOVED Requirements\n\n### Requirement: 예약자의 취소 요청\n\n**Reason**: 기능 종료\n\n**Migration**: 기존 요청 경로를 닫는다.'],
]) {
  test('native_scenario_free_' + operation + '_change', async t => {
    const { project } = await starter(t);
    await applyExample(project);
    const changesDir = join(project, 'openspec/changes');
    const changeName = operation + '-cancellation';
    const selected = join(changesDir, changeName);
    await cp(join(changesDir, change), selected, { recursive: true });
    openspec(project, 'archive', change, '--yes');
    assert.match(await readFile(join(project, 'openspec', spec), 'utf8'), /### Requirement: 예약자의 취소 요청/u);
    await writeFile(join(selected, 'proposal.md'), [
      '## Why', '취소 정책 변경을 반영한다.', '## What Changes', delta.split('\n')[0].slice(3),
      '## Capabilities', 'reservation-cancellation', '## Impact', '기존 취소 명세와 참조',
      '## Out of Scope', '예약 생성', '## Actors and Permissions', '정책 관리자', '## Open Questions', '없음',
    ].join('\n\n'));
    await writeFile(join(selected, spec), delta + '\n');
    await writeFile(join(selected, 'tasks.md'), '- [ ] 호출 경로와 현재 명세를 검증한다 (CHANGE: ' + changeName + ')\n');
    const report = JSON.parse(openspec(project, 'validate', changeName, '--strict', '--json'));
    const item = report.items.find(entry => entry.id === changeName);
    assert.equal(item.valid, true);
    assert.deepEqual(item.issues, []);
    assert.deepEqual(await checkProject({ projectRoot: project, changeName }), { status: 'pass', findings: [] });
    await writeFile(join(selected, 'tasks.md'), '- [ ] 실제 변경을 확인한다 (CHANGE: other-change)\n');
    const wrong = await checkProject({ projectRoot: project, changeName });
    assert.ok(wrong.findings.some(finding => finding.code === 'INVALID_TASK_CHANGE'));
    await writeFile(join(selected, spec), delta + '\n\n## ADDED Requirements\n\n### Requirement: 빈 검증\n시스템은 이유를 표시해야 한다 (SHALL).\n');
    assert.throws(() => openspec(project, 'validate', changeName, '--strict', '--json'), error => {
      const invalid = JSON.parse(error.stdout).items.find(entry => entry.id === changeName);
      return invalid.valid === false && invalid.issues.length > 0;
    });
    assert.ok((await checkProject({ projectRoot: project, changeName })).findings
      .some(({ code, message }) => code === 'MISSING_SCENARIO' && message.includes('빈 검증')));
  });
}
