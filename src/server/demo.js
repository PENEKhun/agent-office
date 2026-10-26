import { validateEvent } from '../core/events.js';

const PERSONAS = [
  { source: 'claude-code', sessionId: 'demo-claude', agentId: 'demo-claude', rooms: ['library', 'dev', 'meeting'], tools: ['Grep', 'Edit', 'Task'] },
  { source: 'codex', sessionId: 'demo-codex', agentId: 'demo-codex', rooms: ['server', 'dev', 'library'], tools: ['CommandExecution', 'FileChange', 'McpToolCall'] },
  { source: 'antigravity', sessionId: 'demo-antigravity', agentId: 'demo-antigravity', rooms: ['search', 'server', 'dev'], tools: ['search_web', 'run_command', 'call_mcp_tool'] },
  { source: 'codex', sessionId: 'demo-codex', agentId: 'demo-subagent', parentAgentId: 'demo-codex', rooms: ['dev', 'desk', 'meeting'], tools: ['FileChange', 'CommandExecution', 'Grep'] }
];

const CROWD_PERSONAS = [
  { source: 'claude-code', sessionId: 'crowd-library', agentId: 'crowd-library', rooms: ['dev', 'meeting', 'library'], tools: ['Grep', 'Task', 'Edit'] },
  { source: 'codex', sessionId: 'crowd-search', agentId: 'crowd-search', rooms: ['dev', 'search', 'server'], tools: ['McpToolCall', 'FileChange', 'CommandExecution'] },
  { source: 'antigravity', sessionId: 'crowd-lounge', agentId: 'crowd-lounge', rooms: ['dev', 'search', 'meeting'], tools: ['call_mcp_tool', 'search_web', 'run_command'] },
  { source: 'claude-code', sessionId: 'crowd-child', agentId: 'crowd-child', parentAgentId: 'demo-claude', rooms: ['dev', 'library', 'search'], tools: ['Edit', 'Grep', 'Task'] }
];

function makeEvent(persona, kind, ts, values = {}) {
  const event = {
    v: 1,
    source: persona.source,
    sessionId: persona.sessionId,
    agentId: persona.agentId,
    parentAgentId: persona.parentAgentId ?? null,
    project: process.cwd().replaceAll('\\', '/'),
    title: null,
    kind,
    tool: null,
    room: null,
    detail: null,
    exitCode: null,
    git: null,
    ts,
    startedAt: null,
    endedAt: null,
    live: true,
    ...values
  };
  return validateEvent(event) ? event : null;
}

export function parseClockSpeed(args = process.argv) {
  const option = args.find((arg) => arg.startsWith('--clock-speed='));
  if (!option) return 1;
  const speed = Number(option.slice('--clock-speed='.length));
  return Number.isFinite(speed) && speed >= 1 ? Math.min(speed, 600) : 1;
}

/** 세 소스와 한 서브에이전트가 실제 경로를 오가는 데모 이벤트를 만든다. */
export function createDemo({
  intervalMs = 1400, now = Date.now, crowd = false, clockSpeed = 1,
  setIntervalFn = setInterval, clearIntervalFn = clearInterval,
  setTimeoutFn = setTimeout, clearTimeoutFn = clearTimeout
} = {}) {
  const personas = crowd ? [...PERSONAS, ...CROWD_PERSONAS] : PERSONAS;
  let index = 0;
  let timer = null;
  let quietTimer = null;
  const startEvents = personas.map((persona) => makeEvent(persona, 'session_start', now()));
  const parent = PERSONAS[1];
  const spawnEvent = makeEvent(parent, 'spawn', now(), { tool: 'Agent', room: 'elevator', detail: '서브에이전트' });
  const sequence = personas.flatMap((persona, personaIndex) => [0, 1, 2].map((step) => {
    const room = persona.rooms[step];
    const tool = persona.tools[step];
    if (step === 0) return makeEvent(persona, 'tool_start', 0, { tool, room, detail: tool });
    if (step === 1) return makeEvent(persona, 'tool_end', 0, { tool, room, detail: tool, exitCode: 0 });
    return makeEvent(persona, personaIndex % 2 === 0 ? 'thinking' : 'tool_start', 0, {
      tool: personaIndex % 2 === 0 ? null : tool,
      room,
      detail: personaIndex % 2 === 0 ? '고민 중' : tool
    });
  })).filter(Boolean);
  return {
    subscribe(onEvent) {
      let nextCommitAt = now() + 20_000;
      let nextPushAt = now() + 60_000;
      for (const event of [...startEvents.slice(0, 3), spawnEvent, ...startEvents.slice(3)]) {
        if (event) onEvent({ ...event, ts: now() });
      }
      const emit = () => {
        const timestamp = now();
        const due = [
          { action: 'commit', at: nextCommitAt },
          { action: 'push', at: nextPushAt }
        ].filter((entry) => timestamp >= entry.at)
          .sort((left, right) => left.at - right.at || (left.action === 'push' ? -1 : 1))[0];
        if (due) {
          if (due.action === 'commit') nextCommitAt = timestamp + 20_000;
          else nextPushAt = timestamp + 60_000;
          const gitEvent = makeEvent(PERSONAS[1], 'git', timestamp, {
            git: { action: due.action }, tool: 'CommandExecution', room: 'dev'
          });
          if (gitEvent) onEvent(gitEvent);
          return;
        }
        const event = sequence[index % sequence.length];
        index += 1;
        const current = { ...event, ts: timestamp };
        if (validateEvent(current)) onEvent(current);
      };
      timer = setIntervalFn(emit, intervalMs);
      if (clockSpeed > 1) quietTimer = setTimeoutFn(() => clearIntervalFn(timer), 3000);
      return () => {
        clearIntervalFn(timer);
        if (quietTimer !== null) clearTimeoutFn(quietTimer);
      };
    }
  };
}
