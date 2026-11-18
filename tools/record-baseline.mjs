import { rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectionGuardPath, lockName, withConnectionGuard } from './lib/lock.mjs';
import { codedError, withStagingDirectory } from './lib/paths.mjs';
import { runUpdateCli } from './lib/update-cli.mjs';
import { matchesCandidatePath, readUpdate, updateRoots, verifyUnchangedLock } from './lib/update-state.mjs';

export async function recordBaseline(options) {
  const roots = await updateRoots(options);
  return withConnectionGuard(connectionGuardPath(roots.projectDir), async () => {
    const { current, candidate, actual, connections } = await readUpdate(roots);
    const findings = [];
    for (const path of actual.keys()) {
      const hash = candidate.managed.get(path);
      if (!matchesCandidatePath(path, actual, candidate)) {
        const reason = hash === undefined ? 'retired-path-present' : 'candidate-mismatch';
        findings.push({ path, reason });
      }
    }
    findings.push(...connections.refresh);
    if (findings.length) {
      const error = codedError('BASELINE_CONFLICT', '후보 버전과 설치된 관리 파일 및 AI 연결 상태를 확인하세요.');
      error.findings = findings;
      throw error;
    }

    const version = candidate.lock.foundationVersion;
    const { lockPath } = current;
    const result = { version, lockPath };
    const updated = {
      ...current.lock,
      foundationVersion: version,
      managedFiles: Object.fromEntries(candidate.managed),
      compatibility: candidate.lock.compatibility,
    };
    const bytes = Buffer.from(JSON.stringify(updated, null, 2) + '\n');
    if (bytes.equals(current.lockBytes)) return result;
    return withStagingDirectory(roots.projectDir, async (stage) => {
      const staged = join(stage, lockName);
      await writeFile(staged, bytes, { flag: 'wx', flush: true });
      await verifyUnchangedLock(lockPath, current.lockBytes);
      await rename(staged, lockPath);
      return result;
    });
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runUpdateCli('record-baseline', recordBaseline, ({ version, lockPath }) => {
    console.log('기반 버전 ' + version + ' 기록 완료 ' + lockPath);
  });
}
