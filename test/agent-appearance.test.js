import test from 'node:test';
import assert from 'node:assert/strict';
import { lighterColor } from '../public/agent-appearance.js';

test('subagent hat color is lighter than its body color', () => {
  const parentColor = 0x10A37F;
  const hatColor = lighterColor(parentColor);
  for (const shift of [16, 8, 0]) {
    assert.ok(((hatColor >> shift) & 0xFF) > ((parentColor >> shift) & 0xFF));
  }
});
