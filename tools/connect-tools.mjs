import { link, mkdir, readFile, rename, rmdir, unlink, writeFile } from 'node:fs/promises';
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
  const stat = await inspectPath(path, { allowMissing });
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
  const stat = await inspectPath(path, { allowMissing: true });
  if (stat?.isDirectory()) return;
  if (stat) throw codedError('CONNECTION_CONFLICT', '상위 경로는 폴더여야 합니다. ' + path);
  await ensureDirectory(dirname(path), createdDirectories);
  try {
    await mkdir(path);
    createdDirectories.push(path);
  } catch (error) {
    if (error.code !== 'EEXIST' || !(await inspectPath(path)).isDirectory()) throw error;
  }
}

async function assertFileState(path, expected) {
  const current = await readRegularFile(path, 'CONNECTION_CONFLICT', true);
  if (expected ? !current?.equals(expected) : current !== undefined) {
    throw codedError('CONNECTION_CONFLICT', '연결 도중 파일이 변경되었습니다. ' + path);
  }
}

async function rollBack(published, createdDirectories) {
  const errors = [];
  for (const { path, bytes, backup } of published.reverse()) {
    try {
      await assertFileState(path, bytes);
      if (backup) await rename(backup, path);
      else await unlink(path);
    } catch (error) {
      errors.push(error);
    }
  }
  for (const path of createdDirectories.reverse()) {
    try {
      await rmdir(path);
    } catch (error) {
      if (!['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes(error.code)) errors.push(error);
    }
  }
  return errors;
}

async function publishConnection(projectDir, { result, writes }) {
  return withStagingDirectory(projectDir, async (stage) => {
    for (const [index, file] of writes.entries()) {
      file.staged = join(stage, 'new-' + index);
      await writeFile(file.staged, file.bytes, { flag: 'wx' });
    }
    const published = [];
    const createdDirectories = [];
    try {
      for (const [index, file] of writes.entries()) {
        const { path, before, staged } = file;
        await assertFileState(path, before);
        if (before) {
          file.backup = join(stage, 'old-' + index);
          await link(path, file.backup);
          await rename(staged, path);
        } else {
          await ensureDirectory(dirname(path), createdDirectories);
          // 같은 볼륨에서 준비한 파일을 게시한다. 대상이 그 사이 생기면 덮어쓰지 않는다.
          await link(staged, path);
        }
        published.push(file);
      }
    } catch (error) {
      const rollbackErrors = await rollBack(published, createdDirectories);
      if (rollbackErrors.length) {
        throw codedError('ROLLBACK_FAILED', error.message + '\n' + rollbackErrors.map(({ message }) => message).join('\n'), error);
      }
      if (error.code === 'EEXIST') {
        throw codedError('CONNECTION_CONFLICT', '연결 도중 대상 경로가 생성되었습니다. ' + error.path, error);
      }
      throw error;
    }
    return result;
  });
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
    const { code = 'CONNECTION_ERROR', message, cleanupWarning, guardWarning } = error;
    if (process.argv.includes('--json')) {
      console.error(JSON.stringify({ code, message, cleanupWarning, guardWarning }));
    } else {
      console.error('[' + code + '] ' + message);
      for (const warning of [cleanupWarning, guardWarning]) {
        if (warning) console.error(warning.message);
      }
    }
    process.exitCode = conflictCodes.includes(code) ? 1 : 2;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
