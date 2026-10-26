/** 화면 좌표 기준으로 반경 안에 있는 캐릭터 무리를 묶는다. */
export function groupNearby(entries, radius = 40) {
  const pending = new Set(entries.map((entry, index) => index));
  const groups = [];
  while (pending.size) {
    const first = pending.values().next().value;
    pending.delete(first);
    const group = [entries[first]];
    const frontier = [first];
    while (frontier.length) {
      const current = entries[frontier.pop()];
      for (const index of [...pending]) {
        const candidate = entries[index];
        if (Math.hypot(current.x - candidate.x, current.y - candidate.y) > radius) continue;
        pending.delete(index);
        frontier.push(index);
        group.push(candidate);
      }
    }
    groups.push(group);
  }
  return groups;
}

/** Groups connected entries only when their screen-space rectangles intersect. */
export function groupOverlapping(entries, boundsFor) {
  const pending = new Set(entries.map((_, index) => index));
  const groups = [];
  while (pending.size) {
    const first = pending.values().next().value;
    pending.delete(first);
    const group = [entries[first]];
    const frontier = [first];
    while (frontier.length) {
      const current = frontier.pop();
      for (const index of [...pending]) {
        if (!boundsOverlap(boundsFor(entries[current]), boundsFor(entries[index]))) continue;
        pending.delete(index);
        frontier.push(index);
        group.push(entries[index]);
      }
    }
    groups.push(group);
  }
  return groups;
}

export function boundsOverlap(left, right) {
  return left.x < right.x + right.width && left.x + left.width > right.x &&
    left.y < right.y + right.height && left.y + left.height > right.y;
}
