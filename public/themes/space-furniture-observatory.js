function observatory(layer, { piece, box, iso, shadowEllipse, seg }) {
  piece(layer, 0.2, 7.25, 5.5, 6.4, (g) => {
    box(g, 0.25, 7.35, 0.7, 5.9, 27, 0x1D3C53, { top: 0x38677C, left: 0x173247 });
    for (const y of [8.0, 9.8, 11.6, 13.0]) {
      const p = iso(0.58, y, 39);
      g.roundRect(p.x - 12, p.y - 8, 22, 16, 4).fill(0x0E2031).stroke({ color: 0x54BED0, width: 1.4 });
      g.circle(p.x - 3, p.y, 3).fill(0x75DDE8);
    }
    shadowEllipse(g, 3.7, 10.5, 40, 12, 0.2);
    box(g, 3.15, 10.05, 1.1, 0.9, 22, 0x294C60, { top: 0x548398 });
    const base = iso(3.7, 10.5, 25), lens = iso(4.55, 9.75, 63);
    seg(g, base, lens, { color: 0xB7CDD3, width: 5 });
    g.ellipse(lens.x, lens.y, 16, 9).fill(0x18374B).stroke({ color: 0x75DBE5, width: 3 });
    g.ellipse(lens.x, lens.y, 8, 4).fill({ color: 0x70CDE0, alpha: 0.8 });
    for (let i = 0; i < 5; i += 1) {
      const x = iso(2.9 + i * 0.38, 8.25 + i % 2 * 0.35, 23);
      g.circle(x.x, x.y, 2).fill(i % 2 ? 0xA9DCEC : 0xEAC76A);
    }
    for (const y of [8.4, 12.7]) {
      const a = iso(1.3, y, 26), b = iso(2.7, y, 26);
      seg(g, a, b, { color: 0x5BA2B6, width: 2 });
    }
  });
}

function restModule(layer, { piece, box, iso, shadowEllipse, plant }) {
  piece(layer, 7.45, 11.15, 3.2, 1.2, (g) => {
    shadowEllipse(g, 9.05, 11.75, 64, 19, 0.18);
    box(g, 7.55, 11.25, 3.0, 1.0, 15, 0xC77C63, { top: 0xE6A17D, left: 0x9D5D52, right: 0xAB6657 });
    box(g, 7.55, 11.25, 0.3, 1.0, 25, 0xE9A477, { z: 15, outline: false });
    box(g, 10.25, 11.25, 0.3, 1.0, 25, 0xE9A477, { z: 15, outline: false });
    box(g, 8.0, 11.48, 0.72, 0.55, 7, 0xF4C58B, { z: 15, outline: false });
    box(g, 9.05, 11.48, 0.72, 0.55, 7, 0xE8B7A7, { z: 15, outline: false });
    box(g, 10.0, 11.48, 0.25, 0.55, 7, 0xF6D49B, { z: 15, outline: false });
  });
  piece(layer, 11.15, 11.05, 1.25, 0.85, (g) => {
    box(g, 11.15, 11.05, 1.25, 0.85, 25, 0x7A554E, { top: 0xD99A6C });
    const c = iso(11.78, 11.48, 29);
    g.roundRect(c.x - 15, c.y - 19, 30, 18, 7).fill(0x2C4551).stroke({ color: 0xE9BB7B, width: 2 });
    g.circle(c.x, c.y - 11, 4).fill(0x67D5D5);
    g.rect(c.x - 9, c.y - 3, 18, 2).fill(0xDDEEF0);
  });
  piece(layer, 12.0, 12.25, 0.65, 0.7, (g) => {
    box(g, 12.0, 12.25, 0.65, 0.7, 25, 0x557B73, { top: 0x8FC7A2 });
    const c = iso(12.32, 12.58, 25);
    g.roundRect(c.x - 8, c.y - 17, 16, 12, 5).fill(0xE7D8B7).stroke({ color: 0xB48B64, width: 1.2 });
    g.moveTo(c.x - 5, c.y - 20).quadraticCurveTo(c.x - 7, c.y - 25, c.x - 4, c.y - 27).stroke({ color: 0xFFF2C7, width: 1.4 });
  });
  plant(layer, 7.65, 13.35, 0.9);
  plant(layer, 10.9, 13.35, 0.8);
}

export function drawObservatoryFurniture(layer, helpers) {
  observatory(layer, helpers);
  restModule(layer, helpers);
}
