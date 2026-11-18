import { mkdir, readFile, readdir, rename, rmdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { createFoundationLock, lockName } from './lib/lock.mjs';
import { absolutePath, codedError, inspectPath, pathParts, withStagingDirectory } from './lib/paths.mjs';

const defaultSourceRoot = fileURLToPath(new URL('../', import.meta.url));

function registerTarget(target, parts, seen) {
  const normalized = target.normalize('NFC').toLowerCase();
  const top = parts[0].toLowerCase();
  if ([lockName, 'package.json'].includes(top)) {
    throw codedError('INVALID_MAP', '예약된 배포 대상입니다. ' + target);
  }

  let prefix = '';
  for (const part of parts) {
    prefix = prefix ? prefix + '/' + part : part;
    const key = prefix.normalize('NFC').toLowerCase();
    const previous = seen.get(key);
    const isFile = key === normalized;
    if (previous && (previous.isFile || isFile || previous.path !== prefix)) {
      throw codedError('INVALID_MAP', '배포 대상 경로가 충돌합니다. ' + target);
    }
    seen.set(key, { path: prefix, isFile });
  }
}

async function readMap(sourceDir) {
  const mapPath = join(sourceDir, 'releases', 'distribution-map.json');
  let map;
  try {
    if (!(await inspectPath(mapPath)).isFile()) {
      throw codedError('INVALID_MAP', '배포 목록은 일반 파일이어야 합니다.');
    }
    map = JSON.parse(await readFile(mapPath, 'utf8'));
  } catch (error) {
    if (error instanceof SyntaxError || error.code === 'ENOENT') {
      throw codedError('INVALID_MAP', '배포 목록을 읽을 수 없습니다. ' + mapPath, error);
    }
    throw error;
  }
  if (!Array.isArray(map) || !map.length) {
    throw codedError('INVALID_MAP', '배포 목록은 항목이 있는 배열이어야 합니다.');
  }
  return map;
}

async function loadFiles(sourceDir, projectName) {
  const map = await readMap(sourceDir);
  const files = [];
  const seen = new Map();
  for (const entry of map) {
    const { source, target, mode } = entry ?? {};
    const sourceParts = pathParts(source);
    const targetParts = pathParts(target);
    const starter = mode === 'starter';
    const connectorRuntime = target === '.foundation/' + source
      && (/^tools\/.+\.mjs$/u.test(source)
        || source === 'integrations/tools.json'
        || source === 'integrations/claude/CLAUDE.md.template');
    if ((!starter && mode !== 'managed')
        || (!source.startsWith('distribution/' + mode + '/') && (starter || !connectorRuntime))
        || (starter && (!source.endsWith('.template') || target.endsWith('.template')))
        || (starter && targetParts[0].toLowerCase() === '.foundation')
        || (!starter && !target.startsWith('.foundation/'))) {
      throw codedError('INVALID_MAP', '배포 항목의 모드와 경로가 일치하지 않습니다. ' + source);
    }
    registerTarget(target, targetParts, seen);

    const sourcePath = join(sourceDir, ...sourceParts);
    const stat = await inspectPath(sourcePath, { allowMissing: true });
    if (!stat?.isFile()) {
      throw codedError('INVALID_MAP', '배포 원본은 일반 파일이어야 합니다. ' + source);
    }
    const original = await readFile(sourcePath);
    const bytes = starter
      ? Buffer.from(original.toString('utf8').replaceAll('{{PROJECT_NAME}}', () => projectName))
      : original;
    files.push({ target, targetParts, mode, bytes });
  }
  return files;
}

async function inspectTarget(projectDir) {
  const stat = await inspectPath(projectDir, { allowMissing: true });
  if (!stat) return false;
  if (!stat.isDirectory()) {
    throw codedError('INVALID_PATH', '내보내기 대상은 폴더여야 합니다. ' + projectDir);
  }
  if ((await readdir(projectDir)).length > 0) {
    throw codedError('TARGET_NOT_EMPTY', '내보내기 대상 폴더가 비어 있지 않습니다. ' + projectDir);
  }
  return true;
}

async function publishProject(stage, projectDir) {
  const existed = await inspectTarget(projectDir);
  if (existed) {
    try {
      // rmdir은 검사 후 다른 작업이 항목을 만들었으면 실패한다.
      await rmdir(projectDir);
    } catch (error) {
      if (error.code === 'ENOTEMPTY' || error.code === 'EEXIST') {
        throw codedError('TARGET_NOT_EMPTY', '내보내기 대상 폴더가 비어 있지 않습니다. ' + projectDir, error);
      }
      if (error.code !== 'ENOENT') throw error;
    }
  }
  try {
    await rename(stage, projectDir);
  } catch (error) {
    if (existed && !(await inspectPath(projectDir, { allowMissing: true }))) {
      await mkdir(projectDir).catch((restoreError) => {
        if (restoreError.code !== 'EEXIST') throw restoreError;
      });
    }
    await inspectTarget(projectDir);
    throw error;
  }
}

export async function exportProject(options) {
  const { sourceRoot, targetDir, version, projectName } = options ?? {};
  const sourceDir = absolutePath(sourceRoot, '원본');
  const projectDir = absolutePath(targetDir, '내보내기 대상');
  if (typeof version !== 'string' || !version.trim()
      || typeof projectName !== 'string' || !projectName.trim() || /[\r\n]/u.test(projectName)) {
    throw codedError('INVALID_INPUT', '기반 버전과 한 줄로 된 프로젝트 이름을 입력하세요.');
  }
  if (!(await inspectPath(sourceDir)).isDirectory()) {
    throw codedError('INVALID_PATH', '원본 경로는 폴더여야 합니다. ' + sourceDir);
  }
  await inspectTarget(projectDir);
  const files = await loadFiles(sourceDir, projectName);
  const lock = createFoundationLock(version, files);

  return withStagingDirectory(dirname(projectDir), async (stage) => {
    for (const { targetParts, bytes } of files) {
      const path = join(stage, ...targetParts);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, bytes, { flag: 'wx' });
    }
    await writeFile(join(stage, lockName), JSON.stringify(lock, null, 2) + '\n', { flag: 'wx' });
    await publishProject(stage, projectDir);
    return { projectDir, lock };
  });
}

async function main() {
  try {
    const { values } = parseArgs({
      options: {
        'source-root': { type: 'string', default: defaultSourceRoot },
        'target-dir': { type: 'string' },
        version: { type: 'string' },
        'project-name': { type: 'string' },
        json: { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
      },
    });
    if (values.help) {
      console.log('사용법: node tools/export-project.mjs --target-dir <폴더> --version <버전> --project-name <이름> [--source-root <원본 폴더>] [--json]');
      return;
    }
    const result = await exportProject({
      sourceRoot: values['source-root'],
      targetDir: values['target-dir'],
      projectName: values['project-name'],
      version: values.version,
    });
    console.log(values.json ? JSON.stringify(result) : result.projectDir);
    if (!values.json && result.cleanupWarning) console.error(result.cleanupWarning.message);
  } catch (error) {
    const { code, message, cleanupWarning } = error;
    if (process.argv.includes('--json')) {
      console.error(JSON.stringify({ code, message, cleanupWarning }));
    } else {
      console.error('[' + code + '] ' + message);
      if (cleanupWarning) console.error(cleanupWarning.message);
    }
    process.exitCode = 2;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
