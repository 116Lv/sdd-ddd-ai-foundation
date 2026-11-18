const codeMarker = '\uFFFC';

function withoutFences(source) {
  let fence;
  return source.replace(/^\uFEFF/u, '').split(/\r?\n/u).map((line) => {
    const match = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/u);
    if (fence) {
      if (match && match[1][0] === fence[0] && match[1].length >= fence.length && !match[2].trim()) {
        fence = undefined;
      }
      return '';
    }
    if (match && (match[1][0] === '~' || !match[2].includes('`'))) {
      fence = match[1];
      return '';
    }
    return line;
  }).join('\n');
}

function isEscaped(source, index) {
  let slashes = 0;
  while (index > 0 && source[--index] === '\\') slashes++;
  return slashes % 2 === 1;
}

function withoutCodeSpans(source) {
  // 코드 span은 같은 길이의 백틱으로 끝나며 문단 경계를 넘지 않는다.
  return source.split(/(\n[ \t]*\n)/u).map((block) => {
    const runs = [...block.matchAll(/`+/gu)];
    let result = '';
    let start = 0;
    for (let index = 0; index < runs.length; index++) {
      const opener = runs[index];
      if (isEscaped(block, opener.index)) continue;
      let end = index + 1;
      while (end < runs.length && runs[end][0].length !== opener[0].length) end++;
      if (end === runs.length) continue;
      const closer = runs[end];
      const after = closer.index + closer[0].length;
      result += block.slice(start, opener.index) + block.slice(opener.index, after).replace(/[^\n]+/gu, codeMarker);
      start = after;
      index = end;
    }
    return result + block.slice(start);
  }).join('');
}

export function readMarkdown(source) {
  const text = withoutCodeSpans(withoutFences(source))
    .replace(/<!--[\s\S]*?(?:-->|$)/gu, (comment) => comment.replace(/[^\n]/gu, ' '));
  const lines = text.split('\n');
  const headings = lines.flatMap((line, index) => {
    const match = line.match(/^ {0,3}(#{1,6})[ \t]+(.*)$/u);
    if (!match) return [];
    const title = match[2].replace(/[ \t]+#+[ \t]*$/u, '').trim();
    return [{ level: match[1].length, title, index }];
  });
  return { lines, headings, text };
}

export function sectionLines(markdown, heading) {
  const next = markdown.headings.find(({ index, level }) => index > heading.index && level <= heading.level);
  return markdown.lines.slice(heading.index + 1, next?.index);
}

export function hasContent(lines) {
  // 제목, 빈 목록 항목과 표 구분선만으로는 항목이 채워지지 않는다.
  return lines.some((line) => !/^\s*#{1,6}(?:\s|$)/u.test(line)
    && /[\p{L}\p{N}\p{So}]/u.test(line.replace(/^\s*[-+*]\s+(?:\[[ xX]\]\s*)?/u, '')));
}

export function fileLinkDestinations(text) {
  // 한 줄의 일반 inline 링크만 읽는다. 이미지와 reference-style 링크는 제외한다.
  const links = /\[[^\[\]\n]*\]\([ \t]*(?:<([^<>\n]+)>|([^\s()<>]+))(?:[ \t]+(?:"[^"\n]*"|'[^'\n]*'|\([^()\n]*\)))?[ \t]*\)/gu;
  return [...text.matchAll(links)].flatMap((match) => {
    const [ , angle, bare] = match;
    const destination = angle ?? bare;
    if (isEscaped(text, match.index) || text[match.index - 1] === '!' || destination.includes(codeMarker)) return [];
    return [destination];
  });
}
