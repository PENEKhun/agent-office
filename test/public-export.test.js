import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, win32 } from 'node:path';
import { tmpdir } from 'node:os';
import {
  copyPublicTree, findDeniedFiles, findDeniedStrings, isAllowedPublicPath, isGitWorktree,
  isPreviouslyManagedPublicPath, planPublicSync, shouldRejectOrigin
} from '../scripts/lib/public-export.js';

test('public export allowlist includes product files and excludes internal material', () => {
  for (const path of ['server.js', 'src/server/http.js', 'public/widget.html', 'test/state.test.js', 'desktop/src-tauri/src/main.rs',
    'config.example.json', 'scripts/check-scene.mjs', '.github/workflows/test.yml', '.github/workflows/release-mac.yml', 'docs/SPEC.md', 'docs/INSTALL.md', 'docs/images/office.png',
    'public/design-preview.html', 'public/design-activity.html']) {
    assert.equal(isAllowedPublicPath(path), true, path);
  }
  for (const path of ['AGENTS.md', 'HANDOFF.md', 'docs/MILESTONES.md', 'docs/reviews/W11-report.md', 'docs/releases/0.4.0.md',
    'docs/INSTALL-team.md', 'docs/TEST-team-checklist.md', 'docs/design/office.png', 'docs/images/private.png',
    'desktop/src-tauri/target/debug/app.exe',
    'desktop/src-tauri/gen/schemas/capability.json', 'scripts/export-public.mjs', 'scripts/lib/release-data.mjs',
    '.github/workflows/release.yml', '.package-win/node.exe', 'work/notes.md', '../server.js', win32.join('C:', 'private', 'file.txt')]) {
    assert.equal(isAllowedPublicPath(path), false, path);
  }
});

test('public sync plans only managed file additions and removals and rejects a blocked origin', () => {
  assert.deepEqual(planPublicSync(['server.js', 'old/path.js', 'user-note.md'], ['server.js', 'new/path.js']), {
    copy: ['new/path.js', 'server.js'],
    delete: ['old/path.js', 'user-note.md']
  });
  assert.equal(isGitWorktree('repo', 'directory'), true);
  assert.equal(isGitWorktree('repo', 'file'), true);
  assert.equal(isGitWorktree('repo', ''), false);
  assert.equal(isPreviouslyManagedPublicPath('scripts/old-tool.mjs'), true);
  assert.equal(isPreviouslyManagedPublicPath('.github/workflows/local-check.yml'), false);
  assert.equal(isPreviouslyManagedPublicPath('docs/reviews/W14-report.md'), false);
  assert.equal(shouldRejectOrigin('https://host/example-private-repo.git', ['example-private-repo']), true);
  assert.equal(shouldRejectOrigin('https://host/example-public-repo.git', ['example-private-repo']), false);
});

test('deny scan finds case-insensitive values once and ignores empty entries', () => {
  assert.deepEqual(findDeniedStrings('A private HOST and host.', ['host', '', 'missing']), ['host']);
  assert.deepEqual(findDeniedStrings(null, ['host']), []);
});

test('public copy uses a temporary tree, preserves private flag, and filters excluded files', () => {
  const root = mkdtempSync(join(tmpdir(), 'agent-office-export-test-'));
  const source = join(root, 'source');
  const output = join(root, 'output');
  const put = (path, value) => {
    const target = join(source, path);
    mkdirSync(join(target, '..'), { recursive: true });
    writeFileSync(target, value);
  };
  try {
    put('server.js', 'server');
    put('.github/workflows/test.yml', 'safe workflow');
    put('.github/workflows/release.yml', 'internal workflow');
    put('package.json', '{"private":true}');
    put('src/server/http.js', 'module');
    put('public/index.html', 'page');
    put('public/design-preview.html', 'preview page');
    put('test/sample.test.js', 'test');
    put('desktop/src-tauri/src/main.rs', 'rust');
    put('desktop/src-tauri/target/debug/build.log', 'build');
    put('docs/SPEC.md', 'spec');
    put('docs/MILESTONES.md', 'milestones');
    put('docs/images/office.png', 'image');
    put('docs/images/unknown.png', 'other image');
    put('scripts/export-public.mjs', 'export tool');
    put('scripts/check-scene.mjs', 'scene tool');
    copyPublicTree(source, output);
    assert.equal(readFileSync(join(output, 'package.json'), 'utf8'), '{"private":true}');
    assert.equal(readFileSync(join(output, 'docs/images/office.png'), 'utf8'), 'image');
    assert.equal(existsSync(join(output, 'src/server/http.js')), true);
    assert.equal(existsSync(join(output, 'test/sample.test.js')), true);
    assert.equal(existsSync(join(output, 'public/design-preview.html')), true);
    assert.equal(readFileSync(join(output, '.github/workflows/test.yml'), 'utf8'), 'safe workflow');
    assert.equal(existsSync(join(output, '.github/workflows/release.yml')), false);
    for (const path of ['desktop/src-tauri/target/debug/build.log', 'docs/MILESTONES.md',
      'docs/images/unknown.png', 'scripts/export-public.mjs']) {
      assert.equal(existsSync(join(output, path)), false);
    }
    assert.deepEqual(findDeniedFiles(output, ['server']), [{ path: 'server.js', values: ['server'] }]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('public copy refuses an output directory inside its source', () => {
  const root = mkdtempSync(join(tmpdir(), 'agent-office-export-root-'));
  try {
    assert.throws(() => copyPublicTree(root, join(root, 'output')), /바깥/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
