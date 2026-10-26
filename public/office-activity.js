// 캐릭터 활동 표현 모듈 (SPEC 9.3).
// 상태와 방을 "활동 종류" 하나로 묶고, 종류마다 같은 그림 언어를 쓴다.
//   - 머리 위 이모트(색 원 + 흰 기호)
//   - 손에 든 소품과 자세
//   - 방 팻말의 기호
// 셋이 같은 기호를 쓰기 때문에, 방을 몰라도 이모트만 보고 무슨 일을 하는지 알 수 있다.

import { getTheme } from './themes/index.js';
import { drawExtraGlyph } from './glyphs.js';

const SKIN = 0xFFE3CF, SKIN_LINE = 0xEBC6AE, HAND = 0xFFDCC4, LEG = 0x4A5562;
const HAIR = [0x5B4636, 0x2F2A28, 0x8A5A3C, 0xC08A5B, 0x3E3A4F];

export const ACTIVITIES = {
  read:    { get label() { return getTheme().activityLabels.read; }, get color() { return getTheme().activityColors.read; } },
  code:    { get label() { return getTheme().activityLabels.code; }, get color() { return getTheme().activityColors.code; } },
  run:     { get label() { return getTheme().activityLabels.run; }, get color() { return getTheme().activityColors.run; } },
  search:  { get label() { return getTheme().activityLabels.search; }, get color() { return getTheme().activityColors.search; } },
  plan:    { get label() { return getTheme().activityLabels.plan; }, get color() { return getTheme().activityColors.plan; } },
  reply:   { get label() { return getTheme().activityLabels.reply; }, get color() { return getTheme().activityColors.reply; } },
  think:   { get label() { return getTheme().activityLabels.think; }, get color() { return getTheme().activityColors.think; } },
  rest:    { get label() { return getTheme().activityLabels.rest; }, get color() { return getTheme().activityColors.rest; } },
  walk:    { get label() { return getTheme().activityLabels.walk; }, get color() { return getTheme().activityColors.walk; } },
  deliver: { get label() { return getTheme().activityLabels.deliver; }, get color() { return getTheme().activityColors.deliver; } }
};

export const ROOM_ACTIVITY = {
  library: 'read', dev: 'code', server: 'run', search: 'search',
  meeting: 'plan', desk: 'reply', lounge: 'rest', elevator: 'walk'
};

/** 표시할 기호와 고민 배지를 정한다. 순수 함수. */
export function activityPresentationOf({ status, room, delivering = false } = {}) {
  if (delivering || room === 'delivery') return { kind: 'deliver', think: false };
  if (status === 'idle') return { kind: 'rest', think: false };
  if (status === 'arriving' || status === 'leaving' || status === 'gone') return { kind: 'walk', think: false };
  if (status === 'thinking') {
    const roomKind = room && room !== 'desk' ? ROOM_ACTIVITY[room] : null;
    return roomKind ? { kind: roomKind, think: true } : { kind: 'think', think: false };
  }
  return { kind: ROOM_ACTIVITY[room] ?? 'reply', think: false };
}

/** 기존 호출부와 호환되는 활동 종류 판정. */
export function activityOf(input = {}) {
  return activityPresentationOf(input).kind;
}

function shade(color, amount) {
  const r = (color >> 16) & 255, g = (color >> 8) & 255, b = color & 255;
  const f = (c) => Math.max(0, Math.min(255, Math.round(amount < 0 ? c * (1 + amount) : c + (255 - c) * amount)));
  return (f(r) << 16) | (f(g) << 8) | f(b);
}

function arcPoints(cx, cy, r, a0, a1, steps = 18) {
  const pts = [];
  for (let i = 0; i <= steps; i += 1) {
    const a = a0 + (a1 - a0) * (i / steps);
    pts.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  return pts;
}

// ---------- 기호 (이모트·팻말 공용) ----------
/** 중심 (0,0), 대략 지름 s 안에 흰색(또는 color) 기호를 그린다. */
export function drawGlyph(g, kind, s = 14, color = 0xFFFFFF) {
  const themedGlyph = getTheme().activityGlyphs?.[kind];
  if (themedGlyph && drawExtraGlyph(g, themedGlyph, s, color)) return;
  const u = s / 14;
  const line = { color, width: 1.8 * u, cap: 'round', join: 'round' };
  switch (kind) {
    case 'read': // 펼친 책
      g.poly([-6 * u, -4 * u, -0.5 * u, -2.5 * u, -0.5 * u, 5 * u, -6 * u, 3.5 * u]).fill(color);
      g.poly([6 * u, -4 * u, 0.5 * u, -2.5 * u, 0.5 * u, 5 * u, 6 * u, 3.5 * u]).fill(color);
      break;
    case 'code': // </>
      g.moveTo(-3 * u, -4 * u).lineTo(-6.5 * u, 0).lineTo(-3 * u, 4 * u).stroke(line);
      g.moveTo(3 * u, -4 * u).lineTo(6.5 * u, 0).lineTo(3 * u, 4 * u).stroke(line);
      g.moveTo(1.2 * u, -5 * u).lineTo(-1.2 * u, 5 * u).stroke(line);
      break;
    case 'run': // >_
      g.moveTo(-6 * u, -3.5 * u).lineTo(-2 * u, 0).lineTo(-6 * u, 3.5 * u).stroke(line);
      g.moveTo(0, 4 * u).lineTo(6 * u, 4 * u).stroke(line);
      break;
    case 'search': // 돋보기
      g.circle(-1.2 * u, -1.2 * u, 4 * u).stroke(line);
      g.moveTo(1.8 * u, 1.8 * u).lineTo(5.5 * u, 5.5 * u).stroke({ ...line, width: 2.4 * u });
      break;
    case 'plan': // 체크리스트
      g.moveTo(-6 * u, -3.5 * u).lineTo(-4.6 * u, -2 * u).lineTo(-2.4 * u, -5 * u).stroke(line);
      g.moveTo(0, -3.5 * u).lineTo(6 * u, -3.5 * u).stroke(line);
      g.moveTo(-6 * u, 2.5 * u).lineTo(-4.6 * u, 4 * u).lineTo(-2.4 * u, 1 * u).stroke(line);
      g.moveTo(0, 2.5 * u).lineTo(6 * u, 2.5 * u).stroke(line);
      break;
    case 'reply': // 말풍선 + 점 세 개
      g.roundRect(-6.5 * u, -5 * u, 13 * u, 9 * u, 3.5 * u).fill(color);
      g.poly([-3 * u, 3.5 * u, -4.5 * u, 6.5 * u, 0, 3.5 * u]).fill(color);
      break;
    case 'think': // 전구
      g.circle(0, -1.5 * u, 4.6 * u).fill(color);
      g.roundRect(-2.4 * u, 2.4 * u, 4.8 * u, 3.4 * u, 1 * u).fill(color);
      break;
    case 'rest': // 커피잔
      g.roundRect(-5.5 * u, -2 * u, 9 * u, 7 * u, 2 * u).fill(color);
      g.circle(4.6 * u, 1.2 * u, 2.4 * u).stroke({ ...line, width: 1.4 * u });
      g.moveTo(-3 * u, -4 * u).quadraticCurveTo(-1.5 * u, -5.5 * u, -3 * u, -7 * u).stroke({ ...line, width: 1.2 * u });
      g.moveTo(0.5 * u, -4 * u).quadraticCurveTo(2 * u, -5.5 * u, 0.5 * u, -7 * u).stroke({ ...line, width: 1.2 * u });
      break;
    case 'deliver': // 상자
      g.poly([0, -6 * u, 6 * u, -3 * u, 0, 0, -6 * u, -3 * u]).fill(color);
      g.poly([-6 * u, -2 * u, -0.6 * u, 0.8 * u, -0.6 * u, 6.5 * u, -6 * u, 3.5 * u]).fill({ color, alpha: 0.85 });
      g.poly([6 * u, -2 * u, 0.6 * u, 0.8 * u, 0.6 * u, 6.5 * u, 6 * u, 3.5 * u]).fill({ color, alpha: 0.7 });
      break;
    default: // walk: 앞으로 가는 화살표 두 개
      g.moveTo(-6 * u, -4 * u).lineTo(-1.5 * u, 0).lineTo(-6 * u, 4 * u).stroke(line);
      g.moveTo(0.5 * u, -4 * u).lineTo(5 * u, 0).lineTo(0.5 * u, 4 * u).stroke(line);
  }
}

// ---------- 이모트 ----------
/**
 * 머리 위 활동 이모트. think는 생각 구름으로 표시한다.
 * 반환 컨테이너의 tick(t)로 애니메이션(t: ms).
 */
export function drawEmote(PIXI, kind, { thinking = false } = {}) {
  const c = new PIXI.Container();
  const info = ACTIVITIES[kind] ?? ACTIVITIES.walk;
  if (kind === 'think') {
    const cloud = new PIXI.Graphics();
    const parts = [[-9, 0, 9], [0, -5, 10.5], [10, -1, 8.5], [2, 4, 9], [-4, 5, 7]];
    for (const [x, y, r] of parts) cloud.circle(x, y - 6, r + 1.2).fill(0xE9D9A6);
    for (const [x, y, r] of parts) cloud.circle(x, y - 6, r).fill(0xFFF8E1);
    cloud.circle(-10, 12, 3.2).fill(0xFFF8E1).stroke({ color: 0xE9D9A6, width: 1 });
    cloud.circle(-14, 18, 2).fill(0xFFF8E1).stroke({ color: 0xE9D9A6, width: 1 });
    const dots = [0, 1, 2].map((i) => {
      const d = new PIXI.Graphics().circle(0, 0, 2.6).fill(0xB08A1E);
      d.position.set(-7 + i * 7, -6);
      return d;
    });
    c.addChild(cloud, ...dots);
    c.tick = (t) => dots.forEach((d, i) => {
      const phase = ((t / 420) - i * 0.6) % 3;
      d.alpha = phase >= 0 && phase < 1.4 ? 1 : 0.25;
      d.y = -6 - (phase >= 0 && phase < 0.7 ? 2 : 0);
    });
    c.emoteHeight = 34;
    return c;
  }
  const g = new PIXI.Graphics();
  g.circle(0, 1.5, 13).fill({ color: 0x1E293B, alpha: 0.15 });
  g.circle(0, 0, 13).fill(info.color).stroke({ color: 0xFFFFFF, width: 2 });
  g.poly([-4, 11, 4, 11, 0, 17]).fill(info.color);
  drawGlyph(g, kind, 14);
  c.addChild(g);
  let thoughtDots = [];
  if (thinking) {
    const badge = new PIXI.Graphics();
    badge.circle(0, 0, 4.8).fill(0xFFF8E1).stroke({ color: 0xD8BD79, width: 1 });
    badge.circle(5.2, 4.1, 1.8).fill(0xFFF8E1).stroke({ color: 0xD8BD79, width: 0.8 });
    thoughtDots = [-2.2, 0, 2.2].map((x) => {
      const dot = new PIXI.Graphics().circle(0, 0, 0.65).fill(0x98741D);
      dot.position.set(x, -0.2);
      badge.addChild(dot);
      return dot;
    });
    badge.position.set(8.5, -9.5);
    c.addChild(badge);
  }
  c.tick = (t) => {
    g.y = Math.sin(t / 500) * 1.5;
    thoughtDots.forEach((dot, index) => {
      const phase = ((t / 360 - index * 0.7) % 3 + 3) % 3;
      dot.alpha = phase >= 0 && phase < 1.2 ? 1 : 0.25;
      dot.y = -0.2 - (phase >= 0 && phase < 0.6 ? 0.7 : 0);
    });
  };
  c.emoteHeight = 30;
  return c;
}

// ---------- 소품 ----------
function drawProp(g, kind, color, t = 0) {
  switch (kind) {
    case 'read': {
      g.poly([-12, -24, -1, -21, -1, -10, -12, -13]).fill(0xFFFFFF).stroke({ color: 0xD9C7A6, width: 1 });
      g.poly([12, -24, 1, -21, 1, -10, 12, -13]).fill(0xFFFFFF).stroke({ color: 0xD9C7A6, width: 1 });
      g.poly([-13, -12, 0, -9, 13, -12, 13, -10, 0, -7, -13, -10]).fill(0xE9A23B);
      for (let i = 0; i < 3; i += 1) {
        g.moveTo(-10, -21 + i * 3).lineTo(-3, -19.5 + i * 3).moveTo(3, -19.5 + i * 3).lineTo(10, -21 + i * 3);
      }
      g.stroke({ color: 0xC9B48E, width: 1 });
      break;
    }
    case 'code': case 'run': {
      // 노트북을 앞에 들고 타이핑 (화면은 캐릭터를 향하니 뒷면과 키보드만 보임)
      g.poly([-14, -14, 14, -14, 11, -7, -11, -7]).fill(0xCBD5E1).stroke({ color: 0x94A3B8, width: 1 });
      g.roundRect(-13, -27, 26, 14, 2.5).fill(kind === 'run' ? 0x1E293B : 0x475569);
      if (kind === 'run') {
        g.moveTo(-6, -23).lineTo(-3, -20.5).lineTo(-6, -18).stroke({ color: 0x6FE3A5, width: 1.6, cap: 'round' });
        if (Math.floor(t / 500) % 2 === 0) g.rect(-1, -18.8, 5, 1.6).fill(0x6FE3A5);
      } else {
        g.circle(0, -20, 2.6).fill({ color: 0xFFFFFF, alpha: 0.75 });
      }
      break;
    }
    case 'search':
      g.circle(14, -30, 6.5).fill({ color: 0xCFF3EA, alpha: 0.85 }).stroke({ color: 0x14A38B, width: 2.2 });
      g.moveTo(10, -25).lineTo(5, -18).stroke({ color: 0x0F766E, width: 3, cap: 'round' });
      g.circle(12, -32, 1.8).fill({ color: 0xFFFFFF, alpha: 0.9 });
      break;
    case 'plan':
      g.roundRect(-9, -27, 18, 22, 2.5).fill(0xC8A27A);
      g.roundRect(-7, -24, 14, 18, 1.5).fill(0xFFFFFF);
      g.roundRect(-3.5, -29, 7, 4, 1.5).fill(0x64748B);
      for (let i = 0; i < 3; i += 1) {
        g.moveTo(-5, -20 + i * 5).lineTo(-3.8, -18.8 + i * 5).lineTo(-2, -21.5 + i * 5).stroke({ color: 0x8B5CF6, width: 1.3 });
        g.moveTo(0, -20 + i * 5).lineTo(5, -20 + i * 5).stroke({ color: 0xCBD5E1, width: 1.3 });
      }
      break;
    case 'reply':
      g.poly([-9, -26, 8, -27, 9, -9, -8, -8]).fill(0xFFFFFF).stroke({ color: 0xE2E8F0, width: 1 });
      for (let i = 0; i < 3; i += 1) g.moveTo(-6, -22 + i * 4).lineTo(5, -22.5 + i * 4);
      g.stroke({ color: 0xCBD5E1, width: 1.2 });
      g.moveTo(10, -12).lineTo(4, -20).stroke({ color: 0xF0766A, width: 2.4, cap: 'round' });
      break;
    case 'rest': {
      g.roundRect(5, -22, 10, 11, 3).fill(0xFFFFFF).stroke({ color: 0xD6C3AE, width: 1 });
      g.rect(5.5, -21, 9, 3).fill(0xA47551);
      g.circle(16, -17, 3).stroke({ color: 0xD6C3AE, width: 1.4 });
      const s = Math.sin(t / 300) * 1.5;
      g.moveTo(8 + s, -25).quadraticCurveTo(10 + s, -28, 8 + s, -31).stroke({ color: 0xFFFFFF, width: 1.5, cap: 'round', alpha: 0.9 });
      g.moveTo(12 - s, -25).quadraticCurveTo(14 - s, -28, 12 - s, -31).stroke({ color: 0xFFFFFF, width: 1.5, cap: 'round', alpha: 0.9 });
      break;
    }
    case 'deliver':
      g.poly([-12, -22, 0, -27, 12, -22, 0, -17]).fill(0xF3C892);
      g.poly([-12, -22, 0, -17, 0, -5, -12, -10]).fill(0xE0AE72);
      g.poly([12, -22, 0, -17, 0, -5, 12, -10]).fill(0xCF9A5D);
      g.moveTo(-6, -24.5).lineTo(6, -19.5).stroke({ color: 0xFFFFFF, width: 2, alpha: 0.7 });
      break;
    default:
  }
}

// ---------- 캐릭터 ----------
/**
 * 활동에 따라 자세·표정·소품이 바뀌는 캐릭터.
 * actor.setActivity(kind), actor.tick(t, moving) 를 매 프레임 호출한다.
 * actor.emoteAnchorY: 이모트를 올릴 머리 위 y.
 */
export function drawActor(PIXI, { color, seed = 0, hat = null, activity = 'walk' } = {}) {
  const root = new PIXI.Container();
  const body = new PIXI.Graphics();
  const front = new PIXI.Graphics();
  root.addChild(body, front);
  const hair = HAIR[seed % HAIR.length];
  const style = seed % 3;
  let kind = activity;
  let lastFrame = -1;

  function drawHead(g, hy, tilt) {
    g.circle(tilt, hy, 16).fill(SKIN).stroke({ color: SKIN_LINE, width: 1 });
    const x = tilt;
    if (style === 0) {
      g.poly(arcPoints(x, hy, 16.6, Math.PI, Math.PI * 2)).fill(hair);
      g.poly([x - 16.4, hy - 1, x - 12, hy - 7, x - 4, hy - 4, x + 2, hy - 8, x + 9, hy - 5, x + 16.4, hy - 1, x + 16.4, hy - 6, x - 16.4, hy - 6]).fill(hair);
    } else if (style === 1) {
      g.poly(arcPoints(x, hy, 17, Math.PI * 0.97, Math.PI * 2.03)).fill(hair);
      g.roundRect(x - 17.5, hy - 6, 7, 19, 3.5).fill(hair);
      g.roundRect(x + 10.5, hy - 6, 7, 19, 3.5).fill(hair);
      g.poly([x - 12, hy - 4, x - 3, hy - 9, x + 6, hy - 5, x + 12, hy - 3, x + 12, hy - 8, x - 12, hy - 8]).fill(hair);
    } else {
      g.poly(arcPoints(x, hy - 1, 16.6, Math.PI, Math.PI * 2)).fill(hair);
      g.poly([x - 16.4, hy - 1, x - 8, hy - 6, x + 16.4, hy - 2, x + 16.4, hy - 6, x - 16.4, hy - 6]).fill(hair);
      g.circle(x + 2, hy - 18, 6.5).fill(hair);
    }
    // 얼굴: 활동별 표정
    const eye = 0x3D3431;
    if (kind === 'rest') {
      g.moveTo(x - 8, hy + 3).quadraticCurveTo(x - 5.5, hy, x - 3, hy + 3).stroke({ color: eye, width: 1.6, cap: 'round' });
      g.moveTo(x + 3, hy + 3).quadraticCurveTo(x + 5.5, hy, x + 8, hy + 3).stroke({ color: eye, width: 1.6, cap: 'round' });
      g.moveTo(x - 3, hy + 7).quadraticCurveTo(x, hy + 10.5, x + 3, hy + 7).stroke({ color: 0xB06E5E, width: 1.5, cap: 'round' });
    } else if (kind === 'think') {
      // 위를 올려다보는 눈, 한쪽 눈썹
      g.ellipse(x - 5, hy, 1.9, 2.4).fill(eye); g.ellipse(x + 6, hy, 1.9, 2.4).fill(eye);
      g.circle(x - 4.5, hy - 1, 0.7).fill(0xFFFFFF); g.circle(x + 6.5, hy - 1, 0.7).fill(0xFFFFFF);
      g.moveTo(x + 3, hy - 5).lineTo(x + 9, hy - 6.5).stroke({ color: hair, width: 1.6, cap: 'round' });
      g.moveTo(x - 2, hy + 8).lineTo(x + 2.5, hy + 7.5).stroke({ color: 0xB06E5E, width: 1.4, cap: 'round' });
    } else {
      const focus = ['code', 'run', 'read', 'plan', 'reply'].includes(kind) ? 2.5 : 0;
      g.ellipse(x - 5.5, hy + 2 + focus * 0.4, 1.9, 2.4).fill(eye);
      g.ellipse(x + 5.5, hy + 2 + focus * 0.4, 1.9, 2.4).fill(eye);
      g.circle(x - 5, hy + 1.2, 0.7).fill(0xFFFFFF); g.circle(x + 6, hy + 1.2, 0.7).fill(0xFFFFFF);
      g.moveTo(x - 2.5, hy + 7.5).quadraticCurveTo(x, hy + 9.5, x + 2.5, hy + 7.5).stroke({ color: 0xB06E5E, width: 1.4, cap: 'round' });
    }
    g.ellipse(x - 9, hy + 7, 3, 1.8).fill({ color: 0xF79C9C, alpha: 0.45 });
    g.ellipse(x + 9, hy + 7, 3, 1.8).fill({ color: 0xF79C9C, alpha: 0.45 });
    if (hat !== null) {
      g.ellipse(x, hy - 13, 17, 5).fill(shade(hat, -0.1));
      g.roundRect(x - 11, hy - 25, 22, 13, 6).fill(hat);
    }
  }

  function redraw(t, moving) {
    body.clear(); front.clear();
    const step = moving ? Math.sin(t / 90) : 0;
    const bob = 0;
    // 그림자와 다리
    body.ellipse(0, 2, 15, 6).fill({ color: 0x3B4A55, alpha: 0.18 });
    body.roundRect(-7, -10 + Math.max(0, step) * -2, 5, 11, 2.5).fill(LEG);
    body.roundRect(2, -10 + Math.max(0, -step) * -2, 5, 11, 2.5).fill(LEG);
    // 몸통
    body.roundRect(-11, -30 + bob, 22, 23, 9).fill(color);
    body.roundRect(-11, -30 + bob, 22, 8, 6).fill({ color: 0xFFFFFF, alpha: 0.14 });
    const sleeve = shade(color, -0.12);
    const holds = ['read', 'code', 'run', 'plan', 'reply', 'deliver'].includes(kind);
    if (kind === 'think') {
      // 왼팔 내림, 오른손은 턱
      body.roundRect(-14, -27, 6, 14, 3).fill(sleeve); body.circle(-11, -12, 3).fill(HAND);
      front.poly([8, -27, 13, -25, 9, -31, 5, -32]).fill(sleeve);
      front.circle(6, -31.5, 3.2).fill(HAND);
    } else if (holds) {
      const type = (kind === 'code' || kind === 'run') ? Math.sin(t / 70) * 1.2 : 0;
      front.poly([-13, -27, -8, -26, -6, -14, -11, -15]).fill(sleeve);
      front.poly([13, -27, 8, -26, 6, -14, 11, -15]).fill(sleeve);
      front.circle(-7 + type, -14, 3).fill(HAND); front.circle(7 - type, -14, 3).fill(HAND);
    } else if (kind === 'search') {
      body.roundRect(-14, -27, 6, 14, 3).fill(sleeve); body.circle(-11, -12, 3).fill(HAND);
      front.poly([8, -27, 13, -26, 9, -15, 4, -16]).fill(sleeve);
      front.circle(5, -16, 3).fill(HAND);
    } else if (kind === 'rest') {
      body.roundRect(-14, -27, 6, 14, 3).fill(sleeve); body.circle(-11, -12, 3).fill(HAND);
      front.poly([8, -27, 13, -26, 10, -16, 5, -17]).fill(sleeve);
      front.circle(7, -16, 3).fill(HAND);
    } else {
      const swing = step * 3;
      body.roundRect(-14, -27 + swing, 6, 14, 3).fill(sleeve);
      body.roundRect(8, -27 - swing, 6, 14, 3).fill(sleeve);
      body.circle(-11, -12 + swing, 3).fill(HAND); body.circle(11, -12 - swing, 3).fill(HAND);
    }
    drawHead(body, -45 + bob, 0);
    drawProp(front, kind, color, t);
  }

  root.setActivity = (next) => { if (next !== kind) { kind = next; lastFrame = -1; } };
  root.getActivity = () => kind;
  root.tick = (t, moving = false) => {
    const frame = Math.floor(t / 33);
    if (frame === lastFrame) return;
    lastFrame = frame;
    redraw(t, moving);
  };
  root.emoteAnchorY = -72;
  redraw(0, false);
  return root;
}
