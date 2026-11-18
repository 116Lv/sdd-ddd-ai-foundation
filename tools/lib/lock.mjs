import { createHash } from 'node:crypto';

export const lockName = 'foundation.lock.json';

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
