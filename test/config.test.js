import test from 'node:test';
import assert from 'node:assert/strict';
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
  assert.equal(suggestSourcePath('claude-code', 'C:\\Users\\person\\.claude'), 'C:\\Users\\person\\.claude\\projects');
  assert.equal(suggestSourcePath('claude-desktop', 'C:\\Users\\person\\.claude'), 'C:\\Users\\person\\.claude\\projects');
  assert.equal(suggestSourcePath('codex', 'C:\\Users\\person\\.codex'), 'C:\\Users\\person\\.codex\\sessions');
  assert.equal(suggestSourcePath('codex', 'C:\\Users\\person\\.codex\\sessions'), null);
  assert.equal(suggestSourcePath('antigravity', 'C:\\Users\\person\\.gemini'), 'C:\\Users\\person\\.gemini\\antigravity\\brain');
  assert.equal(suggestSourcePath('antigravity', 'C:\\Users\\person\\.gemini\\antigravity'), 'C:\\Users\\person\\.gemini\\antigravity\\brain');
  assert.equal(suggestSourcePath('antigravity', '/home/person/.gemini'), '/home/person/.gemini/antigravity/brain');
  assert.equal(suggestSourcePath('antigravity', 'C:\\Users\\person\\.gemini\\antigravity\\brain'), null);
  assert.equal(suggestSourcePath('antigravity', 'C:\\logs'), null);
});
