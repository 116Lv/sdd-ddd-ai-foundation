import { codedError } from './paths.mjs';

export const adapterPath = '.foundation/integrations/tools.json';
const importTemplate = '.foundation/integrations/claude/CLAUDE.md.template';
export const supportedTools = ['claude', 'codex', 'cursor'];

export function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validateAdapter(data) {
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

export function connectionTargets(adapter, requestedTools) {
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

export function isConnectionTarget(path, source) {
  if (path === 'CLAUDE.md') return source === importTemplate;
  const match = /^\.(?:agents|claude)\/skills\/(foundation-[a-z0-9-]+)\/SKILL\.md$/u.exec(path);
  return match !== null && source === '.foundation/skills/' + match[1] + '/SKILL.md.template';
}
