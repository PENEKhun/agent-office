// 묶음 카드(여러 에이전트 목록)를 사무실 위가 아니라 배경의 빈 곳에 놓는다.
// 화면 좌표의 사무실 외곽 다각형과 겹치는 넓이가 가장 작은 자리를 고르고,
// 같으면 칩에서 가까운 자리를 고른다.

export function convexHull(points) {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length < 3) return pts;
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (const p of pts.slice().reverse()) {
    while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), p) <= 0) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

function clip(polygon, inside, intersect) {
  const out = [];
  for (let i = 0; i < polygon.length; i += 1) {
    const cur = polygon[i];
    const prev = polygon[(i + polygon.length - 1) % polygon.length];
    const curIn = inside(cur);
    const prevIn = inside(prev);
    if (curIn) {
      if (!prevIn) out.push(intersect(prev, cur));
      out.push(cur);
    } else if (prevIn) {
      out.push(intersect(prev, cur));
    }
  }
  return out;
}

function polygonArea(polygon) {
  let sum = 0;
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

// 볼록 다각형과 사각형이 겹치는 넓이
export function overlapArea(polygon, rect) {
  if (!polygon?.length) return 0;
  const x0 = rect.x;
  const x1 = rect.x + rect.width;
  const y0 = rect.y;
  const y1 = rect.y + rect.height;
  const atX = (x) => (a, b) => ({ x, y: a.y + (b.y - a.y) * (x - a.x) / (b.x - a.x) });
  const atY = (y) => (a, b) => ({ x: a.x + (b.x - a.x) * (y - a.y) / (b.y - a.y), y });
  let poly = polygon;
  poly = clip(poly, (p) => p.x >= x0, atX(x0)); if (!poly.length) return 0;
  poly = clip(poly, (p) => p.x <= x1, atX(x1)); if (!poly.length) return 0;
  poly = clip(poly, (p) => p.y >= y0, atY(y0)); if (!poly.length) return 0;
  poly = clip(poly, (p) => p.y <= y1, atY(y1));
  return poly.length ? polygonArea(poly) : 0;
}

function rectOverlap(a, b) {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

export function pickCardSpot({ width, height, viewWidth, viewHeight, anchor, hull = [], avoid = [], margin = 8, step = 12 }) {
  const maxX = Math.max(margin, viewWidth - width - margin);
  const maxY = Math.max(margin, viewHeight - height - margin);
  const xs = new Set([margin, maxX]);
  const ys = new Set([margin, maxY]);
  for (let x = margin; x < maxX; x += step) xs.add(x);
  for (let y = margin; y < maxY; y += step) ys.add(y);
  const cx = anchor?.x ?? viewWidth / 2;
  const cy = anchor?.y ?? viewHeight / 2;
  let best = null;
  for (const x of xs) {
    for (const y of ys) {
      const rect = { x, y, width, height };
      let cost = overlapArea(hull, rect);
      for (const other of avoid) cost += rectOverlap(rect, other) * (other.weight ?? 2);
      const dist = Math.hypot(x + width / 2 - cx, y + height / 2 - cy);
      // 겹침 넓이를 거의 절대적으로 우선하고, 거리는 동점 정리용
      const score = cost * 1000 + dist;
      if (!best || score < best.score) best = { x, y, overlap: cost, score };
    }
  }
  return best ?? { x: margin, y: margin, overlap: 0, score: 0 };
}
