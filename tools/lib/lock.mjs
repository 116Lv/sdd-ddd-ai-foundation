import { createHash } from 'node:crypto';
import { mkdir, rmdir } from 'node:fs/promises';
import { join } from 'node:path';
import { codedError } from './paths.mjs';

export const lockName = 'foundation.lock.json';

export function validVersion(value) {
  return typeof value === 'string' && /\S/u.test(value) && !/[\p{Cc}\u2028\u2029]/u.test(value);
}

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function createFoundationLock(version, files) {
  const managedFiles = Object.fromEntries(files
    .filter(({ mode }) => mode === 'managed')
    .map(({ target, bytes }) => [target, sha256(bytes)])
    .sort(([left], [right]) => left < right ? -1 : Number(left > right)));

  return {
    schemaVersion: 1,
    foundationVersion: version,
    managedFiles,
    connections: { tools: [], files: {} },
    compatibility: { openspec: '2.1.0' },
  };
}

export function connectionGuardPath(projectDir) {
  return join(projectDir, '.foundation-connect-lock');
}

async function removeGuard(path) {
  try {
    await rmdir(path);
  } catch (error) {
    return { code: error.code, path, message: '연결 잠금을 정리할 수 없습니다. ' + path };
  }
}

export async function withConnectionGuard(path, action) {
  try {
    await mkdir(path);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    throw codedError('CONNECTION_BUSY', '다른 연결 작업이 사용 중입니다. ' + path, error);
  }
  let result;
  try {
    result = await action();
  } catch (error) {
    const guardWarning = await removeGuard(path);
    if (guardWarning) error.guardWarning = guardWarning;
    throw error;
  }
  const guardWarning = await removeGuard(path);
  return guardWarning ? { ...result, guardWarning } : result;
}
