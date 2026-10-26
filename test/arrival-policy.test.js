import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldMoveToDesk } from '../public/arrival-policy.js';

test('new agents move from the elevator to a desk after three seconds without a room event', () => {
  const arrival = { hadRoomEvent: false, arrivalFallbackDone: false, status: 'arriving', arrivalAt: 1000 };
  assert.equal(shouldMoveToDesk(arrival, 3999), false);
  assert.equal(shouldMoveToDesk(arrival, 4000), true);
  assert.equal(shouldMoveToDesk({ ...arrival, hadRoomEvent: true }, 5000), false);
  assert.equal(shouldMoveToDesk({ ...arrival, status: 'leaving' }, 5000), false);
});
