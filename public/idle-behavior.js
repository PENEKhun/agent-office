import { IDLE_SPOTS, isoSim, ROOMS } from './floor-plan.js';

/** 가중치를 적용해 현재 지점과 다른 유휴 지점을 고른다. */
export function chooseIdleSpot(weights, currentSpot = null, random = Math.random) {
  const choices = Object.entries(weights ?? {})
    .filter(([spot, weight]) => spot !== currentSpot && Number.isFinite(weight) && weight > 0);
  const total = choices.reduce((sum, [, weight]) => sum + weight, 0);
  if (!total) return null;
  let selected = Math.min(Math.max(0, random()), 0.999999999) * total;
  for (const [spot, weight] of choices) {
    selected -= weight;
    if (selected < 0) return spot;
  }
  return choices.at(-1)[0];
}

/** 다음 유휴 지점까지 20~40초를 고른다. */
export function idleDelayMs(random = Math.random) {
  return 20_000 + Math.floor(Math.min(Math.max(0, random()), 0.999999999) * 20_001);
}

export function personalityFor(agent, settings = {}) {
  const values = settings[agent.source] ?? {};
  const speed = Number.isFinite(values.speed) ? values.speed : 1;
  const childSpeed = agent.parentAgentId ? (settings.subagentSpeedMultiplier ?? 1) : 1;
  return { ...values, speed: speed * childSpeed, bounce: values.bounce ?? 0.6 };
}

export function nextIdleSpot(agent, current, settings = {}, random = Math.random) {
  const weights = Object.fromEntries(Object.entries(personalityFor(agent, settings).idleSpots ?? {})
    .filter(([spot]) => ['sofa', 'coffee', 'water'].includes(spot)));
  const selected = chooseIdleSpot(weights, current, random);
  if (selected && IDLE_SPOTS[selected]) return selected;
  const available = ['sofa', 'coffee', 'water'].filter((spot) => spot !== current);
  return available.length ? available[Math.floor(random() * available.length)] : null;
}

export function idleSpotPosition(agentId, spotId, allocator) {
  const spot = IDLE_SPOTS[spotId];
  const tile = allocator.assignAux(agentId, `idle:${spotId}`, spot.points, ROOMS[spot.room].rect);
  const point = isoSim(tile.x, tile.y);
  return { x: point.x, y: point.y, tileX: tile.x, tileY: tile.y, overflow: tile.overflow };
}
