import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeliveryQueue } from '../public/delivery-queue.js';

test('only one delivery is accepted at a time and completed event IDs do not replay', () => {
  const queue = createDeliveryQueue({ completedIds: ['old'] });
  const first = { id: 1, stateAgentId: 'agent-a' };
  const second = { id: 2, stateAgentId: 'agent-b' };
  assert.equal(queue.enqueue({ id: 'old' }), false);
  assert.equal(queue.enqueue(first), true);
  assert.equal(queue.startNext().stateAgentId, 'agent-a');
  assert.equal(queue.enqueue(second), false);
  assert.equal(queue.pendingCount, 0);
  assert.equal(queue.enqueue(first), false);
  assert.equal(queue.startNext(), null);
  assert.equal(queue.finish(2), false);
  assert.equal(queue.finish(1), true);
  assert.equal(queue.enqueue(first), false);
  assert.equal(queue.enqueue(second), true);
  assert.equal(queue.startNext().stateAgentId, 'agent-b');
  assert.equal(queue.finish(2), true);
  assert.deepEqual(queue.completedIds(), ['old', '1', '2']);
});
