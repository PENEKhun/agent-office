export function drawKitchenRooms(layer, helpers) {
  const { piece, box, desk, chair, iso, shadowEllipse, plant } = helpers;
  [14.7, 16.6, 18.4].forEach((x, index) => {
    piece(layer, x, 0.55, 1.25, 1.35, (g) => {
      shadowEllipse(g, x + 0.62, 1.2, 34, 10, 0.12);
      box(g, x, 0.75, 1.25, 0.9, 16, 0x9D8A78, { top: 0xC9B49A, left: 0x806F61, right: 0x705F53 });
      box(g, x + 0.12, 0.82, 1.01, 0.72, 7, 0x4C4743, { z: 16, outline: false });
      const oven = iso(x + 0.62, 1.15, 25);
      g.roundRect(oven.x - 16, oven.y - 14, 32, 19, 5).fill(0x653E34).stroke({ color: 0xD87B4F, width: 2 });
      g.ellipse(oven.x, oven.y - 5, 8, 4).fill(0xF1A54B);
      g.ellipse(oven.x - 4 + index * 2, oven.y - 6, 3, 5).fill(0xFFD27A);
      box(g, x + 0.18, 1.7, 0.86, 0.18, 3, 0xA6A19A, { z: 16, outline: false });
      box(g, x + 0.28, 0.65, 0.12, 0.16, 22, 0xB57C4E, { z: 16, outline: false });
    });
  });
  piece(layer, 15.0, 3.25, 4.2, 0.65, (g) => {
    box(g, 15.0, 3.25, 4.2, 0.65, 21, 0x7D7062, { top: 0xC9BCA8, left: 0x6A5E52, right: 0x5B5148 });
    box(g, 15.25, 3.4, 1.0, 0.32, 3, 0xFFF5E5, { z: 21, outline: false });
    box(g, 16.45, 3.4, 1.0, 0.32, 3, 0xFFF5E5, { z: 21, outline: false });
    box(g, 17.65, 3.4, 1.0, 0.32, 3, 0xFFF5E5, { z: 21, outline: false });
  });
  [15.35, 17.4, 19.1].forEach((x) => plant(layer, x, 5.6, 0.55));

  [6.6, 8.4, 10.2, 12.0].forEach((x, index) => {
    piece(layer, x, 5.7, 1.45, 0.68, (g) => {
      shadowEllipse(g, x + 0.72, 6.05, 40, 12, 0.08);
      box(g, x, 5.7, 1.45, 0.68, 25, 0x9BA4A1, { top: 0xDCE1DC, left: 0x89918D, right: 0x747C79 });
      box(g, x + 0.2, 5.85, 0.68, 0.42, 2, index % 2 ? 0xD5A16F : 0xC59061, { z: 25, outline: false });
      box(g, x + 1.02, 5.88, 0.23, 0.3, 5, 0xEEE7D8, { z: 25, outline: false });
      const garnish = iso(x + 1.13, 5.9, 29);
      g.circle(garnish.x, garnish.y, 2).fill(index % 2 ? 0x79A96C : 0xC94F3D);
    });
    chair(layer, x + 0.72, 7.0, 0x789187);
  });
  piece(layer, 6.5, 5.15, 6.8, 0.3, (g) => {
    box(g, 6.5, 5.15, 6.8, 0.3, 33, 0x7A8581, { top: 0xB9C3BE, left: 0x65716D, right: 0x56635F });
    [7.0, 9.1, 11.2].forEach((x) => {
      box(g, x, 5.18, 1.5, 0.18, 3, 0xE4E5DF, { z: 33, outline: false });
      [0, 1, 2, 3].forEach((i) => {
        const top = iso(x + 0.2 + i * 0.32, 5.18, 36), bottom = iso(x + 0.2 + i * 0.32, 5.38, 36);
        g.moveTo(top.x, top.y).lineTo(bottom.x, bottom.y).stroke({ color: 0x596560, width: 1 });
      });
    });
  }, { wall: 'back' });
  desk(layer, 6.8, 8.1, { w: 1.5, d: 0.8, screen: 0xE6D9BD, content: 'paper' });
  desk(layer, 9.0, 8.1, { w: 1.5, d: 0.8, screen: 0xE6D9BD, content: 'paper' });
  desk(layer, 11.2, 8.1, { w: 1.5, d: 0.8, screen: 0xE6D9BD, content: 'paper' });
}
