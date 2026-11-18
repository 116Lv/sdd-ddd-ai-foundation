import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cp, mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exportProject } from '../tools/export-project.mjs';

export const sourceRoot = fileURLToPath(new URL('../', import.meta.url));
export const change = 'cancel-reservation';
export const example = join(sourceRoot, 'examples/reservation-cancellation');

export async function starter(t) {
  const parent = await realpath(tmpdir());
  const dir = await mkdtemp(join(parent, 'foundation-journey-'));
  t.after(async () => {
    assert.equal(dirname(await realpath(dir)), parent);
    await rm(dir, { recursive: true, force: true });
  });
  const project = join(dir, 'project');
  await exportProject({ sourceRoot, targetDir: project, version: '0.1.0', projectName: '예약 시범' });
  return { project, dir };
}

export async function applyExample(project) {
  for (const folder of ['docs', 'openspec']) {
    await cp(join(example, folder), join(project, folder), { recursive: true });
  }
}

export function openspec(project, ...args) {
  const cli = join(sourceRoot, 'node_modules/@fission-ai/openspec/bin/openspec.js');
  return execFileSync(process.execPath, [cli, ...args], {
    cwd: project,
    encoding: 'utf8',
    env: {
      ...process.env,
      CI: 'true',
      OPENSPEC_TELEMETRY: '0',
      XDG_CONFIG_HOME: join(dirname(project), 'config'),
      XDG_DATA_HOME: join(dirname(project), 'data'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}
