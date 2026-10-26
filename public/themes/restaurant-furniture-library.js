export function drawRecipeRooms(layer, helpers) {
  const { bookshelfAlongBackWall, bookshelfAlongLeftWall, piece, box, chair, meetingTable, iso, shadowEllipse } = helpers;
  bookshelfAlongBackWall(layer, 0.55, 0, 4.9);
  bookshelfAlongLeftWall(layer, 0, 0.8, 4.3);
  piece(layer, 2.0, 2.0, 2.4, 1.3, (g) => {
    shadowEllipse(g, 3.2, 2.7, 48, 14, 0.1);
    box(g, 2, 2, 2.4, 1.3, 22, 0x9C704E, { top: 0xD7B58D });
    box(g, 2.55, 2.35, 0.85, 0.6, 4, 0xF5E5C7, { z: 22, outline: false });
    box(g, 3.45, 2.35, 0.55, 0.6, 4, 0xF5E5C7, { z: 22, outline: false });
    [0, 1, 2].forEach((index) => {
      const y = 2.42 + index * 0.14, a = iso(2.65, y, 26), b = iso(3.25, y, 26);
      const c = iso(3.53, y, 26), d = iso(3.9, y, 26);
      g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ color: 0x9D7655, width: 1 });
      g.moveTo(c.x, c.y).lineTo(d.x, d.y).stroke({ color: 0x9D7655, width: 1 });
    });
  });
  [0xC56B4B, 0xD9A242, 0x6B9C65].forEach((color, index) => {
    const x = 0.85 + index * 0.5;
    piece(layer, x, 4.2, 0.32, 0.32, (g) => {
      const b = box(g, x, 4.2, 0.32, 0.32, 10, 0xE7D8C2, { outline: false });
      box(g, x + 0.03, 4.24, 0.26, 0.24, 8, color, { z: 10, outline: false });
      const lid = b.topAt(0.5, 0.5);
      if (lid) g.circle(lid.x, lid.y, 2).fill(0xF8EACD);
    });
  });

  piece(layer, 7.0, 1.0, 5.3, 2.0, (g) => {
    shadowEllipse(g, 9.65, 2.0, 90, 20, 0.1);
    box(g, 7.35, 1.35, 0.35, 1.3, 20, 0x9A704F, { outline: false });
    box(g, 11.6, 1.35, 0.35, 1.3, 20, 0x9A704F, { outline: false });
    box(g, 7.0, 1.0, 5.3, 2.0, 8, 0xA8764D, { z: 20, top: 0xD6AE7B, left: 0x986745, right: 0x875A3D });
    box(g, 8.0, 1.35, 1.1, 0.85, 2, 0xFFF8E8, { z: 28, outline: false });
    box(g, 10.2, 1.35, 1.15, 0.85, 2, 0xFFF8E8, { z: 28, outline: false });
    [0, 1, 2].forEach((index) => {
      const y = 1.55 + index * 0.18, a = iso(8.15, y, 31), b = iso(8.9, y, 31);
      g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ color: index === 0 ? 0xC56B4B : 0xBAA184, width: index === 0 ? 2 : 1 });
    });
    [0, 1].forEach((index) => {
      const y = 1.57 + index * 0.2, a = iso(10.35, y, 31), b = iso(11.15, y, 31);
      g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ color: 0xBAA184, width: 1 });
    });
  });
  meetingTable(layer, 8.0, 3.0, 4.4, 1.2);
  [7.8, 9.4, 11.0, 12.6].forEach((x) => chair(layer, x, 4.45, 0xB78261));
  piece(layer, 12.55, 1.45, 0.45, 0.45, (g) => {
    const p = iso(12.78, 1.68, 30);
    g.roundRect(p.x - 12, p.y - 14, 24, 20, 4).fill(0xF6E7CE).stroke({ color: 0xA37B59, width: 2 });
    g.moveTo(p.x - 7, p.y - 7).lineTo(p.x + 7, p.y - 7).stroke({ color: 0xBE7651, width: 2 });
    g.moveTo(p.x - 6, p.y - 1).lineTo(p.x + 6, p.y - 1).stroke({ color: 0x8A7058, width: 1 });
  }, { wall: 'back' });
}
