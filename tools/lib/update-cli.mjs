import { parseArgs } from 'node:util';

export async function runUpdateCli(command, execute, print) {
  const recordsBaseline = command === 'record-baseline';
  const acknowledgementOption = recordsBaseline ? { 'acknowledge-new-path': { type: 'string', multiple: true } } : {};
  try {
    const { values } = parseArgs({
      options: {
        ...acknowledgementOption,
        'project-root': { type: 'string', default: process.cwd() },
        'candidate-root': { type: 'string' },
        json: { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
      },
    });
    if (values.help) {
      const acknowledgementHelp = recordsBaseline ? ' [--acknowledge-new-path <신규 관리 경로>]...' : '';
      console.log('사용법  node .foundation/tools/' + command + '.mjs --candidate-root <후보 폴더> [--project-root <프로젝트 폴더>] [--json]' + acknowledgementHelp);
      return;
    }
    const result = await execute({
      projectRoot: values['project-root'],
      candidateRoot: values['candidate-root'],
      acknowledgeNewPaths: values['acknowledge-new-path'],
    });
    if (values.json) {
      console.log(JSON.stringify(result));
    } else {
      print(result);
      for (const warning of [result.cleanupWarning, result.guardWarning]) {
        if (warning) console.error(warning.message);
      }
    }
    if (result.conflicts?.length) process.exitCode = 1;
  } catch (error) {
    const { code = 'UPDATE_ERROR', message, findings, cleanupWarning, guardWarning } = error;
    if (process.argv.includes('--json')) {
      console.error(JSON.stringify({ code, message, findings, cleanupWarning, guardWarning }));
    } else {
      console.error('[' + code + '] ' + message);
      for (const { path, reason } of findings ?? []) console.error(reason + ' ' + path);
      for (const warning of [cleanupWarning, guardWarning]) {
        if (warning) console.error(warning.message);
      }
    }
    process.exitCode = ['BASELINE_CONFLICT', 'CONNECTION_BUSY'].includes(code) ? 1 : 2;
  }
}
