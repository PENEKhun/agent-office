// 사무실 그림 모듈. 평면도(floor-plan.js)를 PixiJS 도형으로 그린다.
import { PLAN, ROOMS, iso, project, rotateTile, viewDims, getRotation, getView } from './floor-plan.js';
import { ROOM_ACTIVITY, drawGlyph } from './office-activity.js';
import { getTheme } from './themes/index.js';
import { furnitureHelpers, FONT } from './office-art-primitives.js';
import { shade, floorArea, rug, arcPoints } from './office-art-shapes.js';
import { backWalls, wallDecor, glassPartition } from './office-art-walls.js';

const flat = (points) => points.flatMap((p) => [p.x, p.y]);
function quad(g, a, b, c, d, color, alpha = 1) {
  if (!a || !b || !c || !d) return;
  g.poly(flat([a, b, c, d])).fill({ color, alpha });
}
function rotatedRect(x, y, w, d) { const pts=[rotateTile(x,y),rotateTile(x+w,y),rotateTile(x+w,y+d),rotateTile(x,y+d)]; const us=pts.map(p=>p.u),vs=pts.map(p=>p.v); return {u0:Math.min(...us),u1:Math.max(...us),v0:Math.min(...vs),v1:Math.max(...vs)}; }
// ---------- 방 팻말 ----------
function roomSign(PIXI, room, roomId) {
  const [x0, y0, x1] = room.rect;
  const themedRoom = getTheme().rooms[roomId];
  const sign = new PIXI.Container();
  const kind = ROOM_ACTIVITY[roomId] ?? 'walk';
  const accent = getTheme().activityColors[kind];
  const text = new PIXI.Text({ text: themedRoom.name, style: { fontFamily: FONT, fontSize: 13, fontWeight: '700', fill: 0x4A5B66 } });
  const w = text.width + 44, h = 28;
  const plate = new PIXI.Graphics().roundRect(-w/2+1,-h/2+3,w,h,14).fill({color:0x3B4A55,alpha:0.12}).roundRect(-w/2,-h/2,w,h,14).fill(0xFFFFFF).stroke({color:shade(accent,0.6),width:1.5}).circle(-w/2+15,0,10).fill(accent);
  const glyph=new PIXI.Graphics(); drawGlyph(glyph,kind,11); glyph.position.set(-w/2+15,0); text.anchor.set(0,0.5); text.position.set(-w/2+30,0); sign.addChild(plate,glyph,text);
  const r=rotatedRect(x0,y0,x1-x0,room.rect[3]-y0); const anchor=project((r.u0+r.u1)/2,r.v0+0.15,r.v0===0?PLAN.wallHeight-10:46); sign.position.set(anchor.x,anchor.y); return sign;
}

// ---------- 공개 API ----------

/**
 * 사무실 전체를 그린다.
 * 반환: { root, objects, signs, bounds }
 * - objects: 가구가 들어 있는 정렬 레이어. 캐릭터도 여기에 넣고 zIndex = depthOf(x, y) + 1 로 두면 가구와 앞뒤가 맞는다.
 * - signs: 방 팻말 레이어 (항상 최상단에 두기)
 */
export function drawOffice(PIXI) {
  const root = new PIXI.Container();
  const ground = new PIXI.Graphics();
  const walls = new PIXI.Graphics();
  const decals = new PIXI.Graphics();
  const objects = new PIXI.Container();
  objects.sortableChildren = true;
  const signs = new PIXI.Container();
  const layer = { PIXI, add: (child) => objects.addChild(child) };
  const theme = getTheme();
  const { width: W, depth: D, slabHeight: S } = PLAN;
  const { width: VW, depth: VD } = viewDims(); // 회전된 평면도 크기

  // 바닥판 두께와 그림자 (회전 좌표의 앞쪽 두 변)
  const shadowPts = [project(0, VD + 0.6), project(VW + 0.6, VD + 0.6), project(VW + 0.6, 0)];
  ground.poly(flat([project(0, VD), ...shadowPts, project(VW, 0)])).fill({ color: 0x9FB2BC, alpha: 0.12 });
  quad(ground, project(0, VD), project(VW, VD), project(VW, VD, -S), project(0, VD, -S), theme.palette.slab[0]);
  quad(ground, project(VW, 0), project(VW, VD), project(VW, VD, -S), project(VW, 0, -S), theme.palette.slab[1]);

  // 복도 바닥
  for (let x = 0; x < W; x += 1) {
    for (let y = 0; y < D; y += 1) {
      quad(ground, iso(x, y), iso(x + 1, y), iso(x + 1, y + 1), iso(x, y + 1), theme.palette.corridor[(x + y) % 2]);
    }
  }
  for (const [id, room] of Object.entries(ROOMS)) floorArea(ground, room.rect, theme.rooms[id].floor);

  // 깔개
  rug(decals, 3, 3.1, 90, 40, theme.palette.rug[0]);
  rug(decals, 9.9, 12.6, 110, 34, theme.palette.rug[1]);
  rug(decals, 3.6, 11.2, 70, 28, theme.palette.rug[2]);

  // 벽과 벽 장식
  backWalls(walls, theme.palette.wall);
  (theme.drawWallDecor ?? wallDecor)(walls);

  // 유리 칸막이 (방 안쪽 뒤 변)
  glassPartition(decals, [6, 0], [6, 5]);
  glassPartition(decals, [14, 0], [14, 6]);
  glassPartition(decals, [6, 5], [14, 5]);
  glassPartition(decals, [6, 5], [6, 11]);
  glassPartition(decals, [0, 7], [6, 7]);
  glassPartition(decals, [14, 7], [20, 7]);
  glassPartition(decals, [14, 7], [14, 14]);
  glassPartition(decals, [7, 11], [7, 14], 22);

  const effects = theme.drawFurniture(layer, furnitureHelpers);


  for (const [id, room] of Object.entries(ROOMS)) signs.addChild(roomSign(PIXI, room, id));

  root.addChild(ground, decals, walls, objects, signs);
  const corners = [project(0, 0, PLAN.wallHeight), project(VW, 0, PLAN.wallHeight), project(0, VD, PLAN.wallHeight), project(VW, VD, -S), project(0, VD, -S)];
  const bounds = {
    minX: Math.min(...corners.map((c) => c.x)) - 20,
    maxX: Math.max(...corners.map((c) => c.x)) + 20,
    minY: Math.min(...corners.map((c) => c.y)) - 30,
    maxY: Math.max(...corners.map((c) => c.y)) + 30
  };
  return { root, objects, signs, bounds, effects, rotation: getRotation(), view: getView() };
}

// ---------- 캐릭터 ----------
const HAIR = [0x5B4636, 0x2F2A28, 0x8A5A3C, 0xC08A5B, 0x3E3A4F];

/** 2등신 캐릭터. color는 몸통(에이전트) 색, seed로 머리 모양·색을 고른다. */
export function drawCharacter(PIXI, { color, seed = 0, hat = null } = {}) {
  const c = new PIXI.Container();
  const g = new PIXI.Graphics();
  const hair = HAIR[seed % HAIR.length];
  const style = seed % 3;
  g.ellipse(0, 2, 15, 6).fill({ color: 0x3B4A55, alpha: 0.18 });
  // 다리
  g.roundRect(-7, -10, 5, 11, 2.5).fill(0x4A5562);
  g.roundRect(2, -10, 5, 11, 2.5).fill(0x4A5562);
  // 몸통
  g.roundRect(-11, -30, 22, 23, 9).fill(color);
  g.roundRect(-11, -30, 22, 8, 6).fill({ color: 0xFFFFFF, alpha: 0.14 });
  g.roundRect(-14, -27, 6, 14, 3).fill(shade(color, -0.12));
  g.roundRect(8, -27, 6, 14, 3).fill(shade(color, -0.12));
  g.circle(-11, -12, 3).fill(0xFFDCC4);
  g.circle(11, -12, 3).fill(0xFFDCC4);
  // 머리
  const hy = -45;
  g.circle(0, hy, 16).fill(0xFFE3CF).stroke({ color: 0xEBC6AE, width: 1 });
  if (style === 0) {
    g.poly(arcPoints(0, hy, 16.6, Math.PI * 1.0, Math.PI * 2.0)).fill(hair);
    g.poly([-16.4, hy - 1, -12, hy - 7, -4, hy - 4, 2, hy - 8, 9, hy - 5, 16.4, hy - 1, 16.4, hy - 6, -16.4, hy - 6]).fill(hair);
  } else if (style === 1) {
    g.poly(arcPoints(0, hy, 17, Math.PI * 0.97, Math.PI * 2.03)).fill(hair);
    g.roundRect(-17.5, hy - 6, 7, 19, 3.5).fill(hair);
    g.roundRect(10.5, hy - 6, 7, 19, 3.5).fill(hair);
    g.poly([-12, hy - 4, -3, hy - 9, 6, hy - 5, 12, hy - 3, 12, hy - 8, -12, hy - 8]).fill(hair);
  } else {
    g.poly(arcPoints(0, hy - 1, 16.6, Math.PI, Math.PI * 2)).fill(hair);
    g.poly([-16.4, hy - 1, -8, hy - 6, 16.4, hy - 2, 16.4, hy - 6, -16.4, hy - 6]).fill(hair);
    g.circle(2, hy - 18, 6.5).fill(hair);
  }
  // 얼굴
  g.ellipse(-5.5, hy + 2, 1.9, 2.4).fill(0x3D3431);
  g.ellipse(5.5, hy + 2, 1.9, 2.4).fill(0x3D3431);
  g.circle(-5, hy + 1.2, 0.7).fill(0xFFFFFF);
  g.circle(6, hy + 1.2, 0.7).fill(0xFFFFFF);
  g.ellipse(-9, hy + 7, 3, 1.8).fill({ color: 0xF79C9C, alpha: 0.45 });
  g.ellipse(9, hy + 7, 3, 1.8).fill({ color: 0xF79C9C, alpha: 0.45 });
  g.moveTo(-2.5, hy + 7.5).quadraticCurveTo(0, hy + 9.5, 2.5, hy + 7.5).stroke({ color: 0xB06E5E, width: 1.4, cap: 'round' });
  if (hat !== null) {
    g.ellipse(0, hy - 13, 17, 5).fill(shade(hat, -0.1));
    g.roundRect(-11, hy - 25, 22, 13, 6).fill(hat);
  }
  c.addChild(g);
  c.headY = hy - 18;
  return c;
}

/** 이름표. icon은 PIXI.Texture(없으면 색 점). */
export function drawNamePlate(PIXI, { text, color, icon = null }) {
  const c = new PIXI.Container();
  const label = new PIXI.Text({ text, style: { fontFamily: FONT, fontSize: 12, fontWeight: '700', fill: 0x3F515C } });
  const w = label.width + 36, h = 24;
  const g = new PIXI.Graphics()
    .roundRect(-w / 2, -h / 2 + 2, w, h, 12).fill({ color: 0x3B4A55, alpha: 0.12 })
    .roundRect(-w / 2, -h / 2, w, h, 12).fill(0xFFFFFF).stroke({ color: shade(color, 0.55), width: 1.5 })
    .circle(-w / 2 + 13, 0, 8.5).fill(icon ? 0xFFFFFF : color).stroke({ color: shade(color, 0.4), width: 1 });
  label.anchor.set(0, 0.5);
  label.position.set(-w / 2 + 26, 0);
  c.addChild(g, label);
  if (icon) {
    const s = new PIXI.Sprite(icon);
    s.anchor.set(0.5); s.width = 11; s.height = 11; s.position.set(-w / 2 + 13, 0);
    c.addChild(s);
  }
  c.plateWidth = w;
  return c;
}

/** 말풍선. tone: 'work' | 'think' | 'idle' */
export function drawBubble(PIXI, { text, tone = 'work' }) {
  const c = new PIXI.Container();
  const colors = { work: [0xFFFFFF, 0x3F515C, 0xE1E8EC], think: [0xFFF8E3, 0x8A6A1E, 0xF3E2B0], idle: [0xF2F5F7, 0x7A8A94, 0xE1E8EC] };
  const [bg, fg, line] = colors[tone] ?? colors.work;
  const label = new PIXI.Text({ text, style: {
    fontFamily: FONT, fontSize: 13, fontWeight: '600', fill: fg, wordWrap: true, wordWrapWidth: 170, breakWords: true, lineHeight: 17
  } });
  const w = Math.max(48, label.width + 22), h = label.height + 12;
  const g = new PIXI.Graphics()
    .roundRect(-w / 2, -h - 8 + 2, w, h, 11).fill({ color: 0x3B4A55, alpha: 0.1 })
    .roundRect(-w / 2, -h - 8, w, h, 11).fill(bg).stroke({ color: line, width: 1 })
    .poly([-6, -9, 6, -9, 0, -1]).fill(bg);
  g.moveTo(-6, -8.5).lineTo(0, -1).lineTo(6, -8.5).stroke({ color: line, width: 1 });
  label.anchor.set(0.5, 0);
  label.position.set(0, -h - 8 + 6);
  c.addChild(g, label);
  c.bubbleHeight = h + 8;
  return c;
}
