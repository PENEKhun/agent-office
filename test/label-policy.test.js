import test from 'node:test';
import assert from 'node:assert/strict';
import { boundsOverlap, groupNearby, groupOverlapping } from '../public/label-policy.js';

test('groups connected heads only when at least three are within the radius', () => {
  const groups = groupNearby([
    { id: 'a', x: 0, y: 0 }, { id: 'b', x: 20, y: 0 },
    { id: 'c', x: 40, y: 0 }, { id: 'd', x: 120, y: 0 }
  ]);
  assert.deepEqual(groups.map((group) => group.map((entry) => entry.id)), [['a', 'b', 'c'], ['d']]);
});

test('screen rectangle overlap uses actual positive-area intersection', () => {
  assert.equal(boundsOverlap({ x: 0, y: 0, width: 10, height: 10 }, { x: 9, y: 9, width: 10, height: 10 }), true);
  assert.equal(boundsOverlap({ x: 0, y: 0, width: 10, height: 10 }, { x: 10, y: 0, width: 10, height: 10 }), false);
});

test('groups badges only when their actual screen rectangles overlap', () => {
  const entries = [
    { id: 'a', bounds: { x: 0, y: 0, width: 18, height: 18 } },
    { id: 'b', bounds: { x: 17, y: 0, width: 18, height: 18 } },
    { id: 'c', bounds: { x: 34, y: 0, width: 18, height: 18 } },
    { id: 'd', bounds: { x: 70, y: 0, width: 18, height: 18 } }
  ];
  const groups = groupOverlapping(entries, (entry) => entry.bounds);
  assert.deepEqual(groups.map((group) => group.map((entry) => entry.id)), [['a', 'b', 'c'], ['d']]);
});
