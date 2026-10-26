function dataArchive(layer, { piece, box, iso, shadowEllipse, quad }) {
  piece(layer, 0.45, 0.35, 0.75, 4.8, (g) => {
    box(g, 0.45, 0.35, 0.75, 4.8, 58, 0x21445C, { top: 0x37627D, left: 0x18364D });
    for (let row = 0; row < 4; row += 1) {
      for (let col = 0; col < 5; col += 1) {
        const x = 0.53 + row * 0.01, y = 0.55 + col * 0.88;
        box(g, x, y, 0.33, 0.34, 6 + ((row + col) % 3) * 2, [0x52C4D7, 0xA582E8, 0xE6B95E][(row + col) % 3], { z: 20 + row * 9, outline: false });
      }
    }
  }, { wall: 'left' });
  piece(layer, 1.1, 0.5, 4.4, 0.65, (g) => {
    box(g, 1.1, 0.5, 4.4, 0.65, 54, 0x21445C, { top: 0x37627D, left: 0x18364D });
    for (let col = 0; col < 10; col += 1) {
      box(g, 1.24 + col * 0.4, 0.62, 0.27, 0.32, 10 + col % 3 * 3, [0x52C4D7, 0xA582E8, 0xE6B95E][col % 3], { z: 19 + col % 2 * 13, outline: false });
    }
  }, { wall: 'back' });
  piece(layer, 2.1, 2.55, 2.6, 1.7, (g) => {
    shadowEllipse(g, 3.4, 3.4, 52, 15, 0.18);
    box(g, 2.1, 2.55, 2.6, 1.7, 18, 0x24455A, { top: 0x3F6878 });
    [[2.55, 2.9, 0x69D4E3], [3.5, 3.1, 0xC19BF1], [3.0, 3.7, 0xF0C368]].forEach(([x, y, color]) => {
      const c = iso(x, y, 21);
      g.poly([c.x, c.y - 11, c.x + 10, c.y - 5, c.x, c.y + 1, c.x - 10, c.y - 5]).fill({ color, alpha: 0.88 });
      g.poly([c.x - 10, c.y - 5, c.x, c.y + 1, c.x, c.y + 13, c.x - 10, c.y + 7]).fill({ color, alpha: 0.55 });
      g.poly([c.x + 10, c.y - 5, c.x, c.y + 1, c.x, c.y + 13, c.x + 10, c.y + 7]).fill({ color, alpha: 0.7 });
    });
  });
}

function briefingRoom(layer, { piece, box, iso, chair, shadowEllipse, seg }) {
  piece(layer, 7.1, 1.0, 3.9, 2.6, (g) => {
    shadowEllipse(g, 9.05, 2.35, 69, 22, 0.18);
    box(g, 8.3, 1.7, 1.5, 1.2, 20, 0x153950, { top: 0x5DBFD0, left: 0x234A62, right: 0x1C3A52 });
    const c = iso(9.05, 2.3, 23);
    g.ellipse(c.x, c.y, 50, 22).fill({ color: 0x58C6D9, alpha: 0.7 }).stroke({ color: 0xB6F4F3, width: 2 });
    g.ellipse(c.x, c.y, 37, 15).stroke({ color: 0xD4F7EF, width: 1.2, alpha: 0.8 });
    for (let i = 0; i < 7; i += 1) {
      const x = c.x - 25 + i * 8;
      g.circle(x, c.y - Math.sin(i * 0.8) * 6, 1.7).fill(0xE5F9FF);
      if (i) seg(g, { x: x - 8, y: c.y - Math.sin((i - 1) * 0.8) * 6 }, { x, y: c.y - Math.sin(i * 0.8) * 6 }, { color: 0xC2ECF4, width: 1, alpha: 0.7 });
    }
  });
  [[7.8, 3.65], [9.0, 3.85], [10.3, 3.65], [8.0, 1.15], [10.2, 1.15]].forEach(([x, y]) => chair(layer, x, y, 0x4C91AA, 'side'));
}

import { depthOf } from '../floor-plan.js';

function dockingGate(layer, helpers) {
  const { piece, iso } = helpers;
  piece(layer, 12.12, 0.15, 1.7, 1.45, (g) => {
    const c = iso(13, 1.2, 0);
    g.ellipse(c.x, c.y - 3, 43, 20).fill({ color: 0x0A1724, alpha: 0.5 });
    g.ellipse(c.x, c.y - 13, 32, 16).fill(0x11283B).stroke({ color: 0x76D4E2, width: 5 });
    g.ellipse(c.x, c.y - 13, 23, 11).stroke({ color: 0x4F8FA6, width: 3 });
    g.ellipse(c.x, c.y - 13, 14, 6).fill({ color: 0x76D4E2, alpha: 0.2 });
  });
  const lights = [];
  for (const [x, color] of [[12.25, 0xFF675F], [13.75, 0xF8C34E]]) {
    const p = iso(x, 0.2, 42);
    const light = new layer.PIXI.Graphics().circle(0, 0, 4).fill(color);
    light.position.set(p.x, p.y);
    light.zIndex = depthOf(x, 0.2) + 2;
    layer.add(light);
    lights.push(light);
  }
  return { tick(now, overtime) { lights.forEach((light, i) => { light.alpha = overtime ? ((Math.floor(now / 320) + i) % 2 ? 0.2 : 1) : 0.78; }); } };
}

export function drawCommandFurniture(layer, helpers) {
  dataArchive(layer, helpers);
  briefingRoom(layer, helpers);
  return dockingGate(layer, helpers);
}
