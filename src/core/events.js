const SOURCES = new Set(['claude-code', 'codex', 'antigravity', 'claude-desktop', 'cowork', 'opencode']);
const KINDS = new Set([
  'session_start',
  'session_end',
  'turn_start',
  'turn_end',
  'thinking',
  'tool_start',
  'tool_end',
  'message',
  'spawn',
  'despawn',
  'git'
]);
const ROOMS = new Set(['library', 'dev', 'server', 'search', 'meeting', 'desk', 'lounge', 'elevator']);
const GIT_ACTIONS = new Set(['commit', 'push', 'mr']);

function isNullableString(value) {
  return value === null || typeof value === 'string';
}

function isNullableNumber(value) {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

/** 공통 이벤트가 SPEC의 형식에 맞는지 확인 */
export function validateEvent(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    return false;
  }

  if (event.v !== 1 || !SOURCES.has(event.source) || typeof event.sessionId !== 'string') {
    return false;
  }
  if (typeof event.agentId !== 'string' || !isNullableString(event.parentAgentId)) {
    return false;
  }
  if (!isNullableString(event.project) || !isNullableString(event.title) || !KINDS.has(event.kind)) {
    return false;
  }
  if (!isNullableString(event.tool) || (event.room !== null && !ROOMS.has(event.room))) {
    return false;
  }
  if (!isNullableString(event.detail) || (event.detail !== null && event.detail.length > 40)) {
    return false;
  }
  if (!isNullableNumber(event.exitCode) || !isFiniteNumber(event.ts)) {
    return false;
  }
  if (!isNullableNumber(event.startedAt) || !isNullableNumber(event.endedAt)) {
    return false;
  }
  if (typeof event.live !== 'boolean') {
    return false;
  }
  if (event.git !== null) {
    if (!event.git || typeof event.git !== 'object' || !GIT_ACTIONS.has(event.git.action)) {
      return false;
    }
  }

  return true;
}
