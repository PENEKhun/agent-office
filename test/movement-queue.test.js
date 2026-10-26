import test from 'node:test';
import assert from 'node:assert/strict';
import { MovementQueue } from '../public/movement-queue.js';

test('a quick room change waits three seconds before the next visit', () => {
  const queue = new MovementQueue();
  const rooms = { dev: { x: 0, y: 0 }, library: { x: 100, y: 50 } };
  queue.setTarget('agent-1', 'dev', 1000);
  queue.setTarget('agent-1', 'library', 1800);
  assert.equal(queue.position('agent-1', 3999, rooms).room, 'dev');
  const moving = queue.position('agent-1', 4000, rooms);
  assert.equal(moving.room, 'library');
  assert.equal(moving.moving, true);
  assert.deepEqual(queue.position('agent-1', 4700, rooms), {
    x: 100, y: 50, room: 'library', moving: false, queueLength: 0
  });
});

test('queued visits remain ordered and agents can be removed', () => {
  const queue = new MovementQueue();
  const rooms = { dev: { x: 0, y: 0 }, library: { x: 100, y: 50 }, search: { x: 200, y: 0 } };
  queue.setTarget('agent-1', 'dev', 0);
  queue.setTarget('agent-1', 'library', 100);
  queue.setTarget('agent-1', 'search', 200);
  assert.equal(queue.position('agent-1', 3000, rooms).room, 'library');
  assert.equal(queue.position('agent-1', 6000, rooms).room, 'search');
  queue.removeMissing([]);
  assert.equal(queue.position('agent-1', 7000, rooms), null);
});

test('movement queue keeps at most two visits and drops the middle for the newest target', () => {
  const queue = new MovementQueue();
  const rooms = Object.fromEntries(['dev', 'library', 'search', 'server', 'meeting'].map((room, index) =>
    [room, { x: index * 100, y: 0 }]));
  queue.setTarget('agent', 'dev', 0, rooms.dev);
  queue.setTarget('agent', 'library', 100, rooms.library);
  queue.setTarget('agent', 'search', 200, rooms.search);
  queue.setTarget('agent', 'server', 300, rooms.server);
  queue.setTarget('agent', 'meeting', 400, rooms.meeting);

  const first = queue.position('agent', 3000, rooms);
  assert.equal(first.room, 'library');
  assert.equal(first.queueLength, 1);
  const latest = queue.position('agent', 3001, rooms);
  assert.equal(latest.room, 'meeting');
  assert.equal(latest.queueLength, 0);
  assert.equal(latest.moving, true);
});

test('queued speech changes only after reaching its destination', () => {
  const queue = new MovementQueue();
  const places = { dev: { x: 0, y: 0 }, lounge: { x: 100, y: 30 } };
  queue.setTarget('agent', 'dev', 0, places.dev, '코드 수정 중');
  queue.setTarget('agent', 'lounge', 100, places.lounge, '쉬는 중', 'idle');
  assert.equal(queue.position('agent', 2999, places).message, '코드 수정 중');
  assert.equal(queue.position('agent', 3000, places).message, '코드 수정 중');
  assert.equal(queue.position('agent', 3699, places).message, '코드 수정 중');
  assert.equal(queue.position('agent', 3700, places).tone, 'idle');
});

test('a faster personality shortens travel time and pending routes can be canceled', () => {
  const queue = new MovementQueue({ minimumStayMs: 0, travelMs: 700 });
  const places = { dev: { x: 0, y: 0 }, lounge: { x: 100, y: 30 }, library: { x: -50, y: 0 } };
  queue.setTarget('agent', 'dev', 0, places.dev);
  queue.setTarget('agent', 'lounge', 0, places.lounge);
  queue.position('agent', 0, places, 2);
  assert.equal(queue.position('agent', 350, places, 2).moving, false);
  queue.setTarget('agent', 'library', 400, places.library);
  queue.clearPending('agent');
  assert.equal(queue.position('agent', 500, places).room, 'lounge');
});

test('speech updates received during travel wait until arrival', () => {
  const queue = new MovementQueue();
  const places = { dev: { x: 0, y: 0 }, lounge: { x: 100, y: 30 } };
  queue.setTarget('agent', 'dev', 0, places.dev, '코드 수정 중');
  queue.setTarget('agent', 'lounge', 0, places.lounge, '쉬는 중', 'idle');
  queue.position('agent', 3000, places);
  queue.setTarget('agent', 'lounge', 3200, places.lounge, '커피 마시는 중', 'idle');
  assert.equal(queue.position('agent', 3600, places).message, '코드 수정 중');
  assert.equal(queue.position('agent', 3700, places).message, '커피 마시는 중');
});

test('arrival dwell can use one second and a departure can start immediately', () => {
  const queue = new MovementQueue();
  const places = { elevator: { x: 0, y: 0 }, desk: { x: 100, y: 0 }, door: { x: 150, y: 0 } };
  queue.setTarget('agent', 'elevator', 0, places.elevator, null, 'work', { minimumStayMs: 1000 });
  queue.setTarget('agent', 'desk', 0, places.desk);
  assert.equal(queue.position('agent', 999, places).room, 'elevator');
  assert.equal(queue.position('agent', 1000, places).room, 'desk');
  queue.setTarget('agent', 'door', 1100, places.door, null, 'work', {
    immediate: true, minimumStayMs: 0, fromPoint: { x: 20, y: 0 }
  });
  assert.equal(queue.position('agent', 1100, places).x, 20);
});
