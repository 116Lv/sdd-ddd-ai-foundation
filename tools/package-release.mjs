import { link, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { Zip, ZipDeflate } from 'fflate';
import { sha256 } from './lib/lock.mjs';
import { absolutePath, codedError, inspectPath, pathParts, statWithoutSymlink, withStagingDirectory } from './lib/paths.mjs';

async function collectFiles(projectDir, directory = '') {
  const localDir = join(projectDir, directory);
  const files = [];
  for (const name of (await readdir(localDir)).sort()) {
    const entry = directory ? directory + '/' + name : name;
    pathParts(entry);
    const path = join(localDir, name);
    const stat = await statWithoutSymlink(path);
    if (stat.isDirectory()) {
      files.push(...await collectFiles(projectDir, entry));
    } else if (stat.isFile()) {
      files.push({ entry, bytes: await readFile(path) });
    } else {
      throw codedError('INVALID_PATH', 'ZIP에는 일반 파일과 폴더만 넣을 수 있습니다. ' + path);
    }
  }
  return files;
}

function buildZip(files) {
  const chunks = [];
  try {
    const zip = new Zip((error, data) => {
      if (error) throw error;
      chunks.push(data);
    });
    for (const { entry, bytes } of files) {
      // ZIP의 DOS 시각은 로컬 시간으로 기록되므로 고정된 로컬 날짜를 사용한다.
      const file = new ZipDeflate(entry);
      file.mtime = new Date(2000, 0, 1);
      zip.add(file);
      file.push(bytes, true);
    }
    zip.end();
  } catch (error) {
    throw codedError('ZIP_FAILED', 'ZIP을 만들 수 없습니다.', error);
  }
  return Buffer.concat(chunks);
}

export async function packageRelease(options) {
  const { projectDir, zipPath } = options ?? {};
  const project = absolutePath(projectDir, '프로젝트');
  const output = absolutePath(zipPath, 'ZIP');
  if (!(await inspectPath(project)).isDirectory()) {
    throw codedError('INVALID_PATH', '프로젝트 경로는 폴더여야 합니다. ' + project);
  }
  if (await inspectPath(output, { allowMissing: true })) {
    throw codedError('ZIP_EXISTS', 'ZIP 대상 경로가 이미 있습니다. ' + output);
  }
  const files = await collectFiles(project);
  const bytes = buildZip(files);

  await withStagingDirectory(dirname(output), async (stage) => {
    const stagedZip = join(stage, 'release.zip');
    await writeFile(stagedZip, bytes, { flag: 'wx' });
    try {
      // 링크 생성은 기존 경로를 덮어쓰지 않고 완성된 파일만 공개한다.
      await link(stagedZip, output);
    } catch (error) {
      if (error.code === 'EEXIST') {
        throw codedError('ZIP_EXISTS', 'ZIP 대상 경로가 이미 있습니다. ' + output, error);
      }
      throw error;
    }
  });

  return { zipPath: output, sha256: sha256(bytes), fileCount: files.length };
}

async function main() {
  try {
    const { values } = parseArgs({
      options: {
        'project-dir': { type: 'string' },
        'zip-path': { type: 'string' },
        json: { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
      },
    });
    if (values.help) {
      console.log('사용법: node tools/package-release.mjs --project-dir <폴더> --zip-path <파일> [--json]');
      return;
    }
    const result = await packageRelease({
      projectDir: values['project-dir'],
      zipPath: values['zip-path'],
    });
    console.log(values.json ? JSON.stringify(result) : result.zipPath);
  } catch (error) {
    const { code, message } = error;
    console.error(process.argv.includes('--json') ? JSON.stringify({ code, message }) : '[' + code + '] ' + message);
    process.exitCode = 2;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
