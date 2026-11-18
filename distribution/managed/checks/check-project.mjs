import { lstat, readFile, readdir } from 'node:fs/promises';
import { join, posix, resolve } from 'node:path';
import { fileLinkDestinations, hasContent, readMarkdown, sectionLines } from './markdown.mjs';

export const proposalHeadings = [
  ['Why', '목적'],
  ['What Changes', '포함 범위'],
  ['Capabilities', '기능'],
  ['Impact', '영향'],
  ['Out of Scope', '제외 범위'],
  ['Actors and Permissions', '행위자와 권한'],
  ['Open Questions', '미정 사항'],
];

const starterHeadings = {
  'README.md': [],
  'AGENTS.md': [],
  'CONTRIBUTING.md': [],
  'docs/README.md': [],
  'docs/project/profile.md': ['기술 선택', '코드 규칙', '검토 방식', '실행·테스트·배포 명령', '미정 사항'],
  'docs/product/brief.md': ['문제', '대상 사용자', '목표', '성공 기준', '포함 범위', '제외 범위', '미정 사항'],
  'docs/domain/glossary.md': ['용어'],
};

const acId = /^AC-[0-9]{3}$/u;

function errorWithCode(code, message) {
  return Object.assign(new Error(message), { code });
}

async function statIfPresent(path) {
  try {
    return await lstat(path);
  } catch (error) {
    if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error;
    return undefined;
  }
}

async function projectEntry(root, relativePath) {
  // 이미 프로젝트 안으로 정규화한 경로만 받는다. 중간 링크도 따라가지 않는다.
  let absolute = root;
  let stat;
  for (const part of relativePath === '.' ? [] : relativePath.split('/')) {
    absolute = join(absolute, part);
    stat = await statIfPresent(absolute);
    if (!stat || stat.isSymbolicLink()) break;
  }
  return { absolute, stat };
}

async function readText(root, path, report, required = true) {
  const { absolute, stat } = await projectEntry(root, path);
  if (stat?.isSymbolicLink()) {
    report('UNSAFE_PATH', path, '심볼릭 링크는 검사 대상으로 읽을 수 없습니다.');
  } else if (stat?.isFile()) {
    return readFile(absolute, 'utf8');
  } else if (required || stat) {
    report('MISSING_FILE', path, '일반 파일이 필요합니다.');
  }
  return undefined;
}

function isAbsoluteFilePath(path) {
  return path.startsWith('/') || path.startsWith('\\') || /^[a-z]:/iu.test(path);
}

function linkPath(source, destination) {
  if (destination.startsWith('//') || /^(?![a-z]:)[a-z][a-z0-9+.-]*:/iu.test(destination)) return {};
  const file = destination.split(/[?#]/u, 1)[0];
  if (!file) return {};
  let decoded;
  try {
    decoded = decodeURIComponent(file);
  } catch (error) {
    if (!(error instanceof URIError)) throw error;
    return { code: 'INVALID_LINK_TARGET' };
  }
  if (isAbsoluteFilePath(decoded)) return { code: 'EXTERNAL_LINK' };
  const unsafePart = decoded.split('/').some((part) => part !== '.' && part !== '..'
    && (/[<>:"\\|?*\x00-\x1f]|[. ]$/u.test(part)
      || /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/iu.test(part)));
  if (unsafePart) return { code: 'INVALID_LINK_TARGET' };
  const path = posix.join(posix.dirname(source), decoded);
  if (path === '..' || path.startsWith('../')) return { code: 'EXTERNAL_LINK' };
  return { path };
}

const linkMessages = {
  INVALID_LINK_TARGET: '지원하지 않는 파일 링크 경로입니다. ',
  EXTERNAL_LINK: '프로젝트 밖의 경로이거나 심볼릭 링크를 거치는 외부 의존 참조입니다. ',
  MISSING_LINK_TARGET: '프로젝트 안에서 링크 대상을 찾을 수 없습니다. ',
};

async function checkLinks(root, source, markdown, report) {
  for (const destination of fileLinkDestinations(markdown.text)) {
    const { path, code } = linkPath(source, destination);
    if (code) {
      report(code, source, linkMessages[code] + destination);
    } else if (path && path !== '.') {
      const { stat } = await projectEntry(root, path);
      if (stat?.isSymbolicLink()) {
        report('EXTERNAL_LINK', source, linkMessages.EXTERNAL_LINK + destination);
      } else if (!stat?.isFile() && !stat?.isDirectory()) {
        report('MISSING_LINK_TARGET', source, linkMessages.MISSING_LINK_TARGET + path);
      }
    }
  }
}

async function readDocument(root, path, report) {
  const content = await readText(root, path, report);
  if (content === undefined) return undefined;
  const markdown = readMarkdown(content);
  await checkLinks(root, path, markdown, report);
  return markdown;
}

function checkSections(path, markdown, required, report) {
  for (const aliases of required) {
    const headings = markdown.headings.filter(({ level, title }) => level === 2 && aliases.includes(title));
    if (!headings.length) {
      report('MISSING_SECTION', path, '필수 항목이 없습니다. ' + aliases.join(' / '));
    } else if (!headings.some((heading) => hasContent(sectionLines(markdown, heading)))) {
      report('EMPTY_SECTION', path, '필수 항목의 내용이 비어 있습니다. ' + aliases.join(' / '));
    }
  }
}

async function checkStarter(root, report) {
  for (const [path, headings] of Object.entries(starterHeadings)) {
    const markdown = await readDocument(root, path, report);
    if (!markdown) continue;
    if (headings.length) {
      checkSections(path, markdown, headings.map((heading) => [heading]), report);
    } else if (!hasContent(markdown.lines)) {
      report('EMPTY_FILE', path, '문서 본문이 비어 있습니다.');
    }
  }
}

async function specFiles(root, specsDir, report) {
  const directory = await projectEntry(root, specsDir);
  if (directory.stat?.isSymbolicLink()) {
    report('UNSAFE_PATH', specsDir, '심볼릭 링크는 검사 대상으로 읽을 수 없습니다.');
  }
  if (!directory.stat?.isDirectory()) return [];
  const capabilities = (await readdir(directory.absolute, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
    .map((entry) => entry.name).sort();
  const files = [];
  for (const name of capabilities) {
    if (/[\\:]/u.test(name)) continue;
    const path = specsDir + '/' + name + '/spec.md';
    const { stat } = await projectEntry(root, path);
    if (stat) files.push(path);
  }
  return files;
}

async function canSkipSpecs(root, dir, report) {
  const config = await readText(root, dir + '/.openspec.yaml', report, false);
  // 루트에 있는 단일 리터럴 키만 읽는다. YAML의 나머지는 OpenSpec이 관리한다.
  const entries = config?.replace(/^\uFEFF/u, '').match(/^skip_specs[ \t]*:[^\r\n]*/gmu) ?? [];
  return entries.length === 1 && /^skip_specs[ \t]*:[ \t]+true(?:[ \t]+#.*)?[ \t]*$/u.test(entries[0]);
}

function checkScenarios(path, markdown, scenarios, report) {
  const headings = markdown.headings.filter(({ level, title }) => level === 4 && /^Scenario:\s*/u.test(title));
  if (!headings.length) report('MISSING_SCENARIO', path, 'OpenSpec Scenario 항목이 필요합니다.');
  for (const heading of headings) {
    const match = heading.title.match(/^Scenario:\s+\[(AC-[0-9]{3})\]\s+\S/u);
    const location = (heading.index + 1) + '행';
    if (!match) {
      report('MISSING_SCENARIO_AC', path, location + '의 시나리오 제목에 [AC-001] 형식의 ID와 이름이 필요합니다.');
    } else if (scenarios.has(match[1])) {
      report('DUPLICATE_AC', path, location + '의 ' + match[1] + '이 이미 사용됐습니다. ' + scenarios.get(match[1]));
    } else {
      scenarios.set(match[1], path);
    }
    const body = sectionLines(markdown, heading);
    const when = body.some((line) => /^\s*[-+*]\s+\*\*WHEN\*\*\s+\S/u.test(line));
    const then = body.some((line) => /^\s*[-+*]\s+\*\*THEN\*\*\s+\S/u.test(line));
    if (!when || !then) report('INCOMPLETE_SCENARIO', path, location + '의 시나리오에 WHEN 조건과 THEN 결과가 필요합니다.');
  }
}

function checkTasks(path, markdown, scenarios, report) {
  const referenced = new Set();
  let taskCount = 0;
  for (const [index, line] of markdown.lines.entries()) {
    const task = line.match(/^\s*[-*+]\s+\[[ xX]\](?:\s+|$)(.*)$/u);
    if (!task) continue;
    taskCount++;
    const location = (index + 1) + '행';
    const markers = [...task[1].matchAll(/\(AC:\s*([^)]*)\)/gu)];
    if (!markers.length && !/\(SETUP:\s*[^)\s][^)]*\)/u.test(task[1])) {
      report('MISSING_TASK_AC', path, location + '의 작업에 (AC: AC-001) 또는 (SETUP: 사유)가 필요합니다.');
    }
    for (const [ , values] of markers) {
      const ids = values.split(',').map((id) => id.trim());
      if (!ids.every((id) => acId.test(id))) {
        report('INVALID_TASK_AC', path, location + '의 AC 표기에 AC-001 형식의 ID가 필요합니다.');
        continue;
      }
      for (const id of ids) {
        if (scenarios.has(id)) referenced.add(id);
        else report('UNKNOWN_TASK_AC', path, location + '의 ' + id + ' 시나리오를 이 변경에서 찾을 수 없습니다.');
      }
    }
  }
  if (!taskCount) report('MISSING_TASK', path, 'OpenSpec 작업 체크박스가 필요합니다.');
  for (const [id, spec] of scenarios) {
    if (!referenced.has(id)) report('UNTRACED_AC', spec, id + '을 연결한 작업이 없습니다.');
  }
}

async function checkChange(root, changeName, report) {
  const dir = 'openspec/changes/' + changeName;
  const proposal = dir + '/proposal.md';
  const tasks = dir + '/tasks.md';
  const specs = dir + '/specs';
  const paths = await specFiles(root, specs, report);
  const skipSpecs = !paths.length && await canSkipSpecs(root, dir, report);
  const plan = await readDocument(root, proposal, report);
  if (plan) {
    const required = skipSpecs ? proposalHeadings.filter(([native]) => native !== 'Capabilities') : proposalHeadings;
    checkSections(proposal, plan, required, report);
  }
  if (!paths.length && !skipSpecs) report('MISSING_SPECS', specs, 'specs/<기능>/spec.md 파일이 필요합니다.');
  const scenarios = new Map();
  for (const path of paths) {
    const spec = await readDocument(root, path, report);
    if (spec) checkScenarios(path, spec, scenarios, report);
  }
  const work = await readDocument(root, tasks, report);
  if (work) checkTasks(tasks, work, scenarios, report);
}

export async function checkProject(options) {
  const { projectRoot, changeName } = options ?? {};
  if (typeof projectRoot !== 'string' || !projectRoot.trim() || projectRoot.includes('\0')) {
    throw errorWithCode('INVALID_PROJECT_ROOT', '프로젝트 루트 경로를 입력하세요.');
  }
  if (changeName !== undefined && (typeof changeName !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(changeName)
      || changeName === 'archive' || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/u.test(changeName))) {
    throw errorWithCode('INVALID_CHANGE_NAME', '보관 폴더를 제외한 OpenSpec 변경 이름을 입력하세요. 예: reserve-product');
  }
  const root = resolve(projectRoot);
  if (!(await statIfPresent(root))?.isDirectory()) {
    throw errorWithCode('INVALID_PROJECT_ROOT', '프로젝트 루트는 일반 폴더여야 합니다. ' + root);
  }
  const findings = [];
  const report = (code, path, message) => findings.push({ code, path, message });
  if (changeName === undefined) await checkStarter(root, report);
  else await checkChange(root, changeName, report);
  return { status: findings.length ? 'fail' : 'pass', findings };
}
