import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { changelogSection, checkPlugin, listPlugins, plan } from '../plugins.mjs';
import { prepare } from '../release.mjs';

let root;

function writePlugin(name, { manifest, changelog = '# Changelog\n\n## 1.0.0\n\nFirst release.\n', files = {} } = {}) {
  const dir = join(root, 'plugins', name);
  mkdirSync(join(dir, '.claude-plugin'), { recursive: true });
  writeFileSync(
    join(dir, '.claude-plugin', 'plugin.json'),
    JSON.stringify(manifest ?? { name, version: '1.0.0', description: 'A plugin.' }),
  );
  writeFileSync(join(dir, 'README.md'), `# ${name}\n`);
  if (changelog !== null) writeFileSync(join(dir, 'CHANGELOG.md'), changelog);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(dir, path, '..'), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}

const git = (...args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' });

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'rfr-plugins-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('listPlugins', () => {
  it('lists the folders under plugins/, sorted, and nothing when there are none', () => {
    assert.deepEqual(listPlugins(root), []);
    writePlugin('rfr-b');
    writePlugin('rfr-a');
    assert.deepEqual(listPlugins(root), ['rfr-a', 'rfr-b']);
  });
});

describe('checkPlugin', () => {
  it('accepts a complete plugin', () => {
    writePlugin('rfr-good', { files: { 'scripts/run.mjs': "import x from './lib/x.mjs';\n" } });
    assert.deepEqual(checkPlugin(root, 'rfr-good'), []);
  });

  it('reports a name that does not match the folder, a bad version, and no description', () => {
    writePlugin('rfr-bad', { manifest: { name: 'rfr-other', version: '1.0' } });
    const errors = checkPlugin(root, 'rfr-bad').join('\n');
    assert.match(errors, /does not match the folder/);
    assert.match(errors, /not a semantic version/);
    assert.match(errors, /no description/);
  });

  it('reports a missing CHANGELOG and one with no section for the version', () => {
    writePlugin('rfr-a', { changelog: null });
    assert.match(checkPlugin(root, 'rfr-a').join('\n'), /CHANGELOG\.md is missing/);
    writePlugin('rfr-b', { changelog: '# Changelog\n\n## 0.9.0\n\nOld.\n' });
    assert.match(checkPlugin(root, 'rfr-b').join('\n'), /neither a "## 1\.0\.0" nor a "## Unreleased"/);
    writePlugin('rfr-c', { changelog: '# Changelog\n\n## Unreleased\n\nNew.\n' });
    assert.deepEqual(checkPlugin(root, 'rfr-c'), []);
  });

  it('reports malformed dependencies', () => {
    writePlugin('rfr-dep', { manifest: { name: 'rfr-dep', version: '1.0.0', description: 'd', dependencies: ['rfr-core'] } });
    assert.match(checkPlugin(root, 'rfr-dep').join('\n'), /dependencies must be a list/);
  });

  it('reports run-time references that leave the plugin folder, and allows them in README, CHANGELOG, and tests', () => {
    writePlugin('rfr-leaky', {
      files: {
        'scripts/run.mjs': "import shared from '../../rfr-core/scripts/lib.mjs';\n",
        'hooks/hooks.json': '{"command": "node ${CLAUDE_PLUGIN_ROOT}/../rfr-core/x.mjs"}',
        'skills/a/SKILL.md': 'See [the guide](../../guide.md).\n',
        'test/run.test.mjs': "import '../../../.github/scripts/plugins.mjs';\n",
      },
    });
    writeFileSync(join(root, 'plugins', 'rfr-leaky', 'README.md'), 'See [specs](../../docs/specs/x.md).\n');
    const errors = checkPlugin(root, 'rfr-leaky');
    assert.equal(errors.length, 2, errors.join('\n'));
    assert.match(errors.join('\n'), /scripts\/run\.mjs refers to "\.\.\/\.\.\/rfr-core/);
    assert.match(errors.join('\n'), /hooks\/hooks\.json refers to "\.\.\/rfr-core/);
  });

  it('allows a relative reference that stays inside the plugin', () => {
    writePlugin('rfr-ok', { files: { 'skills/a/SKILL.md': 'Run `node ../../scripts/x.mjs`.\n' } });
    assert.deepEqual(checkPlugin(root, 'rfr-ok'), []);
  });

  it('reports a link to outside the plugin', (t) => {
    const dir = writePlugin('rfr-link');
    try {
      symlinkSync(join(root, 'elsewhere'), join(dir, 'shared'));
    } catch {
      t.skip('this system cannot create symbolic links');
      return;
    }
    assert.match(checkPlugin(root, 'rfr-link').join('\n'), /shared is a link to outside the plugin/);
  });
});

describe('changelogSection', () => {
  it('returns the text of a version section up to the next heading', () => {
    const text = '# Changelog\n\n## Unreleased\n\n## [1.2.0] - 2026-11-15\n\n- Added a thing.\n\n## 1.1.0\n\n- Older.\n';
    assert.equal(changelogSection(text, '1.2.0'), '- Added a thing.');
    assert.equal(changelogSection(text, '1.1.0'), '- Older.');
    assert.equal(changelogSection(text, '1.1'), null);
  });
});

describe('plan', () => {
  const plugins = ['rfr-a', 'rfr-b'];
  it('tests only the plugins a change touches', () => {
    assert.deepEqual(plan(plugins, ['plugins/rfr-b/scripts/x.mjs', 'README.md']), ['rfr-b']);
    assert.deepEqual(plan(plugins, ['docs/specs/x.md']), []);
    assert.deepEqual(plan(plugins, ['plugins/rfr-ab/x']), []);
  });
  it('tests every plugin when the shared CI changes, or when there is no base to compare with', () => {
    assert.deepEqual(plan(plugins, ['.github/scripts/plugins.mjs']), plugins);
    assert.deepEqual(plan(plugins, ['.github/workflows/ci.yml']), plugins);
    assert.deepEqual(plan(plugins, null), plugins);
  });
});

describe('release prepare', () => {
  it('names the tag <plugin>--v<version> and takes the notes from the changelog', () => {
    writePlugin('rfr-a', { changelog: '# Changelog\n\n## 1.0.0\n\n- First release.\n' });
    git('init', '-q');
    const result = prepare(root, 'rfr-a');
    assert.deepEqual(result.errors, []);
    assert.equal(result.tag, 'rfr-a--v1.0.0');
    assert.equal(result.notes, '- First release.');
  });

  it('refuses a version that is already tagged, or that has no changelog section', () => {
    writePlugin('rfr-a');
    git('init', '-q');
    git('-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'commit', '-q', '--allow-empty', '-m', 'x');
    git('tag', 'rfr-a--v1.0.0');
    assert.match(prepare(root, 'rfr-a').errors.join('\n'), /already exists/);

    writePlugin('rfr-b', { changelog: '# Changelog\n\n## Unreleased\n\n- New.\n' });
    assert.match(prepare(root, 'rfr-b').errors.join('\n'), /no "## 1\.0\.0" section/);
    assert.match(prepare(root, 'rfr-none').errors.join('\n'), /No such plugin/);
  });
});
