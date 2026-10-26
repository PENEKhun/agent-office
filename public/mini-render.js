import { ACTIVITIES, activityOf } from './office-activity.js';
import { sourceLabel, statusLabel } from './labels.js';

const ICONS = { 'claude-code': 'anthropic', 'claude-desktop': 'anthropic', codex: 'openai', antigravity: 'googlegemini', cowork: 'anthropic' };
const GLYPHS = {
  read: '<path d="M3 8l8 2v10l-8-2zm22 0l-8 2v10l8-2z"/>',
  code: '<path d="M10 8l-5 6 5 6m8-12l5 6-5 6m-1-16l-5 20"/>',
  run: '<path d="M7 8l6 6-6 6m8 1h7"/>',
  search: '<circle cx="12" cy="12" r="6"/><path d="M16 16l6 6"/>',
  plan: '<path d="M5 8l2 2 3-4m3 3h10M5 17l2 2 3-4m3 3h10"/>',
  reply: '<path d="M5 6h18v12H12l-5 4v-4H5z"/><circle cx="10" cy="12" r="1" fill="white"/><circle cx="14" cy="12" r="1" fill="white"/><circle cx="18" cy="12" r="1" fill="white"/>',
  think: '<path d="M14 4a7 7 0 0 0-4 13v3h8v-3a7 7 0 0 0-4-13zm-3 19h6"/>',
  rest: '<path d="M6 11h12v9H6zM18 13h2a3 3 0 0 1 0 6h-2M10 8q2-2 0-4m5 4q2-2 0-4"/>',
  walk: '<path d="M5 7l7 7-7 7m8-14l7 7-7 7"/>',
  deliver: '<path d="M14 3l10 5-10 5L4 8zm-10 8l9 5v10l-9-5zm20 0l-9 5v10l9-5z"/>'
};

export function activityIcon(kind) {
  const activity = ACTIVITIES[kind] ? kind : 'reply';
  const color = `#${ACTIVITIES[activity].color.toString(16).padStart(6, '0')}`;
  const svg = `<svg class="activity-icon" viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="13" fill="${color}"/><g fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${GLYPHS[activity]}</g></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function titleFor(agent) {
  return `${agent.title || sourceLabel(agent.source)} · ${statusLabel(agent.status)}`;
}

export function renderMini(list, snapshot, { actualRooms = new Map(), movingAgents = new Set() } = {}) {
  const agents = snapshot.floors.flatMap((floor) => floor.agents);
  list.replaceChildren();
  const available = list.clientWidth;
  const occupied = agents.length * 40 + Math.max(0, agents.length - 1) * 8;
  const hasOverflow = occupied > available;
  const visibleCount = hasOverflow ? Math.max(0, Math.floor((available - 36) / 48)) : agents.length;
  for (const agent of agents.slice(0, visibleCount)) {
    const item = document.createElement('span');
    item.className = 'agent'; item.title = titleFor(agent); item.setAttribute('aria-label', item.title);
    const icon = document.createElement('img'); icon.alt = ''; icon.src = `/assets/icons/${ICONS[agent.source] ?? 'anthropic'}.svg`;
    const status = document.createElement('i'); status.className = `status status-${agent.status}`;
    const room = actualRooms.get(agent.id) ?? agent.room;
    const activityStatus = agent.status === 'arriving' && !movingAgents.has(agent.id) ? 'working' : agent.status;
    const activity = activityOf({ status: activityStatus, room, delivering: room === 'delivery' });
    const glyph = document.createElement('img'); glyph.className = 'activity-symbol';
    glyph.alt = ''; glyph.src = activityIcon(activity);
    glyph.title = ACTIVITIES[activity].label;
    glyph.setAttribute('aria-hidden', 'true');
    item.append(icon, status, glyph); list.append(item);
  }
  if (visibleCount < agents.length) {
    const more = document.createElement('span');
    more.className = 'more'; more.textContent = `+${agents.length - visibleCount}`;
    more.title = `${agents.length - visibleCount}명 더`;
    list.append(more);
  }
  if (!agents.length) list.innerHTML = '<span id="empty">활동 중인 에이전트 없음</span>';
}
