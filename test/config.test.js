import test from 'node:test';
import assert from 'node:assert/strict';
import { win32 } from 'node:path';
import { addSourcePath, normalizeConfig, resetSourcePath, suggestSourcePath } from '../src/server/config.js';

test('legacy sleep timeout becomes the total inactivity leave timeout', () => {
  const { config, migrated } = normalizeConfig({
    idleAfterSec: 60,
    sleepAfterSec: 300,
    goneAfterSec: 1800,
    port: 4777
  });

  assert.equal(migrated, true);
  assert.equal(config.goneAfterSec, 360);
  assert.equal(Object.hasOwn(config, 'sleepAfterSec'), false);
  assert.equal(config.port, 4777);
});

test('new configs use a six-minute total timeout without migration', () => {
  const { config, migrated } = normalizeConfig({ idleAfterSec: 60, goneAfterSec: 360 });
  assert.equal(migrated, false);
  assert.equal(config.goneAfterSec, 360);
});

test('a configured path adds to source settings and reset removes only path and forceSource', () => {
  const configured = addSourcePath({ enabled: false, forceSource: 'claude-desktop', custom: 'kept' }, 'C:/logs');
  assert.deepEqual(configured, {
    enabled: false, forceSource: 'claude-desktop', custom: 'kept', path: 'C:/logs'
  });
  assert.deepEqual(resetSourcePath(configured), { enabled: false, custom: 'kept' });
});

test('suggests Claude and Codex log subfolders without changing other paths', () => {
  const claude = win32.join('C:', 'Users', 'person', '.claude');
  const codex = win32.join('C:', 'Users', 'person', '.codex');
  const gemini = win32.join('C:', 'Users', 'person', '.gemini');
  assert.equal(suggestSourcePath('claude-code', claude), win32.join(claude, 'projects'));
  assert.equal(suggestSourcePath('claude-desktop', claude), win32.join(claude, 'projects'));
  assert.equal(suggestSourcePath('codex', codex), win32.join(codex, 'sessions'));
  assert.equal(suggestSourcePath('codex', win32.join(codex, 'sessions')), null);
  assert.equal(suggestSourcePath('antigravity', gemini), win32.join(gemini, 'antigravity', 'brain'));
  assert.equal(suggestSourcePath('antigravity', win32.join(gemini, 'antigravity')), win32.join(gemini, 'antigravity', 'brain'));
  assert.equal(suggestSourcePath('antigravity', '/home/person/.gemini'), '/home/person/.gemini/antigravity/brain');
  assert.equal(suggestSourcePath('antigravity', win32.join(gemini, 'antigravity', 'brain')), null);
  assert.equal(suggestSourcePath('opencode', win32.join('C:', 'Users', 'person', '.local')),
    win32.join('C:', 'Users', 'person', '.local', 'share', 'opencode'));
  assert.equal(suggestSourcePath('antigravity', win32.join('C:', 'logs')), null);
});
