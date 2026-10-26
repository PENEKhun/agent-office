import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseIdleSpot, idleDelayMs, idleSpotPosition, nextIdleSpot, personalityFor } from '../public/idle-behavior.js';
import { createSeatAllocator, IDLE_SPOTS } from '../public/floor-plan.js';

test('every idle location is in the lounge', () => {
  assert.deepEqual(Object.keys(IDLE_SPOTS).sort(), ['coffee', 'sofa', 'water']);
  assert.ok(Object.values(IDLE_SPOTS).every((spot) => spot.room === 'lounge'));
});

test('weighted idle choice respects weights and skips the current spot', () => {
  assert.equal(chooseIdleSpot({ sofa: 1, bookshelf: 3 }, null, () => 0.5), 'bookshelf');
  assert.equal(chooseIdleSpot({ sofa: 1, bookshelf: 3 }, 'bookshelf', () => 0.5), 'sofa');
  assert.equal(chooseIdleSpot({ sofa: 1 }, 'sofa', () => 0), null);
});

test('idle visit delay stays between twenty and forty seconds', () => {
  assert.equal(idleDelayMs(() => 0), 20_000);
  assert.equal(idleDelayMs(() => 1), 40_000);
});

test('personality affects movement and weighted idle spot selection', () => {
  const settings = {
    codex: { speed: 1.3, bounce: 0.3, idleSpots: { coffee: 3, water: 1, window: 100 } },
    subagentSpeedMultiplier: 1.1
  };
  const agent = { source: 'codex', parentAgentId: 'parent' };
  assert.equal(personalityFor(agent, settings).speed, 1.4300000000000002);
  assert.equal(nextIdleSpot(agent, null, settings, () => 0.9), 'water');
});

test('idle spot selection ignores non-lounge locations even if configured', () => {
  const agent = { source: 'codex' };
  assert.equal(nextIdleSpot(agent, null, { codex: { idleSpots: { window: 1, bookshelf: 1 } } }, () => 0), 'sofa');
});

test('idle spot coordinates use the shared seat allocator', () => {
  const allocator = createSeatAllocator();
  const first = idleSpotPosition('one', 'water', allocator);
  const second = idleSpotPosition('two', 'water', allocator);
  assert.notDeepEqual([first.x, first.y], [second.x, second.y]);
});
