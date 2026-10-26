import { PLAN, iso, depthUV, project, rotateTile, rotateDir, isStraight } from './floor-plan.js';

export const FONT = 'Pretendard, "Noto Sans KR", "Noto Sans CJK KR", system-ui, sans-serif';

// ---------- 색 유틸 ----------
function shade(color, amount) {
  const r = (color >> 16) & 255, g = (color >> 8) & 255, b = color & 255;
  const f = (c) => Math.max(0, Math.min(255, Math.round(amount < 0 ? c * (1 + amount) : c + (255 - c) * amount)));
  return (f(r) << 16) | (f(g) << 8) | f(b);
}
const flat = (points) => points.flatMap((p) => [p.x, p.y]);

// PixiJS v8의 arc()는 직전 경로 끝점에서 선을 이어 그리므로, 항상 이 함수로 시작점을 잡는다.
function arcPoints(cx, cy, r, a0, a1, steps = 18) {
  const pts = [];
  for (let i = 0; i <= steps; i += 1) {
    const a = a0 + (a1 - a0) * (i / steps);
    pts.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  return pts;
}
function arcStroke(g, cx, cy, r, a0, a1, stroke) {
  const pts = arcPoints(cx, cy, r, a0, a1);
  g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.stroke(stroke);
}

// ---------- 기본 도형 ----------
function quad(g, a, b, c, d, color, alpha = 1) {
  if (!a || !b || !c || !d) return; // 보이지 않는 면 위의 장식은 건너뛴다
  g.poly(flat([a, b, c, d])).fill({ color, alpha });
}

/** 원래 좌표의 사각형 [x,x+w)×[y,y+d)를 회전 좌표의 사각형으로. */
function rotatedRect(x, y, w, d) {
  const pts = [rotateTile(x, y), rotateTile(x + w, y), rotateTile(x + w, y + d), rotateTile(x, y + d)];
  const us = pts.map((p) => p.u), vs = pts.map((p) => p.v);
  return { u0: Math.min(...us), u1: Math.max(...us), v0: Math.min(...vs), v1: Math.max(...vs) };
}

/** 원래 좌표계에서 법선이 (nx, ny)인 면이 지금 시점에서 보이는지. 보이는 면은 회전 좌표의 +u, +v 면. */
function faceVisible(nx, ny) {
  const { du, dv } = rotateDir(nx, ny);
  if (isStraight()) return dv > 0; // 정면 시점에서는 앞을 보는 면만 보인다
  return du > 0 || dv > 0;
}

const EDGES = {
  x0: { inward: [1, 0] }, y0: { inward: [0, 1] },
  xW: { inward: [-1, 0] }, yD: { inward: [0, -1] }
};
function edgeBack(edge) {
  const [nx, ny] = EDGES[edge].inward;
  return faceVisible(nx, ny);
}

/** 선분 그리기. 점이 없으면(보이지 않는 면) 그리지 않는다. */
function seg(g, a, b, stroke) {
  if (!a || !b) return;
  g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke(stroke);
}

/** 바닥 사각형 [x0,x1)×[y0,y1)을 타일 무늬로 칠한다. */
function floorArea(g, [x0, y0, x1, y1], { kind, colors }) {
  for (let x = x0; x < x1; x += 1) {
    for (let y = y0; y < y1; y += 1) {
      let color = colors[0];
      if (kind === 'checker') color = colors[(x + y) % 2];
      if (kind === 'planks') color = colors[x % 2];
      if (kind === 'carpet') color = colors[(x * 7 + y * 3) % 5 === 0 ? 1 : 0];
      quad(g, iso(x, y), iso(x + 1, y), iso(x + 1, y + 1), iso(x, y + 1), color);
    }
  }
  if (kind === 'planks') {
    // 판자 이음새
    for (let x = x0; x < x1; x += 1) {
      for (let y = y0 + ((x % 2) ? 0.5 : 0); y < y1; y += 1.5) {
        const a = iso(x, y), b = iso(x + 1, y);
        g.moveTo(a.x, a.y).lineTo(b.x, b.y);
      }
    }
    g.stroke({ color: shade(colors[0], -0.08), width: 1, alpha: 0.6 });
  }
  // 방 테두리
  const c = [iso(x0, y0), iso(x1, y0), iso(x1, y1), iso(x0, y1)];
  g.poly(flat(c)).stroke({ color: shade(colors[0], -0.14), width: 1.5, alpha: 0.9 });
}

/**
 * 아이소메트릭 상자. x,y,w,d는 원래 타일 단위, z와 h는 px.
 * 시점 회전에 맞춰 지금 보이는 두 옆면과 윗면만 그린다.
 * 돌려주는 face 함수는 원래 좌표 기준 면(+y 'front', +x 'side') 위의 점을 주고,
 * 그 면이 지금 보이지 않으면 null을 준다(장식 생략).
 */
function box(g, x, y, w, d, h, color, { z = 0, top = null, left = null, right = null, outline = true } = {}) {
  const r = rotatedRect(x, y, w, d);
  const q = (u, v, pz) => project(u, v, z + pz);
  const t = [q(r.u0, r.v0, h), q(r.u1, r.v0, h), q(r.u1, r.v1, h), q(r.u0, r.v1, h)];
  quad(g, q(r.u0, r.v1, 0), q(r.u1, r.v1, 0), q(r.u1, r.v1, h), q(r.u0, r.v1, h), left ?? shade(color, -0.1));
  quad(g, q(r.u1, r.v0, 0), q(r.u1, r.v1, 0), q(r.u1, r.v1, h), q(r.u1, r.v0, h), right ?? shade(color, -0.22));
  quad(g, t[0], t[1], t[2], t[3], top ?? shade(color, 0.12));
  if (outline) {
    g.poly(flat([q(r.u0, r.v1, 0), q(r.u1, r.v1, 0), q(r.u1, r.v0, 0), q(r.u1, r.v0, h), q(r.u0, r.v0, h), q(r.u0, r.v1, h)]))
      .stroke({ color: shade(color, -0.35), width: 1, alpha: 0.35 });
  }
  const p = (px, py, pz) => iso(px, py, z + pz);
  const frontOk = faceVisible(0, 1), sideOk = faceVisible(1, 0);
  return {
    front: (u, v) => frontOk ? p(x + u * w, y + d, v * h) : null, // 원래 +y 면
    side: (u, v) => sideOk ? p(x + w, y + u * d, v * h) : null, // 원래 +x 면
    topAt: (u, v) => p(x + u * w, y + v * d, h),
    frontVisible: frontOk,
    sideVisible: sideOk
  };
}

function shadowEllipse(g, x, y, rx, ry, alpha = 0.12) {
  const c = iso(x, y);
  g.ellipse(c.x, c.y, rx, ry).fill({ color: 0x3B4A55, alpha });
}

function rug(g, cx, cy, rx, ry, color) {
  const c = iso(cx, cy);
  g.ellipse(c.x, c.y, rx, ry).fill(color);
  g.ellipse(c.x, c.y, rx - 8, ry - 4).stroke({ color: 0xFFFFFF, width: 2, alpha: 0.6 });
}


export { shade, flat, arcPoints, arcStroke, quad, rotatedRect, faceVisible, edgeBack, seg, floorArea, box, shadowEllipse, rug };
