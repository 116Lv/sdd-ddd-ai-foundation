import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { adapterPath, connectionTargets, isConnectionTarget, isRecord, supportedTools, validateAdapter } from './connection-config.mjs';
import { lockName, sha256 } from './lock.mjs';
import { absolutePath, codedError, inspectPath, pathParts } from './paths.mjs';

const versionPattern = /[^\s]/u;
const hashPattern = /^[a-f0-9]{64}$/u;

export async function updateRoots(options) {
  const projectDir = absolutePath(options?.projectRoot, '프로젝트');
  const candidateDir = absolutePath(options?.candidateRoot, '후보 버전');
  for (const root of [projectDir, candidateDir]) {
    if (!(await inspectPath(root, { allowMissing: true }))?.isDirectory()) {
      throw codedError('INVALID_PATH', '폴더를 찾을 수 없습니다. ' + root);
    }
  }
  if (projectDir === candidateDir || (process.platform === 'win32' && projectDir.toLowerCase() === candidateDir.toLowerCase())) {
    throw codedError('INVALID_INPUT', '프로젝트와 후보 버전은 서로 다른 폴더에 두세요.');
  }
  return { projectDir, candidateDir };
}

function invalidFile(code, path, cause) {
  return codedError(code, '기준 파일의 경로나 데이터가 올바르지 않습니다. ' + path, cause);
}

function managedPath(path, prefixes, code) {
  let parts;
  try {
    parts = pathParts(path);
  } catch (error) {
    throw invalidFile(code, path, error);
  }
  if (parts.length < 2 || parts[0] !== '.foundation') throw invalidFile(code, path);

  let prefix = '';
  for (const [index, part] of parts.entries()) {
    prefix = prefix ? prefix + '/' + part : part;
    const key = prefix.normalize('NFC').toLowerCase();
    const isFile = index === parts.length - 1;
    const previous = prefixes.get(key);
    if (previous && (previous.isFile || isFile || previous.prefix !== prefix)) throw invalidFile(code, path);
    prefixes.set(key, { prefix, isFile });
  }
}

function validVersion(value) {
  return typeof value === 'string' && versionPattern.test(value) && !/[\x00-\x1f\x7f]/u.test(value);
}

async function readManifest(root, code) {
  const lockPath = join(root, lockName);
  const state = await fileState(lockPath);
  if (state.kind !== 'file') throw invalidFile(code, lockPath);
  let lock;
  try {
    lock = JSON.parse(state.bytes);
  } catch (error) {
    throw invalidFile(code, lockPath, error);
  }
  if (!isRecord(lock) || lock.schemaVersion !== 1 || !validVersion(lock.foundationVersion)
      || !isRecord(lock.managedFiles) || !isRecord(lock.compatibility) || !validVersion(lock.compatibility.openspec)
      || !isRecord(lock.connections) || !isRecord(lock.connections.files) || !Array.isArray(lock.connections.tools)
      || !lock.connections.tools.every((name) => supportedTools.includes(name))
      || new Set(lock.connections.tools).size !== lock.connections.tools.length) {
    throw invalidFile(code, lockPath);
  }

  const prefixes = new Map();
  const managed = new Map();
  for (const path of Object.keys(lock.managedFiles).sort()) {
    managedPath(path, prefixes, code);
    const hash = lock.managedFiles[path];
    if (typeof hash !== 'string' || !hashPattern.test(hash)) throw invalidFile(code, path);
    managed.set(path, hash);
  }
  const { tools, files } = lock.connections;
  if (!tools.length && Object.keys(files).length) throw invalidFile(code, lockPath);
  for (const [path, file] of Object.entries(files)) {
    if (!isRecord(file) || !isConnectionTarget(path, file.source)
        || typeof file.sha256 !== 'string' || !hashPattern.test(file.sha256)) {
      throw invalidFile(code, path);
    }
  }
  return { lock, lockPath, lockBytes: state.bytes, managed, prefixes };
}

async function fileState(path) {
  try {
    const stat = await inspectPath(path, { allowMissing: true, ancestorCode: 'BLOCKED_PATH' });
    if (!stat) return { kind: 'missing' };
    if (stat.isDirectory()) return { kind: 'directory' };
    if (!stat.isFile()) return { kind: 'blocked' };
    const bytes = await readFile(path);
    return { kind: 'file', bytes, hash: sha256(bytes) };
  } catch (error) {
    if (error.code === 'BLOCKED_PATH') return { kind: 'blocked-ancestor' };
    if (error.code === 'SYMLINK_PATH') return { kind: 'blocked' };
    if (error.code === 'ENOENT') return { kind: 'missing' };
    throw error;
  }
}

export function matchesHash(state, hash) {
  return hash === undefined ? state.kind === 'missing' : state.hash === hash;
}

export function hasMatchingFileAncestor(path, actual, managed) {
  let end = path.lastIndexOf('/');
  while (end > 0) {
    const ancestor = path.slice(0, end);
    const hash = managed.get(ancestor);
    if (hash !== undefined) return matchesHash(actual.get(ancestor), hash);
    end = ancestor.lastIndexOf('/');
  }
  return false;
}

export function matchesCandidatePath(path, actual, candidate) {
  const state = actual.get(path);
  if (matchesHash(state, candidate.managed.get(path))) return true;
  if (candidate.managed.has(path)) return false;

  // 제거된 파일의 자리에 새 하위 폴더가 생기거나 상위 경로가 새 관리 파일이 될 수 있다.
  if (state.kind === 'directory') {
    const prefix = candidate.prefixes.get(path.normalize('NFC').toLowerCase());
    return prefix?.prefix === path && !prefix.isFile;
  }
  return state.kind === 'blocked-ancestor' && hasMatchingFileAncestor(path, actual, candidate.managed);
}

async function validateCandidateFiles(root, manifest, tools) {
  let adapterBytes;
  for (const [path, hash] of manifest.managed) {
    const state = await fileState(join(root, path));
    if (!matchesHash(state, hash)) throw invalidFile('INVALID_CANDIDATE', path);
    if (path === adapterPath) adapterBytes = state.bytes;
  }
  if (!tools.length) return new Map();
  if (!adapterBytes) throw invalidFile('INVALID_CANDIDATE', adapterPath);

  let targets;
  try {
    targets = connectionTargets(validateAdapter(JSON.parse(adapterBytes)), tools);
  } catch (error) {
    throw invalidFile('INVALID_CANDIDATE', adapterPath, error);
  }
  for (const source of targets.values()) {
    if (!manifest.managed.has(source)) throw invalidFile('INVALID_CANDIDATE', source);
  }
  return targets;
}

async function inspectConnections(projectDir, files, managed, targets) {
  const refresh = [];
  const conflicts = [];
  for (const path of [...new Set([...Object.keys(files), ...targets.keys()])].sort()) {
    const previous = files[path];
    const source = targets.get(path);
    const hash = managed.get(source);
    const actual = await fileState(join(projectDir, path));
    const matchesCandidate = source !== undefined && matchesHash(actual, hash);
    let reason;

    if (previous && previous.source !== source) reason = 'ownership-changed';
    else if (actual.kind !== 'missing' && actual.kind !== 'file') reason = 'local-path';
    else if (!previous && actual.kind === 'file') reason = 'untracked-path';
    else if (previous && actual.kind === 'missing') reason = 'local-delete';
    else if (previous && !matchesHash(actual, previous.sha256)) reason = 'local-edit';

    if (reason) {
      conflicts.push({ path, reason, matchesCandidate });
      refresh.push({ path, reason });
    } else if (!previous) {
      refresh.push({ path, reason: 'new-target' });
    } else if (previous.sha256 !== hash) {
      refresh.push({ path, reason: 'source-changed' });
    }
  }
  return { refresh, conflicts };
}

export async function readUpdate({ projectDir, candidateDir }) {
  const current = await readManifest(projectDir, 'INVALID_LOCK');
  const candidate = await readManifest(candidateDir, 'INVALID_CANDIDATE');
  const { tools, files } = current.lock.connections;
  const targets = await validateCandidateFiles(candidateDir, candidate, tools);
  const paths = [...new Set([...current.managed.keys(), ...candidate.managed.keys()])].sort();
  const actual = new Map();
  for (const path of paths) {
    const { kind, hash } = await fileState(join(projectDir, path));
    actual.set(path, { kind, hash });
  }
  const connections = await inspectConnections(projectDir, files, candidate.managed, targets);
  return { current, candidate, actual, connections };
}

export async function verifyUnchangedLock(lockPath, expected) {
  const state = await fileState(lockPath);
  if (!state.bytes?.equals(expected)) {
    const error = codedError('BASELINE_CONFLICT', '버전을 기록하는 동안 기준 파일이 변경되었습니다. ' + lockPath);
    error.findings = [{ path: lockName, reason: 'lock-changed' }];
    throw error;
  }
}
