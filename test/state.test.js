import test from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/core/state.js';

function event(kind, values = {}) {
  return {
    v: 1, source: 'codex', sessionId: 'session-a', agentId: 'session-a', parentAgentId: null,
    project: 'C:/work/alpha', title: null, kind, tool: null, room: null, detail: null,
    exitCode: null, git: null, ts: 1000, startedAt: null, endedAt: null, live: true, ...values
  };
}

test('inactive agents rest after one minute and leave at the six-minute mark without sleeping', () => {
  let clock = 1000;
  const state = createState({ idleAfterSec: 60, goneAfterSec: 360, now: () => clock });
  assert.equal(state.apply(event('session_start')), true);
  assert.equal(state.snapshot().floors[0].agents[0].status, 'arriving');
  clock += 60_000;
  assert.equal(state.snapshot().floors[0].agents[0].status, 'idle');
  clock += 299_999;
  assert.equal(state.snapshot().floors[0].agents[0].status, 'idle');
  clock += 1;
  assert.equal(state.snapshot().floors[0].agents[0].status, 'leaving');
  clock += 1000;
  assert.deepEqual(state.snapshot().floors, []);
  clock += 1000;
  assert.equal(state.apply(event('tool_start', { ts: clock, room: 'dev' })), true);
  assert.equal(state.snapshot().floors[0].agents[0].status, 'working');
});

test('tick returns a delta only when a time-based status changes', () => {
  let clock = 1000;
  const state = createState({ idleAfterSec: 5, now: () => clock });
  state.apply(event('tool_start'));
  clock += 5000;
  assert.equal(state.tick().floors[0].agents[0].status, 'idle');
  assert.equal(state.tick(), null);
});

test('spawn slots bind child agents and despawn the oldest active child', () => {
  let clock = 1000;
  const state = createState({ now: () => clock });
  state.apply(event('session_start'));
  state.apply(event('spawn', { ts: 1100 }));
  const parent = state.snapshot().floors[0].agents[0];
  assert.equal(state.snapshot().floors[0].agents[1].placeholder, true);
  state.apply(event('tool_start', {
    ts: 1200, sessionId: 'child-session', agentId: 'child-a', parentAgentId: 'session-a', room: 'dev', project: 'C:/work/alpha'
  }));
  let snapshot = state.snapshot();
  assert.equal(snapshot.floors[0].agents[1].placeholder, false);
  assert.equal(snapshot.floors[0].agents[1].parentId, parent.id);
  clock = 1300;
  state.apply(event('despawn', { ts: 1300 }));
  snapshot = state.snapshot();
  assert.equal(snapshot.floors[0].agents[1].status, 'leaving');
});

test('presentation mode hides project paths and agent titles or details', () => {
  const state = createState({ now: () => 1000 });
  state.apply(event('tool_start', { title: 'private title', detail: 'private-file.txt', room: 'dev' }));
  const snapshot = state.snapshot({ presentationMode: true });
  assert.equal(snapshot.floors[0].project, 'Project A');
  assert.equal(snapshot.floors[0].name, 'Project A');
  assert.equal(snapshot.floors[0].agents[0].title, '작업 중');
    assert.equal(snapshot.floors[0].agents[0].detail, null);
  assert.equal(snapshot.activity[0].project, 'Project A');
    assert.equal(snapshot.activity[0].detail, null);
});

test('git commits increment the project mailbox', () => {
  const state = createState({ now: () => 1000 });
  state.apply(event('git', { git: { action: 'commit' } }));
  assert.equal(state.snapshot().mailbox['C:/work/alpha'], 1);
  assert.deepEqual(state.snapshot().activity[0].git, { action: 'commit' });
});

test('activity snapshots retain only safe room and playback metadata', () => {
  const state = createState({ now: () => 1000 });
  state.apply(event('tool_end', { room: 'library', live: false, detail: 'Search' }));
  const [item] = state.snapshot().activity;
  assert.equal(item.room, 'library');
  assert.equal(item.live, false);
  assert.equal(item.stateAgentId, 'agent-1');
  assert.equal(item.detail, 'Search');
});

test('a two-hour-old restored session leaves no floor in the snapshot', () => {
  const clock = 2 * 60 * 60 * 1000;
  const state = createState({ now: () => clock });
  state.apply(event('session_start', { ts: clock - clock }));
  assert.deepEqual(state.snapshot().floors, []);
  assert.equal(state.snapshot().moreFloors, 0);
});

test('gone agents are removed from the map after ten minutes and can be recreated', () => {
  let clock = 1000;
  const state = createState({ idleAfterSec: 1, goneAfterSec: 3, now: () => clock });
  state.apply(event('session_start'));
  state.apply(event('spawn'));
  const originalIds = state.snapshot().floors[0].agents.map((agent) => agent.id);
  clock += 4001;
  state.tick();
  assert.deepEqual(state.snapshot().floors, []);
  clock += 600_000;
  state.tick();
  state.apply(event('session_start', { ts: clock }));
  state.apply(event('spawn', { ts: clock }));
  const recreatedIds = state.snapshot().floors[0].agents.map((agent) => agent.id);
  assert.equal(recreatedIds.some((id) => originalIds.includes(id)), false);
});
