import { PLAN, iso, rotateDir, isStraight } from '../floor-plan.js';

const EDGES = {
  x0: { at: (t) => [0, t], normal: [1, 0], length: PLAN.depth },
  y0: { at: (t) => [t, 0], normal: [0, 1], length: PLAN.width },
  xW: { at: (t) => [PLAN.width, t], normal: [-1, 0], length: PLAN.depth },
  yD: { at: (t) => [t, PLAN.depth], normal: [0, -1], length: PLAN.width }
};

function visible(edge) {
  const { du, dv } = rotateDir(...EDGES[edge].normal);
  return isStraight() ? dv > 0 : du > 0 || dv > 0;
}

function point(edge, t, z) {
  const [x, y] = EDGES[edge].at(t);
  return iso(x, y, z);
}

function polygon(g, points, color, alpha = 1) {
  g.poly(points.flatMap(({ x, y }) => [x, y])).fill({ color, alpha });
}

function windowPanel(g, edge, start, end) {
  const low = 31, high = 78;
  const corners = [point(edge, start, low), point(edge, end, low), point(edge, end, high), point(edge, start, high)];
  polygon(g, corners, 0x091A2A, 0.96);
  const inset = [point(edge, start + 0.12, low + 4), point(edge, end - 0.12, low + 4),
    point(edge, end - 0.12, high - 4), point(edge, start + 0.12, high - 4)];
  polygon(g, inset, 0x16445D, 0.94);
  g.poly(inset.flatMap(({ x, y }) => [x, y])).stroke({ color: 0x6CCBDD, width: 2.2, alpha: 0.9 });
  const mid = (start + end) / 2;
  const a = point(edge, mid, low + 4), b = point(edge, mid, high - 4);
  g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ color: 0x90D9E5, width: 1.2, alpha: 0.7 });
  for (let i = 0; i < 9; i += 1) {
    const t = start + 0.2 + ((i * 37) % 80) / 100 * (end - start - 0.4);
    const z = low + 7 + ((i * 19) % 37);
    const star = point(edge, t, z);
    g.circle(star.x, star.y, i % 3 === 0 ? 1.8 : 1.1).fill({ color: i % 2 ? 0xE2F8FF : 0xA2E3EF, alpha: 0.85 });
  }
}

export function drawSpaceWallDecor(g) {
  for (const [edge, windows] of Object.entries({
    x0: [[7.4, 9.7], [10.2, 12.7]],
    y0: [[2.0, 4.8], [7.1, 9.1], [16.0, 18.6]],
    xW: [[7.8, 10.1], [10.8, 13.1]],
    yD: [[1.0, 3.4], [4.0, 6.5], [8.0, 11.8], [15.1, 17.6]]
  })) {
    if (!visible(edge)) continue;
    for (const [start, end] of windows) windowPanel(g, edge, start, end);
  }
}
