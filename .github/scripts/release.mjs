// Prepares a plugin release for release.yml: checks the plugin, works out its tag
// (<plugin>--v<version>, the form dependency ranges resolve against), makes sure the tag is new,
// and writes the release notes from the version's section of the plugin's CHANGELOG.md.
// Rules for Robots Core is the source of this file; each domain repository keeps an identical copy.
//
//   node .github/scripts/release.mjs <plugin> [--notes <file>] [--github-output]

import { spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { changelogSection, checkPlugin, listPlugins } from './plugins.mjs';

export function prepare(root, name) {
  if (!listPlugins(root).includes(name)) return { errors: [`No such plugin: ${name}`] };
  const errors = checkPlugin(root, name);
  if (errors.length) return { errors };
  const pluginRoot = join(root, 'plugins', name);
  const { version } = JSON.parse(readFileSync(join(pluginRoot, '.claude-plugin', 'plugin.json'), 'utf8'));
  const tag = `${name}--v${version}`;
  const existing = spawnSync('git', ['tag', '--list', tag], { cwd: root, encoding: 'utf8' });
  if (existing.status !== 0) return { errors: [`git tag failed: ${existing.stderr.trim()}`] };
  if (existing.stdout.trim() === tag) {
    return { errors: [`${tag} already exists. Raise the version in plugin.json and add its section to CHANGELOG.md.`] };
  }
  const notes = changelogSection(readFileSync(join(pluginRoot, 'CHANGELOG.md'), 'utf8'), version);
  if (!notes) {
    return { errors: [`CHANGELOG.md has no "## ${version}" section with text in it. Move Unreleased into it first.`] };
  }
  return { errors: [], tag, version, notes };
}

function main(argv) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const name = argv.find((arg, i) => !arg.startsWith('--') && argv[i - 1] !== '--notes');
  if (!name) {
    console.error('Usage: node .github/scripts/release.mjs <plugin> [--notes <file>] [--github-output]');
    return 2;
  }
  const result = prepare(root, name);
  if (result.errors.length) {
    console.error(result.errors.map((e) => `- ${e}`).join('\n'));
    return 1;
  }
  const notesIndex = argv.indexOf('--notes');
  if (notesIndex !== -1) writeFileSync(argv[notesIndex + 1], `${result.notes}\n`);
  if (argv.includes('--github-output') && process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `tag=${result.tag}\nversion=${result.version}\n`);
  }
  console.log(`Ready to release ${result.tag}.\n\n${result.notes}`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
