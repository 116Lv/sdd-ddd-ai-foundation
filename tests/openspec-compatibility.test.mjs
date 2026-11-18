import assert from 'node:assert/strict';
import { copyFile, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { proposalHeadings } from '../distribution/managed/checks/check-project.mjs';
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
    specs: ['[AC-001]'], design: ['docs/domain/'], tasks: ['(AC: AC-001)', '(SETUP:'],
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

test('archive_updates_current_specs', async t => {
  const { project } = await starter(t);
  await applyExample(project);
  const osDir = join(project, 'openspec');
  await assert.rejects(readFile(join(osDir, spec)), { code: 'ENOENT' });
  const delta = await readFile(join(osDir, 'changes', change, spec), 'utf8');
  const titles = [...delta.matchAll(/^#### Scenario: (.+)$/gmu)].map(match => match[1]);
  assert.ok(titles.length >= 4);
  openspec(project, 'archive', change, '--yes');
  const current = await readFile(join(osDir, spec), 'utf8');
  for (const title of titles) assert.ok(current.includes(title));
  const archive = (await readdir(join(osDir, 'changes/archive'))).find(path => path.endsWith('-' + change));
  assert.ok(archive);
  assert.equal(await readFile(join(osDir, 'changes/archive', archive, spec), 'utf8'), delta);
  await assert.rejects(readFile(join(osDir, 'changes', change, 'proposal.md')), { code: 'ENOENT' });
});
