const SOURCES = {
  'claude-code': 'Claude Code',
  'claude-desktop': 'Claude Desktop',
  codex: 'Codex',
  antigravity: 'Antigravity',
  cowork: 'Claude Cowork',
  opencode: 'opencode'
};

import { ACTIVITIES, activityOf } from './office-activity.js';
import { getTheme } from './themes/index.js';

const DETAIL_LABELS = new Map([
  ['commandexecution', '명령 실행'], ['filechange', '파일 수정'], ['mcptoolcall', '도구 사용'],
  ['bash', '명령 실행'], ['edit', '파일 수정'], ['write', '파일 작성'], ['grep', '자료 검색'],
  ['search_web', '웹 검색'], ['run_command', '명령 실행'], ['call_mcp_tool', '도구 사용'],
  ['task', '서브에이전트 작업'], ['agent', '서브에이전트 작업']
]);

export function sourceLabel(source) {
  return SOURCES[source] ?? '에이전트';
}

export function connectivityStatusLabel({ folder, recent }) {
  if (!folder) return '폴더 없음';
  if (!recent) return '폴더 있음 · 최근 활동 없음';
  return '활동 중';
}

export function roomLabel(room) {
  if (room === 'delivery') return '배송 중';
  if (room === 'elevator') return getTheme().elevatorHallName;
  return getTheme().rooms[room]?.name ?? '사무실';
}

export function statusLabel(status) {
  return getTheme().statusLabels[status] ?? '작업 중';
}

export function agentLabel(agent, { hideId = false } = {}) {
  if (agent.placeholder) return '서브에이전트 대기';
  if (agent.parentAgentId) return `${sourceLabel(agent.source)}${hideId ? '' : ` · ${String(agent.parentAgentId).slice(0, 4)}`}`;
  const title = typeof agent.title === 'string' ? agent.title.trim().slice(0, 14) : '';
  const shortId = String(agent.agentId ?? '').slice(0, 4);
  return `${title || sourceLabel(agent.source)}${!hideId && shortId ? ` · ${shortId}` : ''}`;
}

export function detailLabel(detail, tool = null) {
  const value = typeof detail === 'string' ? detail.trim() : '';
  const candidate = value || (typeof tool === 'string' ? tool : '');
  if (!candidate) return '';
  const known = DETAIL_LABELS.get(candidate.toLowerCase());
  const label = known ?? (/[가-힣]/u.test(candidate) ? candidate.slice(0, 28) : '세부 작업');
  return ['도구 사용', '세부 작업'].includes(label) ? '' : label;
}

export function activityLabel(item) {
  if (item.kind === 'thinking') return '고민 중…';
  if (item.kind === 'session_start' || item.kind === 'spawn') return '출근';
  if (item.kind === 'session_end' || item.kind === 'despawn') return '퇴근';
  if (item.kind === 'git') return 'git 작업 완료';
  return speechLabel({ ...item, status: 'working', detail: item.detail || item.tool });
}

export function speechLabel(agent, elapsedSeconds = 0) {
  if (agent.status === 'thinking') return `고민 중… ${Math.max(0, elapsedSeconds)}초`;
  const activity = activityOf({
    status: agent.status,
    room: agent.room,
    delivering: agent.delivering === true
  });
  const verb = ACTIVITIES[activity]?.label ?? ACTIVITIES.reply.label;
  if (agent.status === 'idle') return verb;
  const detail = detailLabel(agent.detail);
  if (!detail || detail === verb || detail === verb.replace(/\s*중$/u, '')) return verb;
  return `${verb} · ${detail}`;
}
