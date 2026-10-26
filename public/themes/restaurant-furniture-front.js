export function drawServiceRooms(layer, helpers) {
  const { piece, box, chair, sofa, coffeeCorner, plant, iso, shadowEllipse } = helpers;
  [0xC95842, 0xE3A33E, 0x5F9B61, 0xD95F55, 0xE7BB55].forEach((color, index) => {
    const x = 0.75 + (index % 3) * 1.1;
    const y = 9.0 + Math.floor(index / 3) * 2.1;
    piece(layer, x, y, 0.75, 0.58, (g) => {
      shadowEllipse(g, x + 0.37, y + 0.3, 22, 7, 0.08);
      box(g, x, y, 0.75, 0.58, 16, 0xA47B54, { top: 0xD8B17C, left: 0x8F6849, right: 0x76543C });
      [[0.18, 0.2], [0.4, 0.27], [0.57, 0.16]].forEach(([dx, dy], fruitIndex) => {
        const center = iso(x + dx, y + dy, 25 + (fruitIndex % 2) * 2);
        g.circle(center.x, center.y, 5).fill(color);
        g.ellipse(center.x + 2, center.y - 5, 3, 1.6).fill(0x78A66A);
      });
    });
  });
  piece(layer, 3.7, 8.0, 1.3, 0.4, (g) => {
    const scale = iso(4.35, 8.2, 28);
    g.moveTo(scale.x - 14, scale.y).lineTo(scale.x + 14, scale.y).stroke({ color: 0x7E6855, width: 2 });
    g.moveTo(scale.x, scale.y - 7).lineTo(scale.x, scale.y + 5).stroke({ color: 0x7E6855, width: 2 });
    g.ellipse(scale.x, scale.y + 8, 15, 4).fill(0xD9C7AC).stroke({ color: 0xA58B6B, width: 1.5 });
  });
  piece(layer, 3.9, 12.35, 1.0, 0.6, (g) => {
    box(g, 3.9, 12.35, 1.0, 0.6, 8, 0x9B714E, { top: 0xD8B17C });
    [0, 1, 2].forEach((index) => {
      const x = 4.1 + index * 0.25;
      const p = iso(x, 12.55, 20);
      g.ellipse(p.x, p.y, 4, 3).fill(index === 1 ? 0xF2C956 : 0x79A96C);
    });
  });

  piece(layer, 15.0, 7.65, 4.2, 1.2, (g) => {
    shadowEllipse(g, 17.1, 8.25, 82, 18, 0.11);
    box(g, 15.0, 7.65, 4.2, 1.2, 30, 0x9B6348, { top: 0xD2A276, left: 0x7F503E, right: 0x714736 });
    box(g, 15.35, 7.95, 3.5, 0.72, 3, 0xF8E9D3, { z: 30, outline: false });
    box(g, 15.65, 8.08, 0.8, 0.42, 2, 0xFFF9ED, { z: 33, outline: false });
    const register = iso(18.15, 8.18, 37);
    g.roundRect(register.x - 10, register.y - 8, 20, 12, 3).fill(0x59615D);
    g.roundRect(register.x - 7, register.y - 6, 14, 5, 1).fill(0x9ED3B1);
    const bell = iso(17.15, 8.16, 36);
    g.ellipse(bell.x, bell.y - 1, 6, 3).fill(0xE1B34C).stroke({ color: 0x9B7142, width: 1 });
    g.circle(bell.x, bell.y - 4, 2).fill(0xF7D873);
  });
  [15.4, 17.0, 18.6].forEach((x) => chair(layer, x, 9.35, 0xB78162));
  piece(layer, 18.7, 7.0, 0.5, 0.4, (g) => {
    const p = iso(18.95, 7.2, 32);
    g.roundRect(p.x - 13, p.y - 20, 26, 26, 3).fill(0x31443A).stroke({ color: 0xA47B54, width: 2 });
    g.moveTo(p.x - 8, p.y - 13).lineTo(p.x + 6, p.y - 13).stroke({ color: 0xFFF0C8, width: 1.4 });
    g.moveTo(p.x - 8, p.y - 7).lineTo(p.x + 6, p.y - 7).stroke({ color: 0xFFF0C8, width: 1.4 });
    g.moveTo(p.x - 8, p.y - 1).lineTo(p.x + 3, p.y - 1).stroke({ color: 0xFFF0C8, width: 1.4 });
  }, { wall: 'back' });

  piece(layer, 7.65, 11.5, 3.4, 1.0, (g) => {
    shadowEllipse(g, 9.35, 12.05, 72, 15, 0.09);
    box(g, 7.65, 11.5, 3.4, 1.0, 15, 0xB8796D, { top: 0xD9A293, left: 0xA7655D, right: 0x975A54 });
    box(g, 7.65, 11.5, 3.4, 0.22, 30, 0xC38B7C, { z: 15, outline: false });
    [8.15, 9.25, 10.35].forEach((x, index) => box(g, x, 11.72, 0.78, 0.6, 7, [0xF3D0A9, 0xEDC6BD, 0xD6E3CE][index], { z: 15, outline: false }));
  });
  piece(layer, 11.6, 11.55, 1.45, 0.85, (g) => {
    box(g, 11.6, 11.55, 1.45, 0.85, 21, 0xA77A55, { top: 0xDFC69F, left: 0x936D4F, right: 0x805F46 });
    const mug = iso(12.1, 11.85, 27);
    g.roundRect(mug.x - 5, mug.y - 8, 10, 9, 2).fill(0xFFF9EE).stroke({ color: 0xC8B69B, width: 1 });
    g.arc(mug.x + 5, mug.y - 4, 4, -Math.PI / 2, Math.PI / 2).stroke({ color: 0xC8B69B, width: 1.2 });
    g.moveTo(mug.x - 1, mug.y - 10).quadraticCurveTo(mug.x - 5, mug.y - 14, mug.x - 1, mug.y - 18).stroke({ color: 0xD4B88D, width: 1.2 });
  });
  piece(layer, 12.2, 13.0, 0.5, 0.4, (g) => {
    box(g, 12.2, 13.0, 0.5, 0.4, 18, 0xA67A52, { top: 0xD8B17C });
    [0, 1, 2].forEach((index) => {
      const p = iso(12.3 + index * 0.12, 13.17, 27);
      g.ellipse(p.x, p.y, 3, 2).fill([0xE1A34A, 0xC76D4E, 0x88A96C][index]);
    });
  });
  plant(layer, 7.35, 13.45, 0.7);
}
