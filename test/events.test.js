import test from 'node:test';
import assert from 'node:assert/strict';
import { validateEvent } from '../src/core/events.js';

const validEvent = {
  v: 1,
  source: 'codex',
  sessionId: 'session-1',
  agentId: 'session-1',
  parentAgentId: null,
  project: null,
  title: null,
  kind: 'turn_start',
  tool: null,
  room: null,
  detail: null,
  exitCode: null,
  git: null,
  ts: 1,
  startedAt: null,
  endedAt: null,
  live: true
};

test('validates a complete event matching the shared schema', () => {
  assert.equal(validateEvent(validEvent), true);
});

test('rejects invalid enums, oversized details, and malformed git metadata', () => {
  assert.equal(validateEvent({ ...validEvent, source: 'unknown' }), false);
  assert.equal(validateEvent({ ...validEvent, detail: 'x'.repeat(41) }), false);
  assert.equal(validateEvent({ ...validEvent, git: { action: 'delete' } }), false);
});

test('rejects incomplete and non-object values', () => {
  assert.equal(validateEvent(null), false);
  assert.equal(validateEvent({ ...validEvent, ts: '1' }), false);
  assert.equal(validateEvent({ ...validEvent, ts: null }), false);
  assert.equal(validateEvent({ ...validEvent, room: 'unknown' }), false);
});
