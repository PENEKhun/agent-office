import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { baselineWarning } from '../scripts/lib/compare-baseline.js';
import { acquireSceneLock, sceneLockOwnedBy } from '../scripts/lib/scene-lock.js';

test('fresh ancestor baseline stays valid and ancestry is injected', () => {
  const metadata = { commit: 'base', createdAt: '2026-10-25T00:00:00.000Z' };
  assert.equal(baselineWarning({
    metadata,
    currentCommit: 'head',
    now: Date.parse('2026-10-26T00:00:00.000Z'),
    isAncestor: (base, head) => base === 'base' && head === 'head'
  }), null);
});

test('missing, old, divergent, or differently sized baselines return both hashes', () => {
  const now = Date.parse('2026-10-26T00:00:00.000Z');
  const metadata = { commit: 'old', createdAt: '2026-10-01T00:00:00.000Z' };
  const stale = baselineWarning({ metadata, currentCommit: 'head', now, isAncestor: () => false });
  assert.equal(stale.baselineCommit, 'old');
  assert.equal(stale.currentCommit, 'head');
  assert.match(stale.warning, /7일/u);
  assert.match(stale.warning, /조상이 아님/u);
  assert.match(baselineWarning({ metadata: null, currentCommit: 'head', now }).warning, /메타데이터 없음/u);
  assert.match(baselineWarning({ metadata: { ...metadata, createdAt: new Date(now).toISOString() }, currentCommit: 'head', now, dimensionsMatch: false }).warning, /크기 불일치/u);
});

test('scene lock rejects a live owner and replaces a dead owner', () => {
  const directory = mkdtempSync(join(tmpdir(), 'agent-office-lock-test-'));
  const path = join(directory, 'scene.lock');
  try {
    writeFileSync(path, '123\n');
    assert.equal(acquireSceneLock(path, 456, (pid) => pid === 123), null);
    assert.equal(acquireSceneLock(path, 456, () => false) instanceof Function, true);
    assert.equal(sceneLockOwnedBy(path, 456), true);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('browser lookup honors EDGE_PATH and otherwise prefers Chrome', async () => {
  const { findBrowser } = await import('../scripts/lib/browser.js');
  const directory = mkdtempSync(join(tmpdir(), 'agent-office-browser-test-'));
  const chrome = join(directory, 'Google', 'Chrome', 'Application', 'chrome.exe');
  const edge = join(directory, 'Microsoft', 'Edge', 'Application', 'msedge.exe');
  try {
    mkdirSync(join(directory, 'Google', 'Chrome', 'Application'), { recursive: true });
    mkdirSync(join(directory, 'Microsoft', 'Edge', 'Application'), { recursive: true });
    writeFileSync(chrome, '');
    writeFileSync(edge, '');
    assert.equal(findBrowser({ EDGE_PATH: edge, ProgramFiles: directory }), edge);
    assert.equal(findBrowser({ ProgramFiles: directory, LOCALAPPDATA: directory }), chrome);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
