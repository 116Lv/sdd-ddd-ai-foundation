import { rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectionGuardPath, lockName, withConnectionGuard } from './lib/lock.mjs';
import { codedError, withStagingDirectory } from './lib/paths.mjs';
import { runUpdateCli } from './lib/update-cli.mjs';
import { matchesCandidatePath, readUpdate, updateRoots, verifyUnchangedLock } from './lib/update-state.mjs';

export async function recordBaseline(options) {
  const { acknowledgeNewPaths = [] } = options ?? {};
  if (!Array.isArray(acknowledgeNewPaths) || !acknowledgeNewPaths.every((path) => typeof path === 'string')) {
    throw codedError('INVALID_ACKNOWLEDGEMENT', '승인할 신규 관리 경로를 문자열 배열로 지정하세요.');
  }
  const acknowledged = new Set(acknowledgeNewPaths);
  const roots = await updateRoots(options);
  return withConnectionGuard(connectionGuardPath(roots.projectDir), async () => {
    const { current, candidate, actual, connections } = await readUpdate(roots);
    for (const path of acknowledged) {
      if (!candidate.managed.has(path) || current.managed.has(path)) {
        throw codedError('INVALID_ACKNOWLEDGEMENT', '후보에서 추가되는 관리 경로만 승인할 수 있습니다. ' + JSON.stringify(path));
      }
    }

    const findings = [];
    for (const path of actual.keys()) {
      const added = candidate.managed.has(path) && !current.managed.has(path);
      if (added && !acknowledged.has(path)) findings.push({ path, reason: 'new-path-unacknowledged' });
      const hash = candidate.managed.get(path);
      if (!matchesCandidatePath(path, actual, candidate)) {
        const reason = hash === undefined ? 'retired-path-present' : 'candidate-mismatch';
        findings.push({ path, reason });
      }
    }
    findings.push(...connections.refresh);
    if (findings.length) {
      const error = codedError('BASELINE_CONFLICT', '신규 관리 경로의 승인, 설치된 관리 파일과 AI 연결 상태를 확인하세요.');
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
