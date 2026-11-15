// Checks and tests for the plugins in plugins/<name>/, used by ci.yml, release.yml, and `npm run verify`.
// Rules for Robots Core is the source of this file; each rules-for-robots-<domain> repository keeps an
// identical copy (docs/decisions/0001-repository-ci.md in rules-for-robots-core). Node 22, no dependencies.
//
//   node .github/scripts/plugins.mjs plan [--base <sha>] [--github-output]   plugins a change touches
//   node .github/scripts/plugins.mjs check [<plugin>...]                      structure and self-containment
//   node .github/scripts/plugins.mjs test [<plugin>...]                       each plugin's own tests
//
// With no plugin named, check and test cover every plugin.

import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, lstatSync, readdirSync, readFileSync, readlinkSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
export const PLUGIN_NAME = /^rfr-[a-z0-9]+(?:-[a-z0-9]+)*$/;

// A change to any of these can change how every plugin is checked, so all of them are tested.
const SHARED = ['.github/scripts/', '.github/workflows/ci.yml', 'package.json'];

// Files whose relative links may leave the plugin folder: they are read by people, not loaded at run time.
const DOCS_ONLY = new Set(['README.md', 'CHANGELOG.md']);

export function listPlugins(root) {
  const dir = join(root, 'plugins');
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isSymbolicLink()) out.push(path);
    else if (entry.isDirectory()) walk(path, out);
    else if (entry.isFile()) out.push(path);
  }
  return out;
}

const inside = (root, path) => {
  const rel = relative(root, path);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
};

// The version's own section, or the text before the next "## " heading.
export function changelogSection(text, version) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => new RegExp(`^##\\s+\\[?${version.replace(/\./g, '\\.')}\\]?(\\s|$)`).test(line));
  if (start === -1) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^##\s/.test(line));
  return (end === -1 ? rest : rest.slice(0, end)).join('\n').trim();
}

export function checkPlugin(root, name) {
  const errors = [];
  const pluginRoot = join(root, 'plugins', name);
  const manifestPath = join(pluginRoot, '.claude-plugin', 'plugin.json');
  if (!PLUGIN_NAME.test(name)) errors.push(`folder name "${name}" is not rfr-<name> in lower case`);

  let manifest = null;
  if (!existsSync(manifestPath)) {
    errors.push('.claude-plugin/plugin.json is missing');
  } else {
    try {
      manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    } catch (error) {
      errors.push(`.claude-plugin/plugin.json is not valid JSON: ${error.message}`);
    }
  }
  if (manifest) {
    if (manifest.name !== name) errors.push(`plugin.json name "${manifest.name}" does not match the folder "${name}"`);
    if (typeof manifest.version !== 'string' || !SEMVER.test(manifest.version)) {
      errors.push(`plugin.json version "${manifest.version}" is not a semantic version`);
    }
    if (typeof manifest.description !== 'string' || manifest.description.trim() === '') {
      errors.push('plugin.json has no description');
    }
    if (manifest.dependencies !== undefined) {
      const ok = Array.isArray(manifest.dependencies) && manifest.dependencies.every(
        (dep) => dep && typeof dep.name === 'string' && typeof dep.version === 'string',
      );
      if (!ok) errors.push('plugin.json dependencies must be a list of { "name", "version" }');
    }
  }

  for (const file of ['README.md', 'CHANGELOG.md']) {
    if (!existsSync(join(pluginRoot, file))) errors.push(`${file} is missing`);
  }
  if (manifest && typeof manifest.version === 'string' && existsSync(join(pluginRoot, 'CHANGELOG.md'))) {
    const changelog = readFileSync(join(pluginRoot, 'CHANGELOG.md'), 'utf8');
    if (changelogSection(changelog, manifest.version) === null && !/^##\s+Unreleased\b/m.test(changelog)) {
      errors.push(`CHANGELOG.md has neither a "## ${manifest.version}" nor a "## Unreleased" section`);
    }
  }

  // Self-contained: nothing outside the plugin folder at run time.
  if (existsSync(pluginRoot)) {
    for (const file of walk(pluginRoot)) {
      const rel = relative(pluginRoot, file).split(sep).join('/');
      if (lstatSync(file).isSymbolicLink()) {
        const target = resolve(dirname(file), readlinkSync(file));
        if (!inside(pluginRoot, target)) errors.push(`${rel} is a link to outside the plugin`);
        continue;
      }
      if (DOCS_ONLY.has(rel) || rel.startsWith('test/') || statSync(file).size > 1_000_000) continue;
      const text = readFileSync(file, 'utf8');
      if (text.includes('\u0000')) continue; // binary
      for (const match of text.matchAll(/(?:CLAUDE_PLUGIN_ROOT\}?\/|^|[\s'"`(=,:])((?:\.\.\/)+[^\s'"`)<>,;]*)/gm)) {
        const ref = match[1];
        const from = match[0].includes('CLAUDE_PLUGIN_ROOT') ? pluginRoot : dirname(file);
        if (!inside(pluginRoot, resolve(from, ref))) {
          errors.push(`${rel} refers to "${ref}", outside the plugin`);
        }
      }
    }
  }
  return errors;
}

export function testFiles(root, name) {
  const dir = join(root, 'plugins', name, 'test');
  if (!existsSync(dir)) return [];
  return walk(dir).filter((file) => /\.test\.m?js$/.test(file)).sort();
}

export function changedFiles(root, base) {
  const run = (args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  const diff = run(['diff', '--name-only', `${base}...HEAD`]);
  const result = diff.status === 0 ? diff : run(['diff', '--name-only', base, 'HEAD']);
  if (result.status !== 0) throw new Error(`git diff against ${base} failed: ${result.stderr.trim()}`);
  return result.stdout.split('\n').filter(Boolean);
}

// Which plugins a change touches. No base (a push with no earlier commit, or a run by hand) means all.
export function plan(plugins, changed) {
  if (changed === null) return plugins;
  if (changed.some((file) => SHARED.some((prefix) => file === prefix || file.startsWith(prefix)))) return plugins;
  return plugins.filter((name) => changed.some((file) => file.startsWith(`plugins/${name}/`)));
}

function main(argv) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const [command, ...rest] = argv;
  const flags = new Set(rest.filter((arg) => arg.startsWith('--')));
  const named = rest.filter((arg, i) => !arg.startsWith('--') && rest[i - 1] !== '--base');
  const all = listPlugins(root);
  const unknown = named.filter((name) => !all.includes(name));
  if (unknown.length) {
    console.error(`No such plugin: ${unknown.join(', ')}`);
    return 1;
  }
  const chosen = named.length ? named : all;

  if (command === 'plan') {
    const baseIndex = rest.indexOf('--base');
    const base = baseIndex === -1 ? process.env.BASE_SHA : rest[baseIndex + 1];
    const zero = !base || /^0+$/.test(base);
    const touched = plan(all, zero ? null : changedFiles(root, base));
    const json = JSON.stringify(touched);
    console.log(touched.length ? `Plugins to test: ${touched.join(', ')}` : 'No plugin is touched by this change.');
    if (flags.has('--github-output') && process.env.GITHUB_OUTPUT) {
      appendFileSync(process.env.GITHUB_OUTPUT, `plugins=${json}\nany=${touched.length > 0}\n`);
    }
    return 0;
  }

  if (command === 'check') {
    let failed = false;
    if (chosen.length === 0) console.log('No plugins yet.');
    for (const name of chosen) {
      const errors = checkPlugin(root, name);
      if (errors.length) {
        failed = true;
        console.error(`${name}:\n${errors.map((e) => `  - ${e}`).join('\n')}`);
      } else {
        console.log(`${name}: ok`);
      }
    }
    return failed ? 1 : 0;
  }

  if (command === 'test') {
    let failed = false;
    for (const name of chosen) {
      const files = testFiles(root, name);
      if (files.length === 0) {
        console.log(`${name}: no tests`);
        continue;
      }
      const result = spawnSync(process.execPath, ['--test', ...files], { cwd: root, stdio: 'inherit' });
      if (result.status !== 0) failed = true;
    }
    return failed ? 1 : 0;
  }

  console.error('Usage: node .github/scripts/plugins.mjs plan|check|test [<plugin>...] [--base <sha>] [--github-output]');
  return 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
