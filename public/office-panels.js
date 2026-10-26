import { activityLabel, agentLabel, roomLabel, sourceLabel, statusLabel } from '/labels.js';
import { getTheme } from '/themes/index.js';

const COLORS = { 'claude-code': '#D97757', 'claude-desktop': '#C2410C', codex: '#10A37F', antigravity: '#4285F4', cowork: '#7C5CDB' };
const ICONS = { 'claude-code': 'anthropic', 'claude-desktop': 'anthropic', codex: 'openai', antigravity: 'googlegemini', cowork: 'anthropic' };

function appendFloor(nav, floor, selectedProject, onSelect) {
  const button = document.createElement('button');
  button.className = `floor-card ${selectedProject === floor.project ? 'selected' : ''}`;
  const icon = document.createElement('span'); icon.className = 'floor-icon'; icon.textContent = floor.project === null ? '🏢' : '📁';
  const copy = document.createElement('span'); copy.className = 'floor-copy';
  const title = document.createElement('strong'); title.textContent = floor.name;
  const count = document.createElement('small'); count.textContent = `${floor.agents.length}명 활동 중`;
  copy.append(title, count); button.append(icon, copy);
  button.addEventListener('click', () => onSelect(floor.project));
  nav.append(button);
}

function renderFloors(snapshot, selectedProject, onSelect) {
  const nav = document.querySelector('#floor-list'); nav.replaceChildren();
  const all = { project: null, name: '전체 오피스', agents: snapshot.floors.flatMap((floor) => floor.agents) };
  document.querySelector('#floor-count').textContent = `${snapshot.floors.length}개 층`;
  [all, ...snapshot.floors].forEach((floor) => appendFloor(nav, floor, selectedProject, onSelect));
  document.querySelector('#floor-name').textContent = selectedProject === null ? '전체 오피스' : snapshot.floors.find((floor) => floor.project === selectedProject)?.name ?? '프로젝트';
  document.querySelector('#floor-path').textContent = selectedProject === null ? '' : '프로젝트 층';
}

function renderPeople(agents, { selectedAgentId, actualRooms, onSelectAgent, presentationMode = false } = {}) {
  const list = document.querySelector('#people-list'); list.replaceChildren();
  document.querySelector('#agent-count').textContent = `${agents.length}명`;
  for (const agent of agents) {
    const row = document.createElement('div'); row.className = `person ${agent.id === selectedAgentId ? 'selected' : ''}`;
    row.setAttribute('role', 'button'); row.tabIndex = 0;
    const select = () => onSelectAgent?.(agent.id);
    row.addEventListener('click', select);
    row.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(); }
    });
    const color = document.createElement('span'); color.className = 'person-color';
    color.style.background = COLORS[agent.source] ?? '#718096';
    const main = document.createElement('span'); main.className = 'person-main';
    const name = document.createElement('strong'); name.textContent = `${agent.parentId ? '↳ ' : ''}${agentLabel(agent, { hideId: presentationMode })}`;
    const status = document.createElement('small'); status.textContent = `${roomLabel(actualRooms?.get(agent.id) ?? agent.room)} · 도구 ${agent.toolCount}회`;
    const badge = document.createElement('span'); badge.className = `person-status status-${agent.status}`; badge.textContent = statusLabel(agent.status);
    main.append(name, status); row.append(color, main, badge); list.append(row);
  }
  if (!agents.length) list.innerHTML = '<div class="empty">이 층에 에이전트가 없습니다.</div>';
}

function renderLegend(rooms) {
  const legend = document.querySelector('#room-legend'); legend.replaceChildren();
  const themedRooms = getTheme().rooms;
  for (const [id, room] of Object.entries(rooms)) {
    const themed = themedRooms[id];
    const item = document.createElement('span'); item.className = 'room-item';
    const icon = document.createElement('span'); icon.textContent = themed.icon; icon.setAttribute('aria-hidden', 'true');
    const name = document.createElement('span'); name.textContent = themed.name;
    const swatch = document.createElement('i'); swatch.className = 'swatch';
    const color = themed.legendColor ?? themed.floor.colors[0];
    swatch.style.backgroundColor = `#${color.toString(16).padStart(6, '0')}`;
    item.append(icon, name, swatch); legend.append(item);
  }
}

function renderActivities(snapshot, presentationMode) {
  const list = document.querySelector('#activity-list'); list.replaceChildren();
  const agents = snapshot.floors.flatMap((floor) => floor.agents);
  for (const item of snapshot.activity.slice(0, 50)) {
    const row = document.createElement('li'); row.className = 'activity';
    const time = document.createElement('time'); time.textContent = new Date(item.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const icon = document.createElement('img'); icon.className = 'activity-icon'; icon.alt = '';
    icon.src = `/assets/icons/${ICONS[item.source] ?? 'anthropic'}.svg`;
    const agent = agents.find((entry) => entry.source === item.source && entry.agentId === item.agentId);
    const name = document.createElement('strong'); name.className = 'activity-name';
    name.textContent = agent ? agentLabel(agent, { hideId: presentationMode }) :
      `${sourceLabel(item.source)}${presentationMode ? '' : ` · ${String(item.agentId ?? '').slice(0, 4)}`}`;
    const detail = document.createElement('span'); detail.textContent = activityLabel(item);
    row.append(time, icon, name, detail); list.append(row);
  }
}

export function renderOfficePanels(snapshot, rooms, selectedProject, onSelect, options = {}) {
  renderFloors(snapshot, selectedProject, onSelect);
  renderPeople(snapshot.floors.flatMap((floor) => floor.agents)
    .filter((agent) => selectedProject === null || agent.project === selectedProject), options);
  renderActivities(snapshot, options.presentationMode === true);
  renderLegend(rooms);
}
