function lineStyle(color, u) {
  return { color, width: 1.5 * u, cap: 'round', join: 'round' };
}

function drawCube(g, u, color, line) {
  g.poly([0, -6 * u, 5.5 * u, -3 * u, 0, 0, -5.5 * u, -3 * u]).fill({ color, alpha: 0.85 }).stroke(line);
  g.poly([-5.5 * u, -2.5 * u, -0.5 * u, 0.2 * u, -0.5 * u, 6 * u, -5.5 * u, 3 * u]).fill({ color, alpha: 0.55 }).stroke(line);
  g.poly([5.5 * u, -2.5 * u, 0.5 * u, 0.2 * u, 0.5 * u, 6 * u, 5.5 * u, 3 * u]).fill({ color, alpha: 0.7 }).stroke(line);
}

function drawWrench(g, u, color, line) {
  g.moveTo(-4.5 * u, 4.5 * u).lineTo(1.5 * u, -1.5 * u).stroke({ ...line, width: 2.5 * u });
  g.circle(-4.8 * u, 4.8 * u, 1.8 * u).stroke(line);
  g.moveTo(0, -4.5 * u).lineTo(2 * u, -6 * u).lineTo(5.5 * u, -2.5 * u).lineTo(3.5 * u, -0.5 * u).lineTo(1 * u, -1.5 * u).stroke(line);
  g.circle(4.7 * u, -4.7 * u, 0.8 * u).fill(color);
}

function drawAtom(g, u, color, line) {
  for (let rotation = 0; rotation < 3; rotation += 1) {
    const points = [];
    for (let index = 0; index <= 24; index += 1) {
      const angle = Math.PI * 2 * index / 24;
      const x = 6 * Math.cos(angle), y = 2.6 * Math.sin(angle);
      const turn = rotation * Math.PI / 3;
      points.push((x * Math.cos(turn) - y * Math.sin(turn)) * u, (x * Math.sin(turn) + y * Math.cos(turn)) * u);
    }
    g.poly(points).stroke({ ...line, width: 1.1 * u });
  }
  g.circle(0, 0, 1.8 * u).fill(color);
}

function drawTelescope(g, u, color, line) {
  g.poly([-5 * u, -5 * u, 1.5 * u, -2 * u, 5.5 * u, 4.5 * u, 3 * u, 6 * u, -2 * u, 0, -6 * u, -3 * u]).fill({ color, alpha: 0.85 }).stroke(line);
  g.moveTo(0, 1 * u).lineTo(-1.5 * u, 6 * u).moveTo(-1.5 * u, 6 * u).lineTo(-5 * u, 6 * u).moveTo(-1.5 * u, 6 * u).lineTo(2 * u, 6 * u).stroke(line);
  g.moveTo(4 * u, 3 * u).lineTo(6 * u, 1 * u).stroke(line);
}

function drawStarMap(g, u, color, line) {
  g.moveTo(-5.5 * u, 4.5 * u).lineTo(-2.5 * u, 0).lineTo(1 * u, 2.2 * u).lineTo(5 * u, -4.5 * u).stroke(line);
  for (const [x, y] of [[-5.5, 4.5], [-2.5, 0], [1, 2.2], [5, -4.5]]) g.circle(x * u, y * u, 1.3 * u).fill(color);
  g.moveTo(0, -6 * u).lineTo(0, -3.6 * u).moveTo(-1.2 * u, -4.8 * u).lineTo(1.2 * u, -4.8 * u).stroke(line);
}

function drawAntenna(g, u, color, line) {
  g.moveTo(0, 0).lineTo(0, 6 * u).moveTo(-3.5 * u, 6 * u).lineTo(3.5 * u, 6 * u).stroke(line);
  g.circle(0, -1 * u, 1.6 * u).fill(color);
  g.moveTo(-3.3 * u, -4 * u).quadraticCurveTo(0, -1 * u, 3.3 * u, -4 * u).stroke(line);
  g.moveTo(-5.3 * u, -6 * u).quadraticCurveTo(0, -0.5 * u, 5.3 * u, -6 * u).stroke(line);
}

function drawCookbook(g, u, color, line) {
  g.poly([-6 * u, -4.5 * u, -0.5 * u, -3 * u, -0.5 * u, 5 * u, -6 * u, 3.5 * u]).fill({ color, alpha: 0.8 }).stroke(line);
  g.poly([6 * u, -4.5 * u, 0.5 * u, -3 * u, 0.5 * u, 5 * u, 6 * u, 3.5 * u]).fill({ color, alpha: 0.65 }).stroke(line);
  g.moveTo(-4.5 * u, -2.5 * u).lineTo(-1.8 * u, -1.8 * u).moveTo(1.8 * u, -1.8 * u).lineTo(4.5 * u, -2.5 * u).stroke({ ...line, width: 0.9 * u });
  g.moveTo(0, -2.5 * u).lineTo(0, 4.8 * u).stroke(line);
}

function drawKnifeBoard(g, u, color, line) {
  g.roundRect(-5 * u, -4 * u, 10 * u, 8 * u, 1.5 * u).fill({ color, alpha: 0.35 }).stroke(line);
  g.moveTo(-2.5 * u, 3 * u).lineTo(2.5 * u, -3.5 * u).stroke({ ...line, width: 2 * u });
  g.poly([1.2 * u, -2.3 * u, 5.5 * u, -6 * u, 3.8 * u, -1 * u]).fill(color).stroke(line);
  g.circle(-2.7 * u, 3.1 * u, 1.3 * u).fill(color);
}

function drawFlame(g, u, color, line) {
  g.poly([0, -6 * u, 3.8 * u, -1.5 * u, 3 * u, 2 * u, 5 * u, 0, 5 * u, 4 * u, 2.5 * u, 6 * u, -2.5 * u, 5 * u, -5 * u, 1 * u, -3.5 * u, -2 * u]).fill({ color, alpha: 0.9 }).stroke(line);
  g.poly([0, 1 * u, 1.8 * u, 3.5 * u, 0, 5 * u, -1.8 * u, 3.5 * u]).fill(0xFFF2C8);
}

function drawBasket(g, u, color, line) {
  g.moveTo(-4.5 * u, -1.5 * u).quadraticCurveTo(0, -7 * u, 4.5 * u, -1.5 * u).stroke(line);
  g.poly([-6 * u, -1.5 * u, 6 * u, -1.5 * u, 4.5 * u, 5 * u, -4.5 * u, 5 * u]).fill({ color, alpha: 0.45 }).stroke(line);
  for (const [x, y, fruit] of [[-3, -3, 0xE97362], [0, -4, 0xE9C84F], [3, -3, 0x6FBF7D]]) g.circle(x * u, y * u, 1.9 * u).fill(fruit);
  g.moveTo(-2 * u, 0).lineTo(-2 * u, 4 * u).moveTo(2 * u, 0).lineTo(2 * u, 4 * u).stroke({ ...line, width: 0.8 * u });
}

function drawMenu(g, u, color, line) {
  g.roundRect(-5 * u, -6 * u, 10 * u, 12 * u, 1.5 * u).fill({ color, alpha: 0.35 }).stroke(line);
  g.moveTo(-2.5 * u, -2.5 * u).lineTo(2.5 * u, -2.5 * u).moveTo(-2.5 * u, 0).lineTo(2.5 * u, 0).moveTo(-2.5 * u, 2.5 * u).lineTo(1.5 * u, 2.5 * u).stroke({ ...line, width: 1.1 * u });
  g.circle(0, -6 * u, 1.2 * u).fill(color);
}

function drawBell(g, u, color, line) {
  g.moveTo(-5 * u, 3 * u).quadraticCurveTo(-3.5 * u, 1 * u, -3.5 * u, -1.5 * u).quadraticCurveTo(-3.5 * u, -5 * u, 0, -5 * u).quadraticCurveTo(3.5 * u, -5 * u, 3.5 * u, -1.5 * u).quadraticCurveTo(3.5 * u, 1 * u, 5 * u, 3 * u).closePath().fill({ color, alpha: 0.85 }).stroke(line);
  g.moveTo(-5 * u, 3 * u).lineTo(5 * u, 3 * u).stroke({ ...line, width: 1.8 * u });
  g.circle(0, 5 * u, 1.2 * u).fill(color);
  g.circle(0, -6.3 * u, 1.1 * u).fill(color);
}

const DRAWERS = {
  'data-cube': drawCube, wrench: drawWrench, 'atom-core': drawAtom, telescope: drawTelescope,
  'star-map': drawStarMap, antenna: drawAntenna, cookbook: drawCookbook,
  'knife-board': drawKnifeBoard, flame: drawFlame, basket: drawBasket,
  'menu-board': drawMenu, 'service-bell': drawBell
};

export const EXTRA_GLYPH_NAMES = Object.freeze(Object.keys(DRAWERS));

export function hasExtraGlyph(name) {
  return Object.hasOwn(DRAWERS, name);
}

export function drawExtraGlyph(graphics, name, size = 14, color = 0xFFFFFF) {
  const draw = DRAWERS[name];
  if (!draw) return false;
  const scale = size / 14;
  draw(graphics, scale, color, lineStyle(color, scale));
  return true;
}
