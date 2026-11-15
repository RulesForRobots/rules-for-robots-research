// `npm run verify`: everything CI checks, for every plugin. Run it before reporting work as done.
// Rules for Robots Core is the source of this file; each domain repository keeps an identical copy.

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listPlugins } from './plugins.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const steps = [];
const run = (label, command, args) => {
  console.log(`\n> ${label}`);
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' && command !== process.execPath });
  steps.push([label, result.status === 0]);
};

const scriptTests = join(root, '.github', 'scripts', 'test');
if (existsSync(scriptTests)) {
  const files = readdirSync(scriptTests).filter((f) => f.endsWith('.test.mjs')).map((f) => join(scriptTests, f));
  if (files.length) run('CI script tests', process.execPath, ['--test', ...files]);
}
run('Plugin checks', process.execPath, ['.github/scripts/plugins.mjs', 'check']);
run('Plugin tests', process.execPath, ['.github/scripts/plugins.mjs', 'test']);

const claude = spawnSync('claude', ['--version'], { encoding: 'utf8', shell: process.platform === 'win32' });
if (claude.status === 0) {
  for (const name of listPlugins(root)) {
    run(`claude plugin validate ${name}`, 'claude', ['plugin', 'validate', '--strict', join('plugins', name)]);
  }
} else {
  console.log('\n> claude plugin validate: skipped, Claude Code is not on the PATH (CI runs it)');
}

console.log('\nSummary');
for (const [label, ok] of steps) console.log(`  ${ok ? 'pass' : 'FAIL'}  ${label}`);
process.exitCode = steps.every(([, ok]) => ok) ? 0 : 1;
