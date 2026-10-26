// 사무실 평면도 데이터 (SPEC 9.1). PIXI에 의존하지 않는 순수 데이터와 좌표 함수만 둔다.
// 좌표는 타일 단위 실수. 방 범위는 [x0, x1) × [y0, y1).

export const TILE_W = 64;
export const TILE_H = 32;
export const PLAN = { width: 20, depth: 14, wallHeight: 92, slabHeight: 16 };

// ---------- 시점 회전 (90도 단위) ----------
// 평면도 데이터와 시뮬레이션(좌석·이동)은 항상 회전 0 기준 좌표를 쓴다.
// 화면에 그릴 때만 iso()/depthOf()가 현재 회전을 적용한다.
let rotation = 0;
let straight = false; // true면 벽 하나를 정면으로 보는 시점(0·90·180·270도)

// 시점 8개(45도 간격): 짝수 = 정면(벽 하나가 정면), 홀수 = 사선(모서리가 정면).
// 순서대로 돌리면 화면이 한 방향으로 자연스럽게 이어진다.
export const VIEW_COUNT = 8;
let view = 1; // 기본은 기존 사선 시점

/** 현재 시점 회전(0~3, 시계 방향 90도 단위). */
export function getRotation() {
  return rotation;
}

export function setRotation(next) {
  rotation = ((Math.round(Number(next) || 0) % 4) + 4) % 4;
  view = rotation * 2 + (straight ? 0 : 1);
  return rotation;
}

/** 정면 시점인지. */
export function isStraight() {
  return straight;
}

export function getView() {
  return view;
}

/** 시점 번호(0~7)를 정한다. 짝수 = 정면, 홀수 = 사선. */
export function setView(next) {
  view = ((Math.round(Number(next) || 0) % VIEW_COUNT) + VIEW_COUNT) % VIEW_COUNT;
  straight = view % 2 === 0;
  rotation = Math.floor(view / 2);
  return view;
}

/** 사람이 읽는 시점 각도(0, 45, 90 … 315). */
export function viewAngle(v = view) {
  return v * 45;
}

// 정면 시점의 타일 크기(px). 위에서 비스듬히 내려다보는 느낌이 나게 세로를 줄인다.
export const STRAIGHT_TILE_W = 46;
export const STRAIGHT_TILE_H = 26;

/** 회전된 평면도의 가로·세로 타일 수. */
export function viewDims(r = rotation) {
  return r % 2 ? { width: PLAN.depth, depth: PLAN.width } : { width: PLAN.width, depth: PLAN.depth };
}

/** 원래 타일 좌표 → 회전된 타일 좌표(u, v). */
export function rotateTile(x, y, r = rotation) {
  const W = PLAN.width, D = PLAN.depth;
  if (r === 1) return { u: D - y, v: x };
  if (r === 2) return { u: W - x, v: D - y };
  if (r === 3) return { u: y, v: W - x };
  return { u: x, v: y };
}

/** 회전된 타일 좌표(u, v) → 원래 타일 좌표. */
export function unrotateTile(u, v, r = rotation) {
  const W = PLAN.width, D = PLAN.depth;
  if (r === 1) return { x: v, y: D - u };
  if (r === 2) return { x: W - u, y: D - v };
  if (r === 3) return { x: W - v, y: u };
  return { x: u, y: v };
}

/** 원래 좌표계의 방향 벡터가 회전 후 어느 방향이 되는지. */
export function rotateDir(dx, dy, r = rotation) {
  if (r === 1) return { du: -dy, dv: dx };
  if (r === 2) return { du: -dx, dv: -dy };
  if (r === 3) return { du: dy, dv: -dx };
  return { du: dx, dv: dy };
}

/** 회전된 타일 좌표를 화면 좌표로 투영. */
export function project(u, v, z = 0) {
  if (straight) return { x: (u - viewDims().width / 2) * STRAIGHT_TILE_W, y: v * STRAIGHT_TILE_H - z };
  return { x: (u - v) * (TILE_W / 2), y: (u + v) * (TILE_H / 2) - z };
}

/** 타일 좌표(x, y)와 높이 z(px)를 현재 시점의 화면 좌표로 바꾼다. */
export function iso(x, y, z = 0) {
  const { u, v } = rotateTile(x, y);
  return project(u, v, z);
}

/** 회전과 무관한 기준 좌표(시뮬레이션용). 회전 0의 iso와 같다. */
export function isoSim(x, y, z = 0) {
  // 시점(정면/사선)과 무관하게 항상 사선 회전 0의 투영을 쓴다.
  return { x: (x - y) * (TILE_W / 2), y: (x + y) * (TILE_H / 2) - z };
}

/** 기준 좌표(isoSim) 화면점 → 타일 좌표. */
export function simToTile(px, py) {
  return { x: (px / (TILE_W / 2) + py / (TILE_H / 2)) / 2, y: (py / (TILE_H / 2) - px / (TILE_W / 2)) / 2 };
}

/** 기준 좌표 화면점 → 현재 시점 화면점. */
export function simToView(px, py) {
  const tile = simToTile(px, py);
  return iso(tile.x, tile.y);
}

/** 깊이 정렬 값. 현재 시점에서 화면 앞쪽일수록 크다. */
export function depthOf(x, y) {
  const { u, v } = rotateTile(x, y);
  return depthUV(u, v);
}

/** 회전 좌표의 깊이 값. 정면 시점은 앞뒤(v)만 본다. */
export function depthUV(u, v) {
  return straight ? Math.round(v * 200 + u * 0.01) : Math.round((u + v) * 100);
}

export const ROOMS = {
  library: { rect: [0, 0, 6, 6], seats: [[1.4, 1.6], [4.6, 3.1], [1.4, 3.1], [2.5, 4.4], [3.6, 4.4], [3.0, 1.7]] },
  meeting: { rect: [6, 0, 12, 5], seats: [[8.0, 3.5], [9.0, 3.5], [10.0, 3.5], [7.0, 2.2], [11.0, 2.2], [9.0, 0.9]] },
  elevator: { rect: [12, 0, 14, 3], seats: [[12.6, 1.4], [13.4, 1.4], [12.6, 2.4], [13.4, 2.4]] },
  server: { rect: [14, 0, 20, 6], seats: [[15.1, 1.9], [16.4, 1.9], [17.7, 1.9], [19.0, 1.9], [15.6, 4.9], [18.4, 4.9]] },
  dev: { rect: [6, 5, 14, 11], seats: [[7.6, 7.2], [9.4, 7.2], [11.2, 7.2], [13.0, 7.2], [7.6, 9.8], [9.4, 9.8], [11.2, 9.8], [13.0, 9.8]] },
  search: { rect: [0, 7, 6, 14], seats: [[1.7, 8.6], [1.7, 10.4], [1.7, 12.2], [3.8, 10.2], [4.4, 12.9], [3.2, 12.9]] },
  desk: { rect: [14, 7, 20, 14], seats: [[15.6, 9.0], [18.0, 9.0], [15.6, 11.1], [18.0, 11.1], [15.6, 13.2], [18.0, 13.2]] },
  lounge: { rect: [7, 11, 13, 14], seats: [[8.2, 12.4], [9.3, 12.4], [10.4, 12.4], [11.6, 12.4], [12.5, 13.4], [10.6, 13.4]] }
};

// M6 유휴 행동용 지점
export const IDLE_SPOTS = {
  sofa: { room: 'lounge', points: [[8.2, 12.4], [9.3, 12.4], [10.4, 12.4]] },
  coffee: { room: 'lounge', points: [[11.6, 12.4]] },
  water: { room: 'lounge', points: [[12.5, 13.4]] }
};

/** 좌석 배정기. 방별로 들어온 순서대로 좌석을 주고, 나가면 반납한다. */
export function createSeatAllocator(rooms = ROOMS) {
  const roomTaken = new Map();
  const auxiliaryTaken = new Map();
  const roomByAgent = new Map();
  const auxiliaryByAgent = new Map();
  const pointOwners = new Map();

  const pointKey = (point) => `${point.x.toFixed(3)},${point.y.toFixed(3)}`;

  function releaseRoom(agentId) {
    const current = roomByAgent.get(agentId);
    if (!current) return;
    roomTaken.get(current.group)?.delete(agentId);
    pointOwners.delete(pointKey(current.point));
    roomByAgent.delete(agentId);
  }

  function releaseAux(agentId, group = null) {
    const allocations = auxiliaryByAgent.get(agentId);
    if (!allocations) return;
    for (const [key, allocation] of allocations) {
      if (group !== null && key !== group) continue;
      auxiliaryTaken.get(key)?.delete(agentId);
      pointOwners.delete(pointKey(allocation.point));
      allocations.delete(key);
    }
    if (!allocations.size) auxiliaryByAgent.delete(agentId);
  }

  function reserve(agentId, group, index, point, target, kind) {
    target.set(agentId, index);
    pointOwners.set(pointKey(point), `${kind}:${agentId}:${group}`);
    const allocation = { group, index, point };
    if (kind === 'room') roomByAgent.set(agentId, allocation);
    else {
      if (!auxiliaryByAgent.has(agentId)) auxiliaryByAgent.set(agentId, new Map());
      auxiliaryByAgent.get(agentId).set(group, allocation);
    }
    return { ...point, overflow: point.overflow ?? false };
  }

  function assign(agentId, roomId) {
    const room = rooms[roomId] ?? rooms.desk;
    const key = rooms[roomId] ? roomId : 'desk';
    const current = roomByAgent.get(agentId);
    if (current?.group === key) return { ...current.point };
    releaseRoom(agentId);
    if (!roomTaken.has(key)) roomTaken.set(key, new Map());
    const seats = roomTaken.get(key);
    const used = new Set(seats.values());
    let index = 0;
    let point;
    while (true) {
      while (used.has(index)) index += 1;
      point = seatPoint(room, index);
      if (!pointOwners.has(pointKey(point))) break;
      index += 1;
    }
    return reserve(agentId, key, index, point, seats, 'room');
  }

  function assignAux(agentId, group, points, rect) {
    const current = auxiliaryByAgent.get(agentId)?.get(group);
    if (current) return { ...current.point };
    if (!auxiliaryTaken.has(group)) auxiliaryTaken.set(group, new Map());
    const taken = auxiliaryTaken.get(group);
    const used = new Set(taken.values());
    let index = 0;
    let point;
    const area = { rect, seats: points };
    while (true) {
      while (used.has(index)) index += 1;
      point = seatPoint(area, index);
      if (!pointOwners.has(pointKey(point))) break;
      index += 1;
    }
    return reserve(agentId, group, index, point, taken, 'aux');
  }

  function release(agentId) {
    releaseRoom(agentId);
    releaseAux(agentId);
  }

  return { assign, assignAux, releaseAux, release };
}

function seatPoint(room, index) {
  if (index < room.seats.length) {
    const [x, y] = room.seats[index];
    return { x, y, overflow: false };
  }
  // 좌석이 모자라면 방 앞쪽 경계 바로 바깥 복도에 줄을 세운다.
  const [x0, , x1, y1] = room.rect;
  const extra = index - room.seats.length;
  const span = Math.max(1, x1 - x0 - 1);
  return { x: x0 + 0.6 + (extra % span), y: y1 + 0.4 + Math.floor(extra / span) * 0.6, overflow: true };
}
