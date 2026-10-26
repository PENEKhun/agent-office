import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemo, parseClockSpeed } from '../src/server/demo.js';
import { validateEvent } from '../src/core/events.js';

test('demo starts three sources, one child, and uses an absolute project path', () => {
  const events = [];
  const stop = createDemo().subscribe((event) => events.push(event));
  stop();
  assert.equal(events.every(validateEvent), true);
  assert.deepEqual(new Set(events.map((event) => event.source)), new Set(['claude-code', 'codex', 'antigravity']));
  assert.ok(events.every((event) => /^[A-Za-z]:\//.test(event.project) || event.project.startsWith('//')));
  assert.equal(events.filter((event) => event.kind === 'spawn').length, 1);
  assert.ok(events.some((event) => event.agentId === 'demo-subagent' && event.parentAgentId === 'demo-codex'));
});

test('crowd demo starts eight distinct agents with several in the same room', () => {
  const events = [];
  const stop = createDemo({ crowd: true }).subscribe((event) => events.push(event));
  stop();
  const starts = events.filter((event) => event.kind === 'session_start');
  assert.equal(starts.length, 8);
  assert.equal(new Set(starts.map((event) => `${event.source}:${event.sessionId}:${event.agentId}`)).size, 8);
  assert.equal(starts.filter((event) => event.source === 'claude-code').length, 3);
});

test('demo work events never use the lounge room', () => {
  let emit;
  let timestamp = 1000;
  const events = [];
  const stop = createDemo({ crowd: true, now: () => timestamp, setIntervalFn: (callback) => { emit = callback; return 1; } })
    .subscribe((event) => events.push(event));
  for (let index = 0; index < 36; index += 1) {
    timestamp += 1400;
    emit();
  }
  stop();
  assert.equal(events.some((event) => event.room === 'lounge'), false);
});

test('clock speed accepts a bounded positive demo multiplier', () => {
  assert.equal(parseClockSpeed(['node', 'server.js']), 1);
  assert.equal(parseClockSpeed(['node', 'server.js', '--clock-speed=12']), 12);
  assert.equal(parseClockSpeed(['--clock-speed=999']), 600);
  assert.equal(parseClockSpeed(['--clock-speed=0']), 1);
});

test('accelerated demo stops repeating activity so agents can become idle', () => {
  let quiet;
  let intervalCleared = false;
  const demo = createDemo({
    clockSpeed: 12,
    setIntervalFn: () => 1,
    clearIntervalFn: () => { intervalCleared = true; },
    setTimeoutFn: (callback) => { quiet = callback; return 2; },
    clearTimeoutFn: () => {}
  });
  const stop = demo.subscribe(() => {});
  quiet();
  assert.equal(intervalCleared, true);
  stop();
});

test('demo emits commits every twenty seconds and pushes every sixty seconds', () => {
  let emit;
  let timestamp = 1000;
  const events = [];
  const stop = createDemo({ now: () => timestamp, setIntervalFn: (callback) => { emit = callback; return 1; } })
    .subscribe((event) => events.push(event));
  timestamp += 19_999; emit();
  assert.equal(events.filter((event) => event.kind === 'git').length, 0);
  timestamp += 1; emit();
  timestamp += 20_000; emit();
  timestamp += 20_000; emit();
  timestamp += 1400; emit();
  stop();
  assert.deepEqual(events.filter((event) => event.kind === 'git').map((event) => event.git.action), ['commit', 'commit', 'push', 'commit']);
});
