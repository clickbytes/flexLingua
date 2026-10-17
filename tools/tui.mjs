import terminalKit from 'terminal-kit';
import {createAppRuntime} from '../js/app/runtime.js';
import {createTui} from '../js/tui/app.js';

function safeMessage(value) {
  return String(value ?? '').replace(/[\x00-\x1f\x7f-\x9f]/gu, ' ');
}

if (!process.stdin.isTTY || !process.stdout.isTTY) {
  process.stderr.write('Terminal UI needs an interactive TTY. Use node tools/translate.mjs for command-line translation.\n');
  process.exitCode = 1;
} else {
  try {
    const runtime = await createAppRuntime();
    const app = createTui({runtime, terminal: terminalKit.terminal});
    app.start();
  } catch (error) {
    process.stderr.write(`Cannot start flexLingua Terminal UI: ${safeMessage(error?.message)}\n`);
    process.exitCode = 1;
  }
}
