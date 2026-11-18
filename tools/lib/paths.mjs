import { lstat, mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { basename, dirname, join, parse, resolve, sep } from 'node:path';

export function codedError(code, message, cause) {
  return Object.assign(new Error(message, { cause }), { code });
}

export function absolutePath(value, name) {
  if (typeof value !== 'string' || !value.trim() || value.includes('\0')) {
    throw codedError('INVALID_PATH', name + ' 경로를 입력하세요.');
  }
  return resolve(value);
}

export function pathParts(relativePath) {
  if (typeof relativePath !== 'string') {
    throw codedError('INVALID_PATH', '배포 경로는 문자열이어야 합니다.');
  }
  const parts = relativePath.split('/');
  for (const part of parts) {
    // Windows에서도 동일한 상대 경로로 안전하게 사용할 수 있어야 한다.
    if (!part || /[<>:"\\|?*\x00-\x1f]/u.test(part) || /[. ]$/u.test(part)
        || /^(?:CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³])(?:\.|$)/iu.test(part)) {
      throw codedError('INVALID_PATH', '잘못된 배포 경로입니다. ' + relativePath);
    }
  }
  return parts;
}

export async function statWithoutSymlink(path) {
  const stat = await lstat(path);
  if (stat.isSymbolicLink()) {
    throw codedError('SYMLINK_PATH', '심볼릭 링크를 사용할 수 없습니다. ' + path);
  }
  return stat;
}

// 경로의 끝뿐 아니라 기존 상위 폴더도 검사한다.
export async function inspectPath(absolute, { allowMissing = false } = {}) {
  const { root } = parse(absolute);
  const subpath = absolute.slice(root.length);
  const parts = subpath ? subpath.split(sep) : [];
  let current = root;
  let stat = await statWithoutSymlink(current);
  for (const part of parts) {
    if (!stat.isDirectory()) {
      throw codedError('INVALID_PATH', '상위 경로가 폴더가 아닙니다. ' + current);
    }
    current = join(current, part);
    try {
      stat = await statWithoutSymlink(current);
    } catch (error) {
      if (allowMissing && error.code === 'ENOENT') return undefined;
      throw error;
    }
  }
  return stat;
}

async function removeStagingDirectory(path) {
  try {
    await rm(path, { recursive: true, force: true });
  } catch (error) {
    const code = error.code ?? 'CLEANUP_FAILED';
    return {
      code,
      path,
      message: '임시 폴더를 정리할 수 없습니다. ' + path + ' [' + code + ']',
    };
  }
}

export async function withStagingDirectory(parent, action) {
  if (!(await inspectPath(parent, { allowMissing: true }))) {
    await mkdir(parent, { recursive: true });
    await inspectPath(parent);
  }
  const stage = await mkdtemp(join(parent, '.foundation-stage-'));
  // 정리할 수 있는 경로는 여기에서 만든 임시 폴더뿐이다.
  const resolvedParent = await realpath(parent);
  const resolvedStage = await realpath(stage);
  if (dirname(resolvedStage) !== resolvedParent || !basename(resolvedStage).startsWith('.foundation-stage-')) {
    throw codedError('INVALID_PATH', '임시 폴더가 지정한 상위 경로에 없습니다. ' + stage);
  }
  let result;
  try {
    result = await action(stage);
  } catch (error) {
    const cleanupWarning = await removeStagingDirectory(resolvedStage);
    if (cleanupWarning) error.cleanupWarning = cleanupWarning;
    throw error;
  }

  // 작업 결과가 게시되면 정리 실패도 성공 결과와 함께 반환한다.
  const cleanupWarning = await removeStagingDirectory(resolvedStage);
  return cleanupWarning ? { ...result, cleanupWarning } : result;
}
