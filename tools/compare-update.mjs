import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runUpdateCli } from './lib/update-cli.mjs';
import { hasMatchingFileAncestor, matchesCandidatePath, matchesHash, readUpdate, updateRoots } from './lib/update-state.mjs';

export async function compareUpdate(options) {
  const { current, candidate, actual, connections } = await readUpdate(await updateRoots(options));
  const added = [];
  const changed = [];
  const removed = [];
  const conflicts = [...connections.conflicts];

  for (const [path, state] of actual) {
    const before = current.managed.get(path);
    const after = candidate.managed.get(path);
    if (before === undefined) added.push(path);
    else if (after === undefined) removed.push(path);
    else if (before !== after) changed.push(path);

    const plannedLayoutChange = before === undefined && state.kind === 'blocked-ancestor'
      && hasMatchingFileAncestor(path, actual, current.managed);
    if (matchesHash(state, before) || plannedLayoutChange) continue;

    let reason;
    if (state.kind !== 'missing' && state.kind !== 'file') reason = 'local-path';
    else if (before === undefined) reason = 'untracked-path';
    else reason = state.kind === 'missing' ? 'local-delete' : 'local-edit';
    conflicts.push({ path, reason, matchesCandidate: matchesCandidatePath(path, actual, candidate) });
  }
  conflicts.sort((left, right) => left.path < right.path ? -1 : Number(left.path > right.path));

  return {
    fromVersion: current.lock.foundationVersion,
    toVersion: candidate.lock.foundationVersion,
    added,
    changed,
    removed,
    conflicts,
    connectionRefresh: connections.refresh,
    manualActions: [
      '충돌을 검토하고 관리 파일의 추가·변경·제거를 수동으로 적용하세요.',
      '기록된 AI 도구 연결을 확인하고 이전 연결 해시를 사용해 연결을 갱신하세요.',
      '검증 결과를 기록하고 신규 관리 경로마다 --acknowledge-new-path를 지정해 record-baseline을 실행하세요.',
    ],
  };
}

function printReport(report) {
  console.log('기반 버전 ' + report.fromVersion + ' → ' + report.toVersion);
  for (const [label, paths] of [['추가', report.added], ['변경', report.changed], ['제거', report.removed]]) {
    for (const path of paths) console.log(label + ' ' + path);
  }
  for (const { path, reason, matchesCandidate } of report.conflicts) {
    console.log('충돌 ' + path + ' (' + reason + (matchesCandidate ? ', 후보와 일치' : '') + ')');
  }
  for (const { path, reason } of report.connectionRefresh) console.log('연결 확인 ' + path + ' (' + reason + ')');
  for (const action of report.manualActions) console.log(action);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runUpdateCli('compare-update', compareUpdate, printReport);
}
