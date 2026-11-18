import { parseArgs } from 'node:util';
import { checkProject } from './check-project.mjs';

try {
  const { values } = parseArgs({
    options: {
      'project-root': { type: 'string', default: process.cwd() },
      change: { type: 'string' },
      json: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help) {
    console.log('사용법  node .foundation/checks/cli.mjs [--project-root <폴더>] [--change <이름>] [--json]');
    console.log('--change를 생략하면 시작 문서를, 지정하면 해당 OpenSpec 변경을 검사합니다.');
  } else {
    const result = await checkProject({ projectRoot: values['project-root'], changeName: values.change });
    if (values.json) {
      console.log(JSON.stringify(result));
    } else if (result.status === 'pass') {
      console.log('필수 문서 항목과 참조의 구조 검사를 통과했습니다.');
    } else {
      for (const { code, path, message } of result.findings) console.log('[' + code + '] ' + path + ' ' + message);
    }
    process.exitCode = result.status === 'pass' ? 0 : 1;
  }
} catch (error) {
  const { code = 'CHECK_ERROR', message } = error;
  console.error(process.argv.includes('--json') ? JSON.stringify({ code, message }) : '[' + code + '] ' + message);
  process.exitCode = 2;
}
