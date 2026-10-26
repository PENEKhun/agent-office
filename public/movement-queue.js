const ROOM_DURATION_MS = 3000;
const TRAVEL_MS = 700;

/** 상태 이벤트를 방 이동으로 바꾸고 빠른 이벤트에도 방 체류를 보장한다. */
export class MovementQueue {
  constructor({ minimumStayMs = ROOM_DURATION_MS, travelMs = TRAVEL_MS } = {}) {
    this.minimumStayMs = minimumStayMs;
    this.travelMs = travelMs;
    this.agents = new Map();
  }

  setTarget(agentId, room, timestamp, point = null, message = null, tone = 'work', options = {}) {
    if (!room) return;
    const minimumStayMs = Number.isFinite(options.minimumStayMs) ? Math.max(0, options.minimumStayMs) : this.minimumStayMs;
    let agent = this.agents.get(agentId);
    if (!agent) {
      agent = { room, fromRoom: room, point, fromPoint: point, message, tone, enteredAt: timestamp, minimumStayMs, queue: [] };
      this.agents.set(agentId, agent);
      return;
    }
    if (options.immediate) {
      agent.fromRoom = agent.room;
      agent.fromPoint = options.fromPoint ?? agent.point;
      agent.room = room;
      agent.point = point;
      agent.message = message;
      agent.tone = tone;
      agent.enteredAt = timestamp;
      agent.minimumStayMs = minimumStayMs;
      agent.queue.length = 0;
      return;
    }
    const pendingRoom = agent.queue.at(-1)?.room ?? agent.room;
    if (pendingRoom !== room) {
      if (agent.queue.length) agent.queue[0].minimumStayMs = 0;
      if (agent.queue.length >= 2) agent.queue.splice(1);
      agent.queue.push({ room, point, message, tone, minimumStayMs });
    }
    else if (agent.queue.length) Object.assign(agent.queue.at(-1), { point, message, tone, minimumStayMs });
    else if (agent.movingUntil > timestamp) {
      agent.point = point ?? agent.point;
      agent.nextMessage = message;
      agent.nextTone = tone;
    } else Object.assign(agent, { point: point ?? agent.point, message, tone });
  }

  removeMissing(agentIds) {
    const existing = new Set(agentIds);
    for (const id of this.agents.keys()) {
      if (!existing.has(id)) this.agents.delete(id);
    }
  }

  clearPending(agentId) {
    const agent = this.agents.get(agentId);
    if (agent) agent.queue.length = 0;
  }

  position(agentId, timestamp, rooms, speed = 1) {
    const agent = this.agents.get(agentId);
    if (!agent) return null;
    if (timestamp - agent.enteredAt >= agent.minimumStayMs && agent.queue.length) {
      agent.fromRoom = agent.room;
      const next = agent.queue.shift();
      agent.room = next.room;
      agent.fromPoint = agent.point;
      agent.point = next.point;
      agent.nextMessage = next.message;
      agent.nextTone = next.tone;
      agent.minimumStayMs = next.minimumStayMs;
      agent.enteredAt = timestamp;
    }

    const start = agent.fromPoint ?? rooms[agent.fromRoom] ?? rooms.desk;
    const destination = agent.point ?? rooms[agent.room] ?? rooms.desk;
    const duration = this.travelMs / Math.max(0.1, speed);
    const progress = Math.min(1, Math.max(0, (timestamp - agent.enteredAt) / duration));
    agent.movingUntil = progress < 1 ? agent.enteredAt + duration : null;
    if (progress >= 1 && agent.nextMessage !== undefined && agent.nextMessage !== null) {
      agent.message = agent.nextMessage;
      agent.tone = agent.nextTone ?? agent.tone;
      delete agent.nextMessage;
      delete agent.nextTone;
    }
    const eased = progress * progress * (3 - 2 * progress);
    const result = {
      x: start.x + (destination.x - start.x) * eased,
      y: start.y + (destination.y - start.y) * eased,
      room: agent.room,
      moving: progress < 1,
      queueLength: agent.queue.length
    };
    if (agent.message !== null && agent.message !== undefined) {
      result.message = agent.message;
      result.tone = agent.tone;
    }
    return result;
  }
}
