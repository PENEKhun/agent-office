// 사무실 가구 도형. 평면 시점과 공통 도형은 office-art-shapes.js에서 가져온다.
import { iso, depthUV } from './floor-plan.js';
import { arcPoints, arcStroke, box, edgeBack, quad, rotatedRect, seg, shade, shadowEllipse, rug } from './office-art-shapes.js';
export { FONT } from './office-art-shapes.js';

// ---------- 가구 ----------
// 벽에 붙은 긴 가구는 얇은 축 기준으로만 깊이를 잡아야 앞에 선 캐릭터를 가리지 않는다.
function piece(layer, x, y, w, d, draw, { wall = null } = {}) {
  const g = new layer.PIXI.Graphics();
  draw(g);
  const r = rotatedRect(x, y, w, d);
  if (wall) {
    // 긴 축은 앞쪽 끝이 아니라 뒤쪽 끝으로, 얇은 축만 앞쪽 끝으로 깊이를 잡는다.
    const thinU = (r.u1 - r.u0) <= (r.v1 - r.v0);
    g.zIndex = thinU ? depthUV(r.u1 - 0.5, r.v0) : depthUV(r.u0, r.v1 - 0.5);
  } else {
    g.zIndex = depthUV(r.u1 - 0.5, r.v1 - 0.5);
  }
  layer.add(g);
  return g;
}

function plant(layer, x, y, scale = 1) {
  piece(layer, x - 0.25, y - 0.25, 0.5, 0.5, (g) => {
    shadowEllipse(g, x, y, 18 * scale, 7 * scale);
    box(g, x - 0.22 * scale, y - 0.22 * scale, 0.44 * scale, 0.44 * scale, 18 * scale, 0xE9E4DC, { outline: false });
    const c = iso(x, y, 18 * scale);
    const leaf = [0x7FC79A, 0x6DBA8A, 0x93D3A8];
    [[0, -22, 15], [-11, -12, 12], [11, -13, 12], [-5, -30, 10], [7, -29, 10]].forEach(([dx, dy, r], i) => {
      g.circle(c.x + dx * scale, c.y + dy * scale, r * scale).fill(leaf[i % 3]);
    });
    g.circle(c.x - 4 * scale, c.y - 27 * scale, 4 * scale).fill({ color: 0xFFFFFF, alpha: 0.25 });
  });
}

function chair(layer, x, y, color = 0x8FA7B8, facing = 'back') {
  piece(layer, x - 0.2, y - 0.2, 0.4, 0.4, (g) => {
    shadowEllipse(g, x, y, 12, 5);
    box(g, x - 0.2, y - 0.2, 0.4, 0.4, 14, color, { outline: false });
    if (facing === 'back') box(g, x - 0.2, y + 0.12, 0.4, 0.08, 18, shade(color, -0.05), { z: 14, outline: false });
    else box(g, x + 0.12, y - 0.2, 0.08, 0.4, 18, shade(color, -0.05), { z: 14, outline: false });
  });
}

function bookshelfAlongBackWall(layer, x, y, w) {
  piece(layer, x, y, w, 0.55, (g) => {
    // 컷어웨이: 붙은 벽이 앞쪽으로 오면 낮게 잘라서 방 안을 가리지 않게
    const b = box(g, x, y, w, 0.55, edgeBack('y0') ? 74 : 20, 0xC99D72, { left: 0xB98C63 });
    const spines = [0xE58E7A, 0x7FB3D5, 0xF2C66D, 0x8CCBA6, 0xB59BD8, 0xF4A6B8, 0x6E9BC5];
    for (let row = 0; row < 3; row += 1) {
      const v0 = 0.1 + row * 0.31, v1 = v0 + 0.24;
      let u = 0.04, i = row * 3;
      while (u < 0.95) {
        const bw = 0.025 + ((i * 37) % 5) * 0.006;
        const hv = v1 - ((i * 13) % 3) * 0.03;
        const color = spines[i % spines.length];
        quad(g, b.front(u, v0), b.front(Math.min(0.96, u + bw), v0), b.front(Math.min(0.96, u + bw), hv), b.front(u, hv), color);
        u += bw + 0.008; i += 1;
        if (i % 9 === 0) u += 0.04;
      }
      seg(g, b.front(0, v0 - 0.02), b.front(1, v0 - 0.02), { color: 0x9C7350, width: 2 });
    }
  }, { wall: 'back' });
}

function bookshelfAlongLeftWall(layer, x, y, d) {
  piece(layer, x, y, 0.55, d, (g) => {
    const b = box(g, x, y, 0.55, d, edgeBack('x0') ? 74 : 20, 0xC99D72, { right: 0xA67B55 });
    const spines = [0x7FB3D5, 0xF2C66D, 0xE58E7A, 0xB59BD8, 0x8CCBA6];
    for (let row = 0; row < 3; row += 1) {
      const v0 = 0.1 + row * 0.31, v1 = v0 + 0.24;
      let u = 0.05, i = row * 2;
      while (u < 0.94) {
        const bw = 0.03 + ((i * 29) % 4) * 0.008;
        quad(g, b.side(u, v0), b.side(Math.min(0.95, u + bw), v0), b.side(Math.min(0.95, u + bw), v1 - (i % 3) * 0.03), b.side(u, v1 - (i % 3) * 0.03), spines[i % spines.length]);
        u += bw + 0.01; i += 1;
      }
    }
  }, { wall: 'left' });
}

// 화면 내용: 'code'는 코드 줄, 'paper'는 문서 줄. face는 box()가 돌려준 면 함수.
function screenContent(g, face, content, seed = 0) {
  if (!face(0.5, 0.5)) return; // 화면이 반대쪽을 보고 있으면 내용 없음
  if (content === 'code') {
    const cols = [0x7DD3FC, 0xF9A8D4, 0xFDE68A, 0x86EFAC];
    const rows = [[0.1, 0.45], [0.18, 0.62], [0.18, 0.5], [0.1, 0.38], [0.26, 0.7]];
    rows.forEach(([u0, len], i) => {
      const v = 0.78 - i * 0.14;
      const a = face(u0, v), b = face(Math.min(0.92, u0 + len * (0.7 + ((seed + i) % 3) * 0.15)), v);
      g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ color: cols[(seed + i) % cols.length], width: 1.6, cap: 'round' });
    });
  } else if (content === 'paper') {
    for (let i = 0; i < 3; i += 1) {
      const v = 0.72 - i * 0.2;
      const a = face(0.2, v), b = face(0.8 - (i % 2) * 0.2, v);
      g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ color: 0x94A3B8, width: 1.2, cap: 'round' });
    }
  } else if (content === 'map') {
    const c = face(0.5, 0.5);
    g.ellipse(c.x - 3, c.y - 2, 5, 3).fill(0x86EFAC);
    g.ellipse(c.x + 4, c.y + 2, 3.5, 2.2).fill(0x86EFAC);
    const p = face(0.75, 0.75);
    g.circle(p.x, p.y, 2).fill(0xF87171);
  }
}

function desk(layer, x, y, { w = 1.5, d = 0.8, screen = 0x8CCBF5, laptop = false, content = null, seed = 0, papers = false } = {}) {
  piece(layer, x, y, w, d, (g) => {
    shadowEllipse(g, x + w / 2, y + d / 2, 40 * w, 12 * w, 0.08);
    box(g, x, y, w, d, 26, 0xF7F7F5, { left: 0xE3E3DF, right: 0xD3D4CF });
    if (laptop) {
      box(g, x + w * 0.3, y + 0.2, 0.55, 0.38, 3, 0xBFC7CF, { z: 26, outline: false });
      const s = box(g, x + w * 0.3, y + 0.16, 0.55, 0.05, 22, 0x56616D, { z: 29, outline: false });
      quad(g, s.front(0.08, 0.12), s.front(0.92, 0.12), s.front(0.92, 0.9), s.front(0.08, 0.9), screen);
      if (content) screenContent(g, s.front, content, seed);
      if (papers) {
        // 서류 더미와 편지함
        box(g, x + 0.08, y + 0.18, 0.32, 0.4, 7, 0xFFFFFF, { z: 26, outline: false, left: 0xF1F5F9, right: 0xE2E8F0 });
        box(g, x + w - 0.42, y + 0.2, 0.34, 0.38, 9, 0xF0766A, { z: 26, outline: false });
        box(g, x + w - 0.38, y + 0.24, 0.26, 0.3, 4, 0xFFFFFF, { z: 30, outline: false });
      }
    } else {
      box(g, x + w * 0.42, y + 0.32, 0.16, 0.12, 10, 0x6B7682, { z: 26, outline: false });
      const m = box(g, x + w * 0.18, y + 0.3, w * 0.64, 0.06, 30, 0x46505B, { z: 34, outline: false });
      quad(g, m.front(0.05, 0.1), m.front(0.95, 0.1), m.front(0.95, 0.9), m.front(0.05, 0.9), content === 'code' ? 0x1E293B : screen);
      if (content) screenContent(g, m.front, content, seed);
      seg(g, m.front(0.15, 0.75), m.front(0.35, 0.75), { color: 0xFFFFFF, width: 2, alpha: 0.45 });
      box(g, x + w * 0.3, y + 0.58, w * 0.4, 0.14, 2, 0xE1E4E8, { z: 26, outline: false });
    }
  });
}

function serverRack(layer, x, y, { againstWall = null } = {}) {
  piece(layer, x, y, 1, 0.8, (g) => {
    shadowEllipse(g, x + 0.5, y + 0.4, 40, 12, 0.12);
    const rackHeight = againstWall && !edgeBack(againstWall) ? 26 : 84;
    const r = box(g, x, y, 1, 0.8, rackHeight, 0x4E5A68, { left: 0x5A6776, right: 0x3E4854, top: 0x6E7B89 });
    for (let row = 0; row < 7; row += 1) {
      const v = 0.12 + row * 0.11;
      quad(g, r.front(0.08, v), r.front(0.92, v), r.front(0.92, v + 0.08), r.front(0.08, v + 0.08), 0x3A434E);
      [0.16, 0.24].forEach((u, i) => {
        const c = r.front(u, v + 0.04);
        if (c) g.circle(c.x, c.y, 1.8).fill((row + i) % 3 === 0 ? 0x6FE3A5 : (row % 2 ? 0x7CC8FF : 0x6FE3A5));
      });
    }
  });
}

function meetingTable(layer, x, y, w, d) {
  piece(layer, x, y, w, d, (g) => {
    shadowEllipse(g, x + w / 2, y + d / 2, 46 * w / 2, 16, 0.1);
    box(g, x + 0.2, y + 0.2, 0.2, d - 0.4, 22, 0xC9CCD2, { outline: false });
    box(g, x + w - 0.4, y + 0.2, 0.2, d - 0.4, 22, 0xC9CCD2, { outline: false });
    box(g, x, y, w, d, 6, 0xFFFFFF, { z: 22, left: 0xE9E9EC, right: 0xDADBE0 });
    // 노트북 두 대와 컵
    box(g, x + 0.5, y + 0.3, 0.4, 0.3, 2, 0xC3CAD2, { z: 28, outline: false });
    box(g, x + w - 1, y + 0.6, 0.4, 0.3, 2, 0xC3CAD2, { z: 28, outline: false });
    const cup = iso(x + w / 2, y + d / 2, 34);
    g.roundRect(cup.x - 4, cup.y - 4, 8, 9, 2).fill(0xF5A88E);
  });
}

function sofa(layer, x, y, w) {
  piece(layer, x, y, w, 0.9, (g) => {
    shadowEllipse(g, x + w / 2, y + 0.5, 30 * w, 14, 0.12);
    const base = 0x8FB7E3;
    box(g, x, y, w, 0.9, 14, base);
    box(g, x, y, w, 0.25, 34, shade(base, -0.06));
    box(g, x, y, 0.22, 0.9, 24, shade(base, -0.04));
    box(g, x + w - 0.22, y, 0.22, 0.9, 24, shade(base, -0.04));
    const cushions = [0xF6D27A, 0xF4A6B8, 0xA9DFC0];
    for (let i = 0; i < 3; i += 1) {
      box(g, x + 0.35 + i * ((w - 0.7) / 3), y + 0.25, (w - 0.7) / 3 - 0.06, 0.6, 6, 0xA9C9EC, { z: 14, outline: false });
    }
    box(g, x + 0.3, y + 0.25, 0.3, 0.12, 14, cushions[0], { z: 14, outline: false });
    box(g, x + w - 0.6, y + 0.25, 0.3, 0.12, 14, cushions[1], { z: 14, outline: false });
  }, { wall: 'back' });
}

function coffeeCorner(layer, x, y) {
  piece(layer, x, y, 1.3, 0.7, (g) => {
    // 원목 카페 카운터
    box(g, x, y, 1.3, 0.7, 30, 0xC8956A, { top: 0xF3E4D2, left: 0xB98557, right: 0xA6744A });
    // 빨간 에스프레소 머신 + 크롬 윗면
    const m = box(g, x + 0.12, y + 0.1, 0.62, 0.45, 26, 0xE4572E, { z: 30, top: 0xD9DEE3, left: 0xE4572E, right: 0xC2410C });
    const gauge = m.front(0.3, 0.75);
    if (gauge) g.circle(gauge.x, gauge.y, 3.2).fill(0xFFFFFF).stroke({ color: 0x9CA3AF, width: 1 });
    [0.3, 0.7].forEach((u) => {
      const head = m.front(u, 0.38);
      if (!head) return;
      g.roundRect(head.x - 4, head.y - 1, 8, 4, 1.5).fill(0x9CA3AF);
      g.roundRect(head.x - 3, head.y + 6, 6, 6, 1.5).fill(0xFFFFFF).stroke({ color: 0xD6C3AE, width: 1 });
    });
    // 머신 위 컵 더미
    [0.25, 0.5].forEach((u) => {
      const c = m.topAt(u, 0.5);
      g.roundRect(c.x - 3.5, c.y - 6, 7, 6, 1.5).fill(0xFFFFFF).stroke({ color: 0xE5E7EB, width: 0.8 });
    });
    // 원두 통
    box(g, x + 0.9, y + 0.18, 0.22, 0.22, 14, 0xFDF6EC, { z: 30, outline: false });
    box(g, x + 0.9, y + 0.18, 0.22, 0.22, 6, 0x6B3F22, { z: 30, outline: false });
    // 김 나는 머그 두 개
    [[1.0, 0.52, 0xFFFFFF], [1.18, 0.5, 0xF4A6B8]].forEach(([dx, dy, col]) => {
      const c = iso(x + dx, y + dy, 30);
      g.roundRect(c.x - 4, c.y - 7, 8, 7, 2).fill(col).stroke({ color: 0xD6C3AE, width: 0.8 });
      g.moveTo(c.x - 1.5, c.y - 9).quadraticCurveTo(c.x - 3.5, c.y - 13, c.x - 1.5, c.y - 17)
        .stroke({ color: 0xFFFFFF, width: 1.6, cap: 'round', alpha: 0.9 });
      g.moveTo(c.x + 1.5, c.y - 9).quadraticCurveTo(c.x - 0.5, c.y - 13, c.x + 1.5, c.y - 17)
        .stroke({ color: 0xFFFFFF, width: 1.6, cap: 'round', alpha: 0.9 });
    });
  });
  // 카운터 앞 입간판: 커피잔 그림
  piece(layer, x - 0.35, y + 0.85, 0.3, 0.3, (g) => {
    const b = iso(x - 0.2, y + 1.0, 0);
    g.poly([b.x - 9, b.y, b.x - 6, b.y - 26, b.x + 6, b.y - 26, b.x + 9, b.y]).fill(0xA47551);
    g.roundRect(b.x - 7, b.y - 24, 14, 20, 2).fill(0x3F3F46);
    g.roundRect(b.x - 4, b.y - 15, 7, 6, 1.5).fill(0xFFFFFF);
    g.circle(b.x + 3.8, b.y - 12, 1.8).stroke({ color: 0xFFFFFF, width: 1.2 });
    g.moveTo(b.x - 1.5, b.y - 17).quadraticCurveTo(b.x - 3, b.y - 19.5, b.x - 1.5, b.y - 22).stroke({ color: 0xFFFFFF, width: 1.1, cap: 'round' });
    g.moveTo(b.x + 1, b.y - 17).quadraticCurveTo(b.x - 0.5, b.y - 19.5, b.x + 1, b.y - 22).stroke({ color: 0xFFFFFF, width: 1.1, cap: 'round' });
  });
}

function waterCooler(layer, x, y) {
  piece(layer, x - 0.2, y - 0.2, 0.4, 0.4, (g) => {
    shadowEllipse(g, x, y, 12, 5);
    box(g, x - 0.2, y - 0.2, 0.4, 0.4, 34, 0xF2F4F6);
    const top = iso(x, y, 34);
    g.roundRect(top.x - 9, top.y - 24, 18, 22, 7).fill({ color: 0x9CD3F5, alpha: 0.9 });
    g.roundRect(top.x - 5, top.y - 21, 4, 14, 2).fill({ color: 0xFFFFFF, alpha: 0.5 });
  });
}

function globe(layer, x, y) {
  piece(layer, x - 0.25, y - 0.25, 0.5, 0.5, (g) => {
    shadowEllipse(g, x, y, 14, 5);
    const base = iso(x, y, 0), top = iso(x, y, 40);
    g.moveTo(base.x, base.y).lineTo(top.x, top.y + 14).stroke({ color: 0xB89B7A, width: 3 });
    g.ellipse(base.x, base.y, 9, 4).fill(0xB89B7A);
    g.circle(top.x, top.y, 15).fill(0x7EC8E3);
    g.ellipse(top.x - 4, top.y - 3, 7, 5).fill(0x8CCBA6);
    g.ellipse(top.x + 6, top.y + 5, 5, 3).fill(0x8CCBA6);
    arcStroke(g, top.x, top.y, 18, -2.4, 0.8, { color: 0xB89B7A, width: 2 });
  });
}

export const furnitureHelpers = { piece, plant, chair, bookshelfAlongBackWall, bookshelfAlongLeftWall, meetingTable, serverRack, desk, screenContent, globe, sofa, coffeeCorner, waterCooler, box, shadowEllipse, rug, iso, quad, seg };
