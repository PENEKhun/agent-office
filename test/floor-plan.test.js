import test from 'node:test';
import assert from 'node:assert/strict';
import { createSeatAllocator, IDLE_SPOTS, ROOMS } from '../public/floor-plan.js';

test('seat allocator gives distinct room seats and reuses a released seat', () => {
  const seats = createSeatAllocator();
  const first = seats.assign('one', 'dev');
  const second = seats.assign('two', 'dev');
  assert.notDeepEqual(first, second);
  assert.deepEqual(seats.assign('one', 'dev'), first);
  seats.release('one');
  assert.deepEqual(seats.assign('three', 'dev'), first);
});

test('idle point reservations are unique and avoid occupied room seats', () => {
  const seats = createSeatAllocator();
  const loungeSeat = seats.assign('worker', 'lounge');
  const sofa = IDLE_SPOTS.sofa;
  const idleSpot = seats.assignAux('idle-one', 'idle:sofa', sofa.points, ROOMS[sofa.room].rect);
  const secondSpot = seats.assignAux('idle-two', 'idle:sofa', sofa.points, ROOMS[sofa.room].rect);
  assert.notDeepEqual([idleSpot.x, idleSpot.y], [loungeSeat.x, loungeSeat.y]);
  assert.notDeepEqual([idleSpot.x, idleSpot.y], [secondSpot.x, secondSpot.y]);
  seats.releaseAux('idle-one');
  assert.deepEqual(seats.assignAux('idle-three', 'idle:sofa', sofa.points, ROOMS[sofa.room].rect), idleSpot);
});

test('seat allocator moves an agent between rooms and assigns overflow seats', () => {
  const seats = createSeatAllocator();
  seats.assign('one', 'library');
  const meeting = seats.assign('one', 'meeting');
  assert.deepEqual(meeting, { x: 8, y: 3.5, overflow: false });
  const normal = Array.from({ length: 8 }, (_, index) => seats.assign(`dev-${index}`, 'dev')).at(-1);
  assert.equal(normal.overflow, false);
  assert.equal(seats.assign('extra', 'dev').overflow, true);
});
