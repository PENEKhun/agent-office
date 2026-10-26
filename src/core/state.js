import { basename, win32 } from 'node:path';
import { validateEvent } from './events.js';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function floorName(project) {
  return project ? basename(project.replaceAll('\\', '/')) || win32.basename(project) : '무소속';
}

function identity(event) {
  return `${event.source}:${event.sessionId}:${event.agentId}`;
}

/** 정규화 이벤트를 사무실 상태 스냅샷으로 바꾼다. */
export function createState({
  idleAfterSec = 60,
  goneAfterSec = 360,
  now = Date.now,
  leavingGraceMs = 1000
} = {}) {
  const agents = new Map();
  const mailbox = new Map();
  const activity = [];
  let nextAgentNumber = 1;
  let nextActivityNumber = 1;
  let mailboxDate = localDate(now());

  function localDate(timestamp) {
    const date = new Date(timestamp);
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  }

  function getOrCreate(event) {
    const key = identity(event);
    let agent = agents.get(key);
    if (!agent) {
      agent = {
        id: `agent-${nextAgentNumber++}`,
        key,
        source: event.source,
        sessionId: event.sessionId,
        agentId: event.agentId,
        parentAgentId: event.parentAgentId,
        parentKey: null,
        project: event.project,
        title: event.title,
        status: 'arriving',
        room: 'elevator',
        detail: null,
        toolCount: 0,
        lastActivityAt: event.ts,
        leavingAt: null,
        goneAt: null,
        placeholder: false,
        children: []
      };
      agents.set(key, agent);
    }
    if (event.project !== null) agent.project = event.project;
    if (event.title !== null) agent.title = event.title;
    return agent;
  }

  function appendActivity(event, agent) {
    activity.unshift({
      id: nextActivityNumber++,
      stateAgentId: agent.id,
      ts: event.ts,
      source: event.source,
      agentId: event.agentId,
      project: event.project,
      kind: event.kind,
      room: event.room,
      live: event.live,
      detail: event.detail,
      tool: event.tool,
      git: event.git
    });
    if (activity.length > 50) activity.length = 50;
  }

  function bindChild(event, child) {
    if (!event.parentAgentId || child.parentKey) return;
    const parent = [...agents.values()].find((item) =>
      item.source === event.source && item.agentId === event.parentAgentId && !item.parentKey
    );
    if (!parent) return;
    const slot = parent.children
      .map((key) => agents.get(key))
      .find((item) => item?.placeholder && item.status !== 'leaving' && item.status !== 'gone');
    if (slot) {
      agents.delete(slot.key);
      const index = parent.children.indexOf(slot.key);
      parent.children[index] = child.key;
      child.id = slot.id;
    } else if (!parent.children.includes(child.key)) {
      parent.children.push(child.key);
    }
    child.parentKey = parent.key;
  }

  function apply(event) {
    if (!validateEvent(event)) return false;
    const currentDate = localDate(now());
    if (currentDate !== mailboxDate) {
      mailbox.clear();
      mailboxDate = currentDate;
    }
    const agent = getOrCreate(event);
    bindChild(event, agent);
    agent.lastActivityAt = event.ts;
    agent.leavingAt = null;
    agent.goneAt = null;
    agent.detail = event.detail;
    if (event.room) agent.room = event.room;

    if (event.kind === 'session_end') {
      agent.status = 'leaving';
      agent.room = 'elevator';
      agent.leavingAt = now();
    } else if (event.kind === 'spawn') {
      agent.status = 'working';
      const placeholder = {
        id: `agent-${nextAgentNumber++}`,
        key: `slot:${agent.key}:${nextAgentNumber}`,
        source: event.source,
        sessionId: event.sessionId,
        agentId: `pending-${nextAgentNumber}`,
        parentAgentId: agent.agentId,
        parentKey: agent.key,
        project: event.project,
        title: null,
        status: 'arriving',
        room: 'elevator',
        detail: null,
        toolCount: 0,
        lastActivityAt: event.ts,
        leavingAt: null,
        goneAt: null,
        placeholder: true,
        children: []
      };
      agents.set(placeholder.key, placeholder);
      agent.children.push(placeholder.key);
    } else if (event.kind === 'despawn') {
      const child = agent.children.map((key) => agents.get(key))
        .find((item) => item && item.status !== 'leaving' && item.status !== 'gone');
      if (child) {
        child.status = 'leaving';
        child.room = 'elevator';
        child.leavingAt = now();
      }
      agent.status = 'working';
    } else if (event.kind === 'thinking') {
      agent.status = 'thinking';
    } else if (event.kind === 'session_start') {
      agent.status = 'arriving';
      agent.room = 'elevator';
    } else {
      agent.status = 'working';
      if (event.kind === 'tool_end') agent.toolCount += 1;
      if (event.kind === 'turn_start' && !event.room) agent.room = 'desk';
    }

    if (event.kind === 'git' && event.git?.action === 'commit' && localDate(event.ts) === currentDate) {
      const projectKey = event.project ?? '무소속';
      mailbox.set(projectKey, (mailbox.get(projectKey) ?? 0) + 1);
    }
    appendActivity(event, agent);
    return true;
  }

  function updateStatuses(timestamp) {
    let changed = false;
    for (const agent of agents.values()) {
      if (agent.status === 'gone') {
        if (agent.goneAt !== null && timestamp - agent.goneAt >= 600_000) {
          agents.delete(agent.key);
          if (agent.parentKey) {
            const parent = agents.get(agent.parentKey);
            const childIndex = parent?.children.indexOf(agent.key) ?? -1;
            if (childIndex >= 0) parent.children.splice(childIndex, 1);
          } else {
            for (const childKey of agent.children) {
              const child = agents.get(childKey);
              if (child?.parentKey === agent.key) child.parentKey = null;
            }
          }
          changed = true;
        }
        continue;
      }
      const elapsed = Math.max(0, timestamp - agent.lastActivityAt);
      if (agent.status === 'leaving') {
        if (agent.leavingAt !== null && timestamp - agent.leavingAt >= leavingGraceMs) {
          agent.status = 'gone';
          agent.goneAt = timestamp;
          changed = true;
        }
      } else if (elapsed >= goneAfterSec * 1000) {
        if (elapsed >= goneAfterSec * 1000 + leavingGraceMs) {
          agent.status = 'gone';
          agent.room = 'elevator';
          agent.goneAt = timestamp;
        } else {
          agent.status = 'leaving';
          agent.room = 'elevator';
          agent.leavingAt = timestamp;
        }
        changed = true;
      } else if (elapsed >= idleAfterSec * 1000) {
        changed ||= agent.status !== 'idle';
        agent.status = 'idle';
      }
    }
    return changed;
  }

  function snapshot({ presentationMode = false } = {}) {
    const timestamp = now();
    updateStatuses(timestamp);
    const active = [...agents.values()].filter((agent) => !agent.parentKey && agent.status !== 'gone');
    const grouped = new Map();
    for (const agent of active) {
      const project = agent.project;
      if (!grouped.has(project)) grouped.set(project, []);
      grouped.get(project).push(agent);
    }
    const sortedProjects = [...grouped.keys()].sort((left, right) =>
      Math.max(...grouped.get(right).map((item) => item.lastActivityAt)) -
      Math.max(...grouped.get(left).map((item) => item.lastActivityAt))
    );
    const labels = new Map(sortedProjects.map((project, index) => [
      project,
      presentationMode ? `Project ${ALPHABET[index] ?? index + 1}` : floorName(project)
    ]));
    const serialize = (agent) => ({
      id: agent.id,
      source: agent.source,
      sessionId: agent.sessionId,
      agentId: agent.agentId,
      parentAgentId: agent.parentAgentId,
      parentId: agent.parentKey ? agents.get(agent.parentKey)?.id ?? null : null,
      project: presentationMode ? labels.get(agent.project) : agent.project,
      title: presentationMode && agent.title ? '작업 중' : agent.title,
      status: agent.status,
      room: agent.room,
      detail: presentationMode ? null : agent.detail,
      toolCount: agent.toolCount,
      lastActivityAt: agent.lastActivityAt,
      placeholder: agent.placeholder
    });
    return {
      floors: sortedProjects.slice(0, 6).map((project) => ({
        project: presentationMode ? labels.get(project) : project,
        name: labels.get(project),
        agents: grouped.get(project).flatMap((parent) => [
          serialize(parent),
          ...parent.children.map((key) => agents.get(key))
            .filter((child) => child && child.status !== 'gone').map(serialize)
        ])
      })),
      mailbox: Object.fromEntries([...mailbox].map(([project, count]) => [
        presentationMode ? labels.get(project) : project, count
      ])),
      moreFloors: Math.max(0, sortedProjects.length - 6),
      activity: activity.map((item) => ({
        ...item,
        project: presentationMode ? labels.get(item.project) : item.project,
        detail: presentationMode ? null : item.detail
      })),
      now: timestamp
    };
  }

  function tick({ presentationMode = false } = {}) {
    if (!updateStatuses(now())) return null;
    return snapshot({ presentationMode });
  }

  return { apply, snapshot, tick };
}
