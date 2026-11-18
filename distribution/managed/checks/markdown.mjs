import { lexer } from './vendor/marked.mjs';

function childTokens(token) {
  if (token.type === 'list') return token.items;
  if (token.type === 'table') return [...token.header, ...token.rows.flat()];
  return token.tokens;
}

function visibleText(tokens) {
  return tokens.map((token) => {
    if (token.type === 'codespan') return '\uFFFC';
    if (['code', 'html', 'heading', 'def', 'checkbox'].includes(token.type)) return '';
    const children = childTokens(token);
    return children ? visibleText(children) : token.text ?? '';
  }).join('');
}

export function readMarkdown(source) {
  const blocks = lexer(source.replace(/^\uFEFF/u, ''), { gfm: true });
  const headings = blocks.flatMap((block, index) => block.type === 'heading'
    ? [{ level: block.depth, title: visibleText(block.tokens).trim(), index }]
    : []);
  return { blocks, headings };
}

export function sectionBlocks(markdown, heading) {
  const next = markdown.headings.find(({ index, level }) => index > heading.index && level <= heading.level);
  return markdown.blocks.slice(heading.index + 1, next?.index);
}

export function hasContent(blocks) {
  return /[\p{L}\p{N}\p{So}]/u.test(visibleText(blocks));
}

// 렉서가 판별한 링크 중 지원 범위인 한 줄의 일반 inline 링크를 고른다.
const inlineLink = /^\[(?:\\.|[^\[\]\\\r\n])*\]\([ \t]*(?:<[^<>\r\n]+>|[^\s()<>]+)(?:[ \t]+(?:"[^"\r\n]*"|'[^'\r\n]*'|\([^()\r\n]*\)))?[ \t]*\)$/u;

function* links(tokens) {
  for (const token of tokens) {
    if (token.type === 'link') {
      if (inlineLink.test(token.raw)) yield token.href;
    } else if (token.type !== 'image') {
      yield* links(childTokens(token) ?? []);
    }
  }
}

export function fileLinkDestinations({ blocks }) {
  return links(blocks);
}

function listItemLabel(item) {
  return item.tokens.find(({ type }) => type === 'text' || type === 'paragraph')?.tokens ?? [];
}

export function hasScenarioStep(blocks, step) {
  return blocks.some((block) => block.type === 'list' && !block.ordered && block.items.some((item) => {
    const [label, ...description] = listItemLabel(item);
    return label?.type === 'strong' && label.text === step && visibleText(description).trim().length > 0;
  }));
}

export function* taskLabels(blocks) {
  for (const block of blocks) {
    if (block.type !== 'list' || block.ordered) continue;
    for (const item of block.items) {
      if (item.task) yield visibleText(listItemLabel(item)).split('\n', 1)[0];
      yield* taskLabels(item.tokens);
    }
  }
}
