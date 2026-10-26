function reactorRoom(layer, { piece, box, iso, shadowEllipse, seg }) {
  piece(layer, 14.35, 0.35, 5.2, 5.1, (g) => {
    for (const x of [14.7, 19.3]) {
      const p0 = iso(x, 0.5, 8), p1 = iso(x, 5.1, 8);
      seg(g, p0, p1, { color: 0x47728A, width: 5 });
      for (let y = 1; y < 5; y += 1.1) {
        const p = iso(x, y, 8);
        g.circle(p.x, p.y, 4).fill(0x2E5269).stroke({ color: 0x65BBD0, width: 1.5 });
      }
    }
    for (const y of [1.0, 4.8]) {
      const a = iso(15.0, y, 10), b = iso(18.9, y, 10);
      seg(g, a, b, { color: 0x456B7D, width: 4 });
    }
    shadowEllipse(g, 17.2, 3.0, 62, 22, 0.28);
    box(g, 16.0, 1.65, 2.3, 2.7, 24, 0x18384D, { top: 0x245D70, left: 0x17374C, right: 0x102A3C });
    const c = iso(17.15, 3.0, 37);
    g.ellipse(c.x, c.y, 21, 31).fill({ color: 0x51D3E0, alpha: 0.3 }).stroke({ color: 0x75EFF0, width: 3 });
    g.ellipse(c.x, c.y, 12, 24).fill({ color: 0xB5FCF2, alpha: 0.48 });
    g.ellipse(c.x, c.y, 35, 10).stroke({ color: 0x4FBDCE, width: 2, alpha: 0.8 });
    for (let i = 0; i < 5; i += 1) g.circle(c.x - 8 + i * 4, c.y - 11 + (i % 2) * 5, 1.5).fill(0xECFFFF);
  });
}

function engineeringBay(layer, { piece, box, iso, desk, chair, shadowEllipse, seg }) {
  [6.6, 8.5, 10.4, 12.3].forEach((x, i) => {
    desk(layer, x, 5.65, { screen: [0x54D9E3, 0x6EB6F6, 0xF6C35B, 0xA88BEA][i], content: 'code', seed: i });
    chair(layer, x + 0.75, 7.0, 0x557C92);
    desk(layer, x, 8.15, { screen: [0xA88BEA, 0x54D9E3, 0x6EB6F6, 0xF6C35B][i], content: 'code', seed: i + 3 });
    chair(layer, x + 0.75, 9.55, 0x557C92);
  });
  piece(layer, 12.3, 6.0, 1.0, 1.1, (g) => {
    shadowEllipse(g, 12.8, 6.55, 28, 10, 0.18);
    box(g, 12.35, 6.25, 0.9, 0.8, 19, 0x31566B, { top: 0x51849A });
    const a = iso(12.75, 6.5, 48), b = iso(13.15, 6.65, 64), c = iso(13.45, 6.4, 70);
    seg(g, a, b, { color: 0x9CB9C5, width: 5 });
    seg(g, b, c, { color: 0xB5D2D9, width: 4 });
    g.circle(c.x, c.y, 5).fill(0x58CADA).stroke({ color: 0xD5F7FA, width: 1.5 });
  });
}

function controlConsole(layer, { piece, box, iso, shadowEllipse, seg }) {
  piece(layer, 14.4, 7.45, 5.1, 1.1, (g) => {
    shadowEllipse(g, 17, 8.05, 92, 20, 0.2);
    box(g, 14.6, 7.65, 4.8, 0.72, 24, 0x203D51, { top: 0x35758A, left: 0x173347, right: 0x142E42 });
    const screens = [[15.1, 7.95], [16.5, 7.95], [17.9, 7.95]];
    screens.forEach(([x, y], index) => {
      const p = iso(x, y, 43);
      g.roundRect(p.x - 22, p.y - 15, 44, 24, 4).fill(0x102436).stroke({ color: 0x65C8D6, width: 1.5 });
      for (let line = 0; line < 3; line += 1) {
        const yy = p.y - 9 + line * 5;
        seg(g, { x: p.x - 14, y: yy }, { x: p.x + 11 - (index + line) * 2, y: yy }, { color: [0x5BD5E1, 0x83B9F3, 0xEAC15E][(line + index) % 3], width: 1.2 });
      }
    });
    const antenna = iso(19.2, 7.8, 0), tip = iso(19.2, 7.8, 64);
    seg(g, antenna, tip, { color: 0xA3C7D2, width: 3 });
    g.circle(tip.x, tip.y, 5).fill(0x56D8E2).stroke({ color: 0xD1FAFF, width: 1.5 });
    g.ellipse(tip.x, tip.y, 13, 9).stroke({ color: 0x73D9E4, width: 1.5 });
    g.ellipse(tip.x, tip.y, 21, 15).stroke({ color: 0x73D9E4, width: 1.2, alpha: 0.65 });
  });
}

export function drawSystemsFurniture(layer, helpers) {
  reactorRoom(layer, helpers);
  engineeringBay(layer, helpers);
  controlConsole(layer, helpers);
}
