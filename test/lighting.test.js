import test from 'node:test';
import assert from 'node:assert/strict';
import { lightingAt } from '../public/lighting.js';
import { getTheme, registerTheme, setTheme } from '../public/themes/index.js';

function localTime(hour, minute = 0) {
  const date = new Date(2026, 9, 20, hour, minute);
  return date.getTime();
}

test('lighting follows day, dusk, night, and the thirty-minute transitions', () => {
  assert.equal(lightingAt(localTime(12)).alpha, 0);
  assert.equal(lightingAt(localTime(17, 45)).period, 'dusk');
  assert.ok(lightingAt(localTime(17, 45)).alpha > 0);
  assert.equal(lightingAt(localTime(19)).period, 'dusk');
  assert.equal(lightingAt(localTime(22)).period, 'night');
  assert.ok(lightingAt(localTime(6, 45)).alpha < 0.56);
});

test('day lighting override suppresses the overlay while overtime follows local time', () => {
  assert.deepEqual(lightingAt(localTime(23), 'day'), {
    period: 'day', color: 0xffffff, alpha: 0, overtime: true
  });
});

test('테마는 기본 낮밤 주기를 유지하며 밤 조명만 따뜻하게 덮어쓴다', async () => {
  const base = getTheme();
  const nightLighting = { color: 0xF6D49B, alpha: 0.3 };
  registerTheme({ ...base, id: 'warm-night-test', name: '따뜻한 밤 테스트',
    palette: { ...base.palette, lightingKeyframes: undefined, nightLighting } });
  setTheme('warm-night-test');
  assert.equal(getTheme().palette.lightingKeyframes, undefined);
  assert.deepEqual(lightingAt(localTime(12)), { period: 'day', color: 0xffffff, alpha: 0, overtime: false });
  assert.deepEqual(lightingAt(localTime(23)), {
    period: 'night', ...nightLighting, overtime: true
  });
  setTheme('office');
});
