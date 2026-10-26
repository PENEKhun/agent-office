import test from 'node:test';
import assert from 'node:assert/strict';
import { convexHull, overlapArea, pickCardSpot } from '../public/card-placement.js';

const diamond = convexHull([{ x: 200, y: 20 }, { x: 380, y: 110 }, { x: 200, y: 200 }, { x: 20, y: 110 }, { x: 200, y: 110 }]);

test('볼록 껍질은 안쪽 점을 뺀다', () => {
  assert.equal(diamond.length, 4);
});

test('겹침 넓이는 사각형 안쪽 부분만 센다', () => {
  assert.equal(overlapArea(diamond, { x: 0, y: 0, width: 10, height: 10 }), 0);
  const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
  assert.equal(overlapArea(square, { x: 5, y: 5, width: 10, height: 10 }), 25);
});

test('사무실과 겹치지 않는 모서리 빈 곳을 고른다', () => {
  const spot = pickCardSpot({ width: 60, height: 30, viewWidth: 400, viewHeight: 220, anchor: { x: 200, y: 110 }, hull: diamond });
  assert.equal(spot.overlap, 0);
  const rect = { x: spot.x, y: spot.y, width: 60, height: 30 };
  assert.equal(overlapArea(diamond, rect), 0);
});

test('빈 곳이 여럿이면 칩에 가까운 쪽', () => {
  const spot = pickCardSpot({ width: 60, height: 30, viewWidth: 400, viewHeight: 220, anchor: { x: 350, y: 30 }, hull: diamond });
  assert.ok(spot.x > 200 && spot.y < 100);
});

test('도구막대 같은 피할 자리는 넓이와 무관하게 크게 피한다', () => {
  const toolbar = { x: 300, y: 0, width: 100, height: 40, weight: 50 };
  const spot = pickCardSpot({ width: 60, height: 30, viewWidth: 400, viewHeight: 220, anchor: { x: 380, y: 10 }, hull: diamond, avoid: [toolbar] });
  assert.ok(spot.y >= 40 || spot.x + 60 <= 300);
});
