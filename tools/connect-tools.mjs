import { link, mkdir, readFile, rename, rmdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { lockName, sha256 } from './lib/lock.mjs';
import { absolutePath, codedError, inspectPath, pathParts, withStagingDirectory } from './lib/paths.mjs';

const adapterPath = '.foundation/integrations/tools.json';
const importTemplate = '.foundation/integrations/claude/CLAUDE.md.template';
const guardName = '.foundation-connect-lock';
const supportedTools = ['claude', 'codex', 'cursor'];
const conflictCodes = ['CONNECTION_CONFLICT', 'CONNECTION_BUSY', 'SYMLINK_PATH'];

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readRegularFile(path, code, allowMissing = false) {
  const stat = await inspectPath(path, { allowMissing, ancestorCode: code });
  if (!stat) return undefined;
  if (!stat.isFile()) throw codedError(code, '일반 파일이어야 합니다. ' + path);
  return readFile(path);
}

async function parseJsonFile(path, code) {
  const bytes = await readRegularFile(path, code, true);
  if (!bytes) throw codedError(code, '필수 파일이 없습니다. ' + path);
  try {
    return { bytes, data: JSON.parse(bytes) };
  } catch (error) {
    throw codedError(code, 'JSON을 읽을 수 없습니다. ' + path, error);
  }
}

async function readAdapter(projectDir) {
  const { data } = await parseJsonFile(join(projectDir, adapterPath), 'INVALID_ADAPTER');
  if (!isRecord(data) || !Array.isArray(data.skills) || !data.skills.length
      || !data.skills.every((name) => typeof name === 'string' && /^foundation-[a-z0-9-]+$/u.test(name))
      || !isRecord(data.tools) || !supportedTools.every((name) => isRecord(data.tools[name]))) {
    throw codedError('INVALID_ADAPTER', '도구 연결 목록의 형식이 올바르지 않습니다. ' + adapterPath);
  }
  for (const name of supportedTools) {
    const { skillDirectory, entryTemplate } = data.tools[name];
    if (!['.agents/skills', '.claude/skills'].includes(skillDirectory)
        || (entryTemplate !== undefined && entryTemplate !== importTemplate)) {
      throw codedError('INVALID_ADAPTER', '지정한 도구 연결 경로를 사용할 수 없습니다. ' + name);
    }
  }
  return data;
}

function connectionTargets(adapter, requestedTools) {
  const targets = new Map();
  for (const name of requestedTools) {
    const { skillDirectory, entryTemplate } = adapter.tools[name];
    for (const skill of adapter.skills) {
      targets.set(
        skillDirectory + '/' + skill + '/SKILL.md',
        '.foundation/skills/' + skill + '/SKILL.md.template',
      );
    }
    if (entryTemplate) targets.set('CLAUDE.md', entryTemplate);
  }
  return targets;
}

async function planConnection(projectDir, requestedTools) {
  const adapter = await readAdapter(projectDir);
  const lockPath = join(projectDir, lockName);
  const { bytes: lockBytes, data: lock } = await parseJsonFile(lockPath, 'INVALID_LOCK');
  if (!isRecord(lock) || lock.schemaVersion !== 1 || !isRecord(lock.managedFiles)
      || !isRecord(lock.connections) || !Array.isArray(lock.connections.tools)
      || !lock.connections.tools.every((name) => supportedTools.includes(name)) || !isRecord(lock.connections.files)) {
    throw codedError('INVALID_LOCK', '연결을 기록할 기준 파일의 형식이 올바르지 않습니다. ' + lockName);
  }
  if (!(await inspectPath(join(projectDir, 'AGENTS.md'))).isFile()) {
    throw codedError('INVALID_PATH', 'AGENTS.md는 일반 파일이어야 합니다.');
  }

  const targets = connectionTargets(adapter, requestedTools);
  const templates = new Map();
  const files = { ...lock.connections.files };
  const created = [];
  const unchanged = [];
  const writes = [];
  for (const target of [...targets.keys()].sort()) {
    const source = targets.get(target);
    const path = join(projectDir, ...pathParts(target));
    const before = await readRegularFile(path, 'CONNECTION_CONFLICT', true);
    const previous = files[target];
    if (before && (previous?.source !== source || previous.sha256 !== sha256(before))) {
      throw codedError('CONNECTION_CONFLICT', '기존 파일을 보존했습니다. 연결 내용을 직접 확인하세요. ' + target);
    }

    // 스킬의 참조 경로는 프로젝트 루트 기준이므로 복사 위치에서도 같은 원본을 가리킨다.
    if (!templates.has(source)) {
      const bytes = await readRegularFile(join(projectDir, ...pathParts(source)), 'INVALID_PATH');
      templates.set(source, { bytes, sha256: sha256(bytes) });
    }
    const { bytes, sha256: hash } = templates.get(source);
    files[target] = { source, sha256: hash };
    if (before?.equals(bytes)) {
      unchanged.push(target);
    } else {
      writes.push({ path, before, bytes });
      created.push(target);
    }
  }
  const tools = [...new Set([...lock.connections.tools, ...requestedTools])].sort();
  const connections = { tools, files: Object.fromEntries(Object.keys(files).sort().map((path) => [path, files[path]])) };
  if (writes.length || tools.some((name) => !lock.connections.tools.includes(name))) {
    const bytes = Buffer.from(JSON.stringify({ ...lock, connections }, null, 2) + '\n');
    writes.push({ path: lockPath, before: lockBytes, bytes });
  }
  return { result: { created, unchanged, connections }, writes };
}

async function ensureDirectory(path, createdDirectories) {
  const stat = await inspectPath(path, { allowMissing: true, ancestorCode: 'CONNECTION_CONFLICT' });
  if (stat?.isDirectory()) return;
  if (stat) throw codedError('CONNECTION_CONFLICT', '상위 경로는 폴더여야 합니다. ' + path);
  await ensureDirectory(dirname(path), createdDirectories);
  try {
    await mkdir(path);
    createdDirectories.push(path);
  } catch (error) {
    if (error.code !== 'EEXIST' || !(await inspectPath(path, { ancestorCode: 'CONNECTION_CONFLICT' })).isDirectory()) {
      throw error;
    }
  }
}

async function assertFileState(path, expected, target = path) {
  const current = await readRegularFile(path, 'CONNECTION_CONFLICT', true);
  if (expected ? !current?.equals(expected) : current !== undefined) {
    throw codedError('CONNECTION_CONFLICT', '연결 도중 파일이 변경되었습니다. ' + target);
  }
}

async function restoreFile(staged, path) {
  if (!(await inspectPath(staged)).isFile()) {
    throw codedError('CONNECTION_CONFLICT', '복원 대상은 일반 파일이어야 합니다. ' + staged);
  }
  if (!(await inspectPath(dirname(path), { ancestorCode: 'CONNECTION_CONFLICT' })).isDirectory()) {
    throw codedError('CONNECTION_CONFLICT', '상위 경로는 폴더여야 합니다. ' + dirname(path));
  }
  await link(staged, path);
}

async function rollBack(changes, createdDirectories) {
  const failures = [];
  for (const { path, bytes, staged, backup, published } of changes.reverse()) {
    let displaced;
    try {
      if (published) {
        await assertFileState(path, bytes);
        const aside = staged + '-rollback';
        await rename(path, aside);
        displaced = aside;
        try {
          await assertFileState(displaced, bytes, path);
        } catch (error) {
          // 복구 직전의 편집은 보존한다. 대상이 다시 생겼으면 두 파일을 모두 보관한다.
          await restoreFile(displaced, path);
          throw error;
        }
      }
      if (backup) await restoreFile(backup, path);
    } catch (error) {
      failures.push({ path, backup, displaced, code: error.code, message: error.message });
    }
  }
  for (const path of createdDirectories.reverse()) {
    try {
      await rmdir(path);
    } catch (error) {
      if (!['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes(error.code)) {
        failures.push({ path, code: error.code, message: error.message });
      }
    }
  }
  return failures;
}

async function publishConnection(projectDir, { result, writes }) {
  return withStagingDirectory(projectDir, async (stage) => {
    for (const [index, file] of writes.entries()) {
      file.staged = join(stage, 'new-' + index);
      await writeFile(file.staged, file.bytes, { flag: 'wx' });
    }
    const changes = [];
    const createdDirectories = [];
    try {
      for (const [index, file] of writes.entries()) {
        const { path, before, staged } = file;
        await assertFileState(path, before);
        if (before) {
          const backup = join(stage, 'old-' + index);
          // 실제로 옮겨낸 파일을 검사한 뒤 빈 경로에만 게시한다.
          await rename(path, backup);
          file.backup = backup;
          changes.push(file);
          await assertFileState(backup, before, path);
        } else {
          await ensureDirectory(dirname(path), createdDirectories);
        }
        await link(staged, path);
        file.published = true;
        if (!before) changes.push(file);
      }
    } catch (error) {
      const files = await rollBack(changes, createdDirectories);
      if (files.length) {
        const conflictsOnly = [error, ...files].every(({ code }) => code === 'EEXIST' || conflictCodes.includes(code));
        const code = conflictsOnly ? 'CONNECTION_CONFLICT' : 'ROLLBACK_FAILED';
        const message = error.message + '\n자동 복구가 끝나지 않았습니다. 보관 폴더 ' + stage;
        throw Object.assign(codedError(code, message, error), { recovery: { directory: stage, files } });
      }
      if (error.code === 'EEXIST') {
        throw codedError('CONNECTION_CONFLICT', '연결 도중 대상 경로가 생성되었습니다. ' + error.path, error);
      }
      throw error;
    }
    return result;
  }, { preserveOnError: (error) => error.recovery !== undefined });
}

async function removeGuard(path) {
  try {
    await rmdir(path);
  } catch (error) {
    return { code: error.code, path, message: '연결 잠금을 정리할 수 없습니다. ' + path };
  }
}

async function withConnectionGuard(path, action) {
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

export async function connectTools(options) {
  const { projectRoot, tools } = options ?? {};
  const projectDir = absolutePath(projectRoot, '프로젝트');
  if (!Array.isArray(tools) || !tools.length) {
    throw codedError('INVALID_INPUT', '연결할 도구를 하나 이상 입력하세요.');
  }
  for (const name of tools) {
    if (!supportedTools.includes(name)) {
      throw codedError('UNSUPPORTED_TOOL', '지원 목록에 없는 도구입니다. ' + String(name));
    }
  }
  const requestedTools = [...new Set(tools)];
  const guardPath = join(projectDir, guardName);
  if (await inspectPath(guardPath, { allowMissing: true })) {
    throw codedError('CONNECTION_BUSY', '다른 연결 작업이 사용 중입니다. ' + guardPath);
  }
  const preflight = await planConnection(projectDir, requestedTools);
  if (!preflight.writes.length) return preflight.result;

  return withConnectionGuard(guardPath, async () => {
    // 사전 검사 이후 다른 연결이 끝났을 수 있으므로 잠금 아래에서 최신 기준을 읽는다.
    const plan = await planConnection(projectDir, requestedTools);
    if (!plan.writes.length) return plan.result;
    return publishConnection(projectDir, plan);
  });
}

async function main() {
  try {
    const { values } = parseArgs({
      options: {
        'project-root': { type: 'string', default: process.cwd() },
        tool: { type: 'string', multiple: true },
        json: { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
      },
    });
    if (values.help) {
      console.log('사용법  node .foundation/tools/connect-tools.mjs --tool <codex|claude|cursor> [--tool <도구>] [--project-root <폴더>] [--json]');
      return;
    }
    const result = await connectTools({ projectRoot: values['project-root'], tools: values.tool });
    if (values.json) {
      console.log(JSON.stringify(result));
    } else {
      console.log('연결 도구 ' + result.connections.tools.join(', '));
      console.log('생성·갱신 ' + result.created.length + '개, 유지 ' + result.unchanged.length + '개');
      for (const warning of [result.cleanupWarning, result.guardWarning]) {
        if (warning) console.error(warning.message);
      }
    }
  } catch (error) {
    const { code = 'CONNECTION_ERROR', message, cleanupWarning, guardWarning, recovery } = error;
    if (process.argv.includes('--json')) {
      console.error(JSON.stringify({ code, message, cleanupWarning, guardWarning, recovery }));
    } else {
      console.error('[' + code + '] ' + message);
      for (const file of recovery?.files ?? []) {
        console.error('[' + file.code + '] ' + file.path + ' ' + file.message);
        if (file.backup) console.error('이전 파일 ' + file.backup);
        if (file.displaced) console.error('복구 중 옮긴 파일 ' + file.displaced);
      }
      for (const warning of [cleanupWarning, guardWarning]) {
        if (warning) console.error(warning.message);
      }
    }
    process.exitCode = conflictCodes.includes(code) ? 1 : 2;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
