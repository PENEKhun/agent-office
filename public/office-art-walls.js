// 사무실 벽과 칸막이 도형. 좌표와 시점 회전은 평면도 모듈을 사용한다.
import { PLAN, iso, project, rotateDir, rotateTile, viewDims, isStraight } from './floor-plan.js';

const flat = (points) => points.flatMap((p) => [p.x, p.y]);
function quad(g, a, b, c, d, color, alpha = 1) {
  if (!a || !b || !c || !d) return;
  g.poly(flat([a, b, c, d])).fill({ color, alpha });
}
function faceVisible(nx, ny) {
  const { du, dv } = rotateDir(nx, ny);
  return isStraight() ? dv > 0 : du > 0 || dv > 0;
}
function seg(g, a, b, stroke) {
  if (a && b) g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke(stroke);
}
// ---------- 벽 ----------
// 벽 변(edge): 원래 평면도의 네 변. 시점에 따라 뒤쪽에 온 두 변에만 벽을 세운다.
const EDGES = {
  x0: { at: (t) => [0, t], inward: [1, 0], length: () => PLAN.depth },
  y0: { at: (t) => [t, 0], inward: [0, 1], length: () => PLAN.width },
  xW: { at: (t) => [PLAN.width, t], inward: [-1, 0], length: () => PLAN.depth },
  yD: { at: (t) => [t, PLAN.depth], inward: [0, -1], length: () => PLAN.width }
};

/** 이 변이 지금 뒤쪽 벽인지(벽면이 보는 사람 쪽을 향하는지). */
function edgeBack(edge) {
  const [nx, ny] = EDGES[edge].inward;
  return faceVisible(nx, ny);
}

/** 변 위의 점. t는 변을 따라가는 원래 타일 좌표, inset은 안쪽으로 들어간 거리. */
function ep(edge, t, z = 0, inset = 0) {
  const e = EDGES[edge];
  const [x, y] = e.at(t);
  return iso(x + e.inward[0] * inset, y + e.inward[1] * inset, z);
}

function backWalls(g, palette = { left: 0xEDE8E2, right: 0xF8F6F3, cap: 0xDCD5CC, base: 0xE0D8CE }) {
  const H = PLAN.wallHeight;
  const { left: leftFace, right: rightFace, cap, base } = palette;
  const t = 0.18;
  for (const edge of Object.keys(EDGES)) {
    if (isStraight()) {
      const { du } = rotateDir(...EDGES[edge].inward);
      if (du !== 0) {
        // 정면 시점의 옆벽: 위에서 보이는 벽 윗면 띠만 그린다.
        const L = EDGES[edge].length();
        quad(g, ep(edge, 0, H), ep(edge, L, H), ep(edge, L, H, -t), ep(edge, 0, H, -t), cap);
        quad(g, ep(edge, 0, 0), ep(edge, L, 0), ep(edge, L, H), ep(edge, 0, H), rightFace, 0.0);
        continue;
      }
    }
    if (!edgeBack(edge)) continue;
    const L = EDGES[edge].length();
    const [nx, ny] = EDGES[edge].inward;
    const face = rotateDir(nx, ny).du > 0 ? leftFace : rightFace;
    quad(g, ep(edge, 0), ep(edge, L), ep(edge, L, H), ep(edge, 0, H), face);
    quad(g, ep(edge, 0), ep(edge, L), ep(edge, L, 7), ep(edge, 0, 7), base);
    // 윗면 두께(바깥쪽으로)
    quad(g, ep(edge, -t, H, -t), ep(edge, L + t, H, -t), ep(edge, L + t, H), ep(edge, -t, H), cap);
  }
}

function windowOnEdge(g, edge, t0, t1) {
  const z0 = 26, z1 = 74;
  quad(g, ep(edge, t0, z0), ep(edge, t1, z0), ep(edge, t1, z1), ep(edge, t0, z1), 0xFFFFFF);
  quad(g, ep(edge, t0 + 0.1, z0 + 4), ep(edge, t1 - 0.1, z0 + 4), ep(edge, t1 - 0.1, z1 - 4), ep(edge, t0 + 0.1, z1 - 4), 0xBFE3F6);
  const mid = (t0 + t1) / 2;
  seg(g, ep(edge, mid, z0 + 4), ep(edge, mid, z1 - 4), { color: 0xFFFFFF, width: 3 });
  seg(g, ep(edge, t0 + 0.3, z1 - 10), ep(edge, t0 + 0.9, z0 + 12), { color: 0xFFFFFF, width: 4, alpha: 0.6 });
  quad(g, ep(edge, t0, z0), ep(edge, t1, z0), ep(edge, t1, z0, 0.12), ep(edge, t0, z0, 0.12), 0xE6E0D8);
}

function whiteboard(g, x0, x1, edge = 'y0') {
  quad(g, ep(edge, x0, 30), ep(edge, x1, 30), ep(edge, x1, 76), ep(edge, x0, 76), 0xC9CFD6);
  quad(g, ep(edge, x0 + 0.06, 33), ep(edge, x1 - 0.06, 33), ep(edge, x1 - 0.06, 73), ep(edge, x0 + 0.06, 73), 0xFFFFFF);
  const lines = [[0.15, 0.55, 64, 0x7FB3D5], [0.15, 0.45, 56, 0xE58E7A], [0.6, 0.85, 62, 0x8CCBA6]];
  for (const [u0, u1, z, color] of lines) {
    seg(g, ep(edge, x0 + (x1 - x0) * u0, z), ep(edge, x0 + (x1 - x0) * u1, z), { color, width: 3, cap: 'round' });
  }
  const sticky = [[0.62, 48, 0xF6D27A], [0.74, 48, 0xF4A6B8], [0.86, 48, 0xA9DFC0]];
  for (const [u, z, color] of sticky) {
    const x = x0 + (x1 - x0) * u;
    quad(g, ep(edge, x, z - 8), ep(edge, x + 0.22, z - 8), ep(edge, x + 0.22, z + 4), ep(edge, x, z + 4), color);
  }
}

function elevatorDoors(g, x0, edge = 'y0') {
  for (const dx of [0.1, 1.05]) {
    const a = x0 + dx, b = a + 0.85;
    quad(g, ep(edge, a - 0.05, 0), ep(edge, b + 0.05, 0), ep(edge, b + 0.05, 70), ep(edge, a - 0.05, 70), 0xB8C3CE);
    quad(g, ep(edge, a, 0), ep(edge, b, 0), ep(edge, b, 66), ep(edge, a, 66), 0xDCE3EA);
    seg(g, ep(edge, (a + b) / 2, 0), ep(edge, (a + b) / 2, 66), { color: 0xA9B5C1, width: 1.5 });
    const lamp = ep(edge, (a + b) / 2, 80);
    g.roundRect(lamp.x - 10, lamp.y - 6, 20, 11, 4).fill(0x3E4854);
    g.poly([lamp.x - 4, lamp.y + 2, lamp.x + 4, lamp.y + 2, lamp.x, lamp.y - 4]).fill(dx < 1 ? 0xFFC56B : 0x6B7682);
  }
}

function wallClock(g, x, edge = 'y0') {
  const c = ep(edge, x, 74);
  g.circle(c.x, c.y, 11).fill(0xFFFFFF).stroke({ color: 0xB8C3CE, width: 2 });
  g.moveTo(c.x, c.y).lineTo(c.x, c.y - 7).moveTo(c.x, c.y).lineTo(c.x + 5, c.y + 2).stroke({ color: 0x46505B, width: 1.5 });
}

function wallFrame(g, y, color, edge = 'x0') {
  quad(g, ep(edge, y, 44), ep(edge, y + 0.9, 44), ep(edge, y + 0.9, 74), ep(edge, y, 74), 0xFFFFFF);
  quad(g, ep(edge, y + 0.08, 47), ep(edge, y + 0.82, 47), ep(edge, y + 0.82, 71), ep(edge, y + 0.08, 71), color);
}

/** 변마다 붙는 벽 장식. 그 변이 뒤쪽 벽일 때만 그린다. */
function wallDecor(g) {
  if (edgeBack('x0')) {
    windowOnEdge(g, 'x0', 7.6, 9.6);
    windowOnEdge(g, 'x0', 10.4, 12.6);
    wallFrame(g, 6.2, 0xF6D27A, 'x0');
  }
  if (edgeBack('y0')) {
    whiteboard(g, 7.4, 10.6, 'y0');
    elevatorDoors(g, 12, 'y0');
    wallClock(g, 11.3, 'y0');
    quad(g, ep('y0', 18.6, 60), ep('y0', 19.6, 60), ep('y0', 19.6, 80), ep('y0', 18.6, 80), 0xD6DCE2);
  }
  if (edgeBack('xW')) {
    windowOnEdge(g, 'xW', 8.0, 10.0);
    windowOnEdge(g, 'xW', 11.0, 13.0);
    wallFrame(g, 3.0, 0xA9DFC0, 'xW');
  }
  if (edgeBack('yD')) {
    windowOnEdge(g, 'yD', 1.0, 3.0);
    windowOnEdge(g, 'yD', 3.6, 5.6);
    windowOnEdge(g, 'yD', 8.2, 11.8);
    windowOnEdge(g, 'yD', 15.0, 17.0);
    wallFrame(g, 18.2, 0xF4A6B8, 'yD');
  }
}

// ---------- 유리 칸막이 ----------
function glassPartition(g, from, to, height = 30) {
  const [ax, ay] = from, [bx, by] = to;
  quad(g, iso(ax, ay), iso(bx, by), iso(bx, by, height), iso(ax, ay, height), 0xFFFFFF, 0.42);
  const t0 = iso(ax, ay, height), t1 = iso(bx, by, height);
  g.moveTo(t0.x, t0.y).lineTo(t1.x, t1.y).stroke({ color: 0xC5D0D6, width: 3, cap: 'round' });
  const b0 = iso(ax, ay), b1 = iso(bx, by);
  g.moveTo(b0.x, b0.y).lineTo(b1.x, b1.y).stroke({ color: 0xC5D0D6, width: 2 });
}


export { backWalls, wallDecor, glassPartition };
