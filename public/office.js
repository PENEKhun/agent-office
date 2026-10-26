import { MovementQueue } from '/movement-queue.js';
import { createDeliveryQueue } from '/delivery-queue.js';
import { createSeatAllocator, depthOf, iso, PLAN, isoSim, simToTile, simToView, getView, setView, viewAngle, VIEW_COUNT, ROOMS, IDLE_SPOTS } from '/floor-plan.js';
import { lighterColor } from '/agent-appearance.js';
import { shouldMoveToDesk } from '/arrival-policy.js';
import { lightingAt } from '/lighting.js';
import { createLightingOverlay, createMonitorGlow, createOvertimeBadge, createSnackBox, createLetter, createParcel, createMailbox } from '/office-effects.js';
import { idleDelayMs, idleSpotPosition, nextIdleSpot, personalityFor } from '/idle-behavior.js';
import { groupOverlapping, boundsOverlap } from '/label-policy.js';
import { convexHull, pickCardSpot } from '/card-placement.js';
import { createAgentBadge, createBundleCard, createBundleChip } from '/label-visuals.js';
import { agentLabel, sourceLabel, speechLabel, statusLabel } from '/labels.js';
import { renderOfficePanels } from '/office-panels.js';
import { drawBubble, drawNamePlate, drawOffice } from '/office-art.js';
import { ACTIVITIES, ROOM_ACTIVITY, activityPresentationOf, activityOf, drawActor, drawEmote, drawGlyph } from '/office-activity.js';
import { renderMini } from '/mini-render.js';
import { installPipController } from '/pip-controller.js';
import { installWidgetChrome } from '/widget-view.js';
import { advanceWidgetDim, createWidgetDimState } from '/widget-opacity.js';
import { connectionStatusChip } from '/widget-settings.js';
import { getTheme, listThemes, nextThemeId, setTheme } from '/themes/index.js';

const PIXI = window.PIXI;
const COLORS = { 'claude-code': 0xD97757, 'claude-desktop': 0xC2410C, codex: 0x10A37F, antigravity: 0x4285F4, cowork: 0x7C5CDB };
const ICONS = { 'claude-code': 'anthropic', 'claude-desktop': 'anthropic', codex: 'openai', antigravity: 'googlegemini', cowork: 'anthropic' };
const MAX_BUNDLE_HEAD_DISTANCE_PX = 48;
const widgetPage = new URL(window.location.href).pathname === '/widget';
const host = document.querySelector('#map-host');
let activeHost = host;
const app = new PIXI.Application();
const scene = new PIXI.Container();
const queue = new MovementQueue();
const completedDeliveryIds = (() => {
  try { return JSON.parse(sessionStorage.getItem('agent-office.completed-deliveries') ?? '[]'); }
  catch { return []; }
})();
const deliveryQueue = createDeliveryQueue({ completedIds: completedDeliveryIds });
const seats = createSeatAllocator();
const characters = new Map();
const departed = new Set();
const icons = new Map();
const iconTextures = new Map();
const bundles = new Map();
const emoteOverlapSince = new Map();
let currentSnapshot = { floors: [], activity: [], now: Date.now() };
let selectedProject = null;
let selectedAgentId = null;
// 겹친 3명 이상을 "N명" 칩으로 묶는 기능. 꺼 두면 이모트를 각각 그대로 보여 주고, 이름표는 자리가 있을 때만 뜬다.
const BUNDLE_CHIPS = false;
let hoveredBundleKey = null;
let pointer = { x: -1, y: -1 };
let lastPeopleRefresh = 0;
let latestActivityId = 0;
let lastMiniRefresh = 0;
let zoom = 1;
let pan = { x: 0, y: 0 };
let drag = null;
let office;
let labelLayer;
let glowLayer;
let screenSignLayer;
let worldEffectsLayer;
let lighting;
let lightingMode = 'auto';
let clockSpeed = 1;
let clockAnchorWall = Date.now();
let clockAnchorOffice = clockAnchorWall;
let mailbox;
let mailPile = [];
let mailAnimations = [];
let personality = {};
let overtimeActive = false;
let presentationMode = false;
let pipOfficeMode = false;
let pipViewState = null;
let pipController = null;
let widgetChrome = null;
let desktopWidgetWindow = null;
let desktopOfficeSize = { width: 420, height: 300 };
let widgetOpacity = { background: 100, overall: 100, autoDim: false };
let widgetDimState = createWidgetDimState();
let widgetDimFactor = 1;
let widgetHovered = false;
let cursorPassthrough = false;
let desktopTauri = null;
let widgetSignHover = false;
let widgetSignExpandedUntil = 0;
let lastWidgetSignUpdate = 0;
let widgetRoomSigns = [];

function applyWidgetOpacity(now = Date.now()) {
  if (widgetPage) {
    widgetDimState = advanceWidgetDim(widgetDimState, currentSnapshot.floors.flatMap((floor) => floor.agents), {
      autoDim: widgetOpacity.autoDim,
      pinned: cursorPassthrough,
      hovered: widgetHovered
    }, now);
    widgetDimFactor = widgetDimState.factor;
  }
  const background = document.querySelector('#widget-background');
  if (background) {
    const visible = widgetOpacity.background > 0;
    background.hidden = !visible;
    background.style.display = visible ? 'block' : 'none';
    background.style.opacity = String(widgetOpacity.background / 100 * widgetDimFactor);
  }
  const opacity = widgetOpacity.overall / 100 * widgetDimFactor;
  if (scene) scene.alpha = opacity;
  if (lighting?.layer) lighting.layer.alpha = opacity;
  if (glowLayer) glowLayer.alpha = opacity;
  if (labelLayer) labelLayer.alpha = Math.max(0.85, opacity);
  if (screenSignLayer) screenSignLayer.alpha = Math.max(0.85, opacity);
  const mini = document.querySelector('#pip-mini');
  if (mini) mini.style.opacity = String(opacity);
  widgetChrome?.setDimFactor(widgetDimFactor);
}

function applyThemeBackgrounds() {
  const palette = getTheme().palette;
  const mapBackground = palette.mapBackground ?? '';
  const widgetBackground = palette.widgetBackground ?? mapBackground;
  // 위젯은 #widget-background가 배경과 투명도를 맡으므로 #map-host는 투명하게 둔다
  if (!widgetPage) for (const mapHost of document.querySelectorAll('#map-host')) mapHost.style.background = mapBackground;
  for (const background of document.querySelectorAll('#widget-background')) background.style.background = widgetBackground;
  if (activeHost && activeHost !== host) activeHost.style.background = widgetBackground;
}

function cycleTheme() {
  window.__agentOfficeSetTheme(nextThemeId(getTheme().id));
  return getTheme().name;
}

function installThemeSelector() {
  const selector = document.querySelector('#theme-select');
  if (!selector) return;
  selector.replaceChildren(...listThemes().map((theme) => {
    const option = document.createElement('option');
    option.value = theme.id;
    option.textContent = theme.name;
    return option;
  }));
  selector.value = getTheme().id;
  selector.addEventListener('change', () => window.__agentOfficeSetTheme(selector.value));
}

async function saveWidgetOpacity() {
  try { await desktopTauri?.core?.invoke('save_widget_settings', { settings: widgetOpacity }); }
  catch (error) { console.warn('Could not save widget opacity settings', error); }
}

function viewWidth() { return activeHost.clientWidth; }
function viewHeight() { return activeHost.clientHeight; }

function colorOf(source) { return COLORS[source] ?? 0x718096; }
function displayName(agent) { return `${agent.parentAgentId ? '↳ ' : ''}${agentLabel(agent, { hideId: presentationMode })}`; }
async function iconFor(source) {
  const name = ICONS[source];
  if (!name) return null;
  if (!icons.has(name)) icons.set(name, PIXI.Assets.load(`/assets/icons/${name}.svg`).catch(() => null));
  return icons.get(name);
}

function makeVisual(agent) {
  const color = colorOf(agent.source);
  const activityState = activityPresentationOf({ status: agent.status, room: null });
  const activity = activityState.kind;
  const actor = drawActor(PIXI, { color, seed: characters.size, hat: agent.parentAgentId ? lighterColor(color) : null, activity });
  const emote = drawEmote(PIXI, activity, { thinking: activityState.think });
  const label = drawNamePlate(PIXI, { text: displayName(agent), color, icon: null });
  const speech = speechLabel(agent);
  const bubble = speech ? drawBubble(PIXI, { text: speech, tone: agent.status === 'thinking' ? 'think' : 'work' }) : new PIXI.Container();
  const overlay = new PIXI.Container();
  const badge = createAgentBadge(PIXI, { color, activity });
  emote.addChild(badge);
  overlay.addChild(emote, label, bubble);
  const overtimeBadge = createOvertimeBadge(PIXI);
  overlay.addChild(overtimeBadge);
  const glow = createMonitorGlow(PIXI, color);
  const snack = createSnackBox(PIXI);
  glowLayer.addChild(glow);
  office.objects.addChild(snack);
  office.objects.addChild(actor);
  labelLayer.addChild(overlay);
  const visual = { actor, emote, activity, thinking: activityState.think, label, bubble, badge, overlay, overtimeBadge, glow, snack, iconSource: agent.source, agent, labelText: displayName(agent), seatRoom: null, targetPoint: null, shownMessage: null };
  characters.set(agent.id, visual);
  iconFor(agent.source).then((texture) => {
    if (!texture || !characters.has(agent.id)) return;
    iconTextures.set(ICONS[agent.source], texture);
    replaceNamePlate(visual);
    replaceBadge(visual, texture);
    for (const bundle of bundles.values()) {
      bundle.chip.destroy({ children: true });
      bundle.card?.destroy({ children: true });
    }
    bundles.clear();
  });
  label.eventMode = 'static'; label.cursor = 'pointer';
  bubble.eventMode = 'static'; bubble.cursor = 'pointer';
  label.on('pointertap', () => selectAgent(agent.id));
  bubble.on('pointertap', () => selectAgent(agent.id));
  badge.on('pointertap', () => selectAgent(agent.id));
  return visual;
}

function createWidgetRoomSigns() {
  widgetRoomSigns = Object.entries(ROOMS).map(([roomId, room], index) => {
    const kind = ROOM_ACTIVITY[roomId] ?? 'walk';
    const color = ACTIVITIES[kind]?.color ?? ACTIVITIES.walk.color;
    const pale = (channel) => Math.round(channel + (255 - channel) * 0.7);
    const lightColor = (pale((color >> 16) & 255) << 16) | (pale((color >> 8) & 255) << 8) | pale(color & 255);
    const sourceSign = office.signs.children[index];
    const container = new PIXI.Container();
    const label = new PIXI.Text({ text: getTheme().rooms[roomId].name, style: {
      fontFamily: 'system-ui, sans-serif', fontSize: 11, fontWeight: '700', fill: color
    } });
    label.anchor.set(0, 0.5);
    label.position.set(14, 0);
    const width = label.width + 29;
    const pill = new PIXI.Graphics().roundRect(-8, -9, width, 18, 6).fill(lightColor);
    pill.scale.x = 0;
    const marker = new PIXI.Graphics().roundRect(-8, -8, 16, 16, 4).fill(lightColor);
    const glyph = new PIXI.Graphics();
    drawGlyph(glyph, kind, 10, color);
    container.addChild(pill, marker, glyph, label);
    screenSignLayer.addChild(container);
    return { container, sourceSign, progress: 0 };
  });
}

function updateWidgetRoomSigns(now) {
  const delta = lastWidgetSignUpdate ? Math.min(50, now - lastWidgetSignUpdate) : 0;
  lastWidgetSignUpdate = now;
  const expanded = pipOfficeMode && (widgetSignHover || now < widgetSignExpandedUntil);
  for (const item of widgetRoomSigns) {
    const target = expanded ? 1 : 0;
    item.progress += Math.sign(target - item.progress) * Math.min(Math.abs(target - item.progress), delta / 150);
    item.container.children[0].scale.x = item.progress;
    item.container.children[3].alpha = item.progress;
    const point = office.signs.toGlobal(item.sourceSign.position);
    item.container.position.set(point.x, point.y);
  }
}

function onWidgetHoverChange(hovered) {
  widgetSignHover = hovered;
  widgetHovered = hovered;
  applyWidgetOpacity();
  if (hovered) updateWidgetRoomSigns(Date.now());
}

function replaceNamePlate(visual) {
  const replacement = drawNamePlate(PIXI, { text: displayName(visual.agent), color: colorOf(visual.agent.source) });
  visual.overlay.removeChild(visual.label);
  visual.label.destroy({ children: true });
  visual.label = replacement;
  visual.labelText = displayName(visual.agent);
  visual.label.eventMode = 'static'; visual.label.cursor = 'pointer';
  visual.label.on('pointertap', () => selectAgent(visual.agent.id));
  visual.overlay.addChildAt(replacement, 0);
}

function replaceBadge(visual, texture = null) {
  const replacement = createAgentBadge(PIXI, { texture, color: colorOf(visual.agent.source), activity: visual.activity });
  replacement.on('pointertap', () => selectAgent(visual.agent.id));
  visual.emote.removeChild(visual.badge);
  visual.badge.destroy({ children: true });
  visual.badge = replacement;
  visual.emote.addChild(replacement);
}

function selectAgent(id) {
  selectedAgentId = id;
  renderPanels(currentSnapshot, Date.now());
  updateLabelPositions(Date.now());
}

function replaceSpeech(visual, text, tone) {
  const next = text ? drawBubble(PIXI, { text, tone }) : new PIXI.Container();
  visual.overlay.removeChild(visual.bubble);
  visual.bubble.destroy({ children: true });
  visual.bubble = next;
  next.eventMode = 'static'; next.cursor = 'pointer';
  next.on('pointertap', () => selectAgent(visual.agent.id));
  visual.overlay.addChild(next);
}

function setActivity(visual, nextActivity, thinking) {
  if (visual.activity === nextActivity && visual.thinking === thinking) return;
  if (visual.activity !== nextActivity) visual.actor.setActivity(nextActivity);
  const nextEmote = drawEmote(PIXI, nextActivity, { thinking });
  visual.emote.removeChild(visual.badge);
  visual.overlay.removeChild(visual.emote);
  visual.emote.destroy({ children: true });
  visual.emote = nextEmote;
  visual.badge.setActivity(nextActivity);
  visual.emote.addChild(visual.badge);
  visual.overlay.addChildAt(nextEmote, 0);
  visual.activity = nextActivity;
  visual.thinking = thinking;
}

function setStableActivity(visual, nextState, now) {
  if (visual.activity === nextState.kind && visual.thinking === nextState.think) {
    visual.pendingActivity = null;
    return;
  }
  if (visual.pendingActivity?.kind !== nextState.kind || visual.pendingActivity?.think !== nextState.think) {
    visual.pendingActivity = nextState;
    visual.pendingActivityAt = now;
    return;
  }
  if (now - visual.pendingActivityAt >= 500) {
    setActivity(visual, nextState.kind, nextState.think);
    visual.pendingActivity = null;
  }
}

function getAgents(snapshot) {
  return snapshot.floors.flatMap((floor) => floor.agents)
    .filter((agent) => selectedProject === null || agent.project === selectedProject);
}

function seatPoint(agentId, room) {
  const tile = seats.assign(agentId, ROOMS[room] ? room : 'desk');
  const point = isoSim(tile.x, tile.y); // 이동 계산은 회전과 무관한 기준 좌표
  return { x: point.x, y: point.y, tileX: tile.x, tileY: tile.y };
}

function updateSnapshot(snapshot, initial = false) {
  currentSnapshot = snapshot;
  const agents = getAgents(snapshot);
  const ids = agents.map((agent) => agent.id);
  queue.removeMissing(ids);
  let resumeDelivery = false;
  for (const [id, visual] of characters) {
    if (ids.includes(id)) continue;
    if (visual.delivery?.eventId && deliveryQueue.finish(visual.delivery.eventId)) {
      persistCompletedDeliveries();
      resumeDelivery = true;
    }
    seats.release(id);
    visual.actor.destroy({ children: true });
    visual.overlay.destroy({ children: true });
    visual.glow.destroy();
    visual.snack.destroy();
    visual.parcel?.destroy();
    characters.delete(id); departed.delete(id);
  }
  if (resumeDelivery) startNextDelivery();
  if (selectedAgentId && !ids.includes(selectedAgentId)) selectedAgentId = null;

  const freshItems = snapshot.activity.filter((entry) => entry.id > latestActivityId).sort((a, b) => a.id - b.id);
  if (!initial) {
    for (const item of freshItems) {
      if (item.live === false && item.room && item.stateAgentId) {
        const visual = characters.get(item.stateAgentId);
        const point = seatPoint(item.stateAgentId, item.room);
        if (visual) visual.targetPoint = point;
        queue.setTarget(item.stateAgentId, item.room, item.ts, point, activityLabel(item));
      }
    }
  }
  latestActivityId = Math.max(latestActivityId, ...snapshot.activity.map((item) => item.id ?? 0));
  const roomEventIds = new Set(snapshot.activity.filter((item) => item.room && item.kind !== 'session_start')
    .map((item) => item.stateAgentId));
  const arrivalTimes = new Map();
  for (const item of snapshot.activity.filter((entry) => entry.kind === 'session_start')) {
    arrivalTimes.set(item.stateAgentId, Math.min(arrivalTimes.get(item.stateAgentId) ?? Infinity, item.ts));
  }
  for (const item of snapshot.activity) {
    const visual = characters.get(item.stateAgentId);
    if (visual && item.room && item.kind !== 'session_start') visual.hadRoomEvent = true;
  }

  for (const agent of agents) {
    let visual = characters.get(agent.id);
    if (!visual) {
      const elevator = seatPoint(agent.id, 'elevator');
      queue.setTarget(agent.id, 'elevator', snapshot.now, elevator, null, 'work', { minimumStayMs: 1000 });
      visual = makeVisual(agent);
      visual.targetPoint = elevator;
      visual.homeSeat = elevator;
      visual.homeRoom = 'elevator';
      visual.heldIdleSpots = new Set();
      visual.arrivalAt = arrivalTimes.get(agent.id) ?? agent.lastActivityAt;
      visual.arrivalSeatReachedAt = null;
      visual.arrivalRouteStarted = false;
      visual.hadRoomEvent = agent.room !== 'elevator' || roomEventIds.has(agent.id);
    }
    departed.delete(agent.id);
    visual.agent = agent;
    visual.hadRoomEvent ||= agent.room !== 'elevator';
    const fallbackRoom = visual.arrivalFallbackDone && !visual.hadRoomEvent ? 'desk' : agent.room;
    const delivering = Boolean(visual.delivery);
    const targetRoom = delivering ? 'elevator' : (ROOMS[fallbackRoom] ? fallbackRoom : 'desk');
    const message = agent.status === 'idle' ? '' : speechLabel(agent);
    const tone = agent.status === 'thinking' ? 'think' : agent.status === 'idle' ? 'idle' : 'work';
    const cameFromRest = visual.previousStatus === 'idle' && agent.status !== 'idle';
    if (!visual.arrivalRouteStarted && agent.status === 'idle') {
      visual.arrivalRestFrom = queue.position(agent.id, snapshot.now, { elevator: visual.targetPoint, desk: visual.targetPoint },
        personalityFor(agent, personality).speed);
      visual.arrivalRouteStarted = true;
      visual.arrivalSeatReachedAt = snapshot.now;
    }

    if (agent.status === 'leaving') {
      if (!visual.leavingStarted) {
        const position = queue.position(agent.id, snapshot.now, { elevator: visual.targetPoint, desk: visual.targetPoint },
          personalityFor(agent, personality).speed);
        seats.release(agent.id);
        const door = isoSim(12.9, 0.6);
        visual.targetPoint = { x: door.x, y: door.y, tileX: 12.9, tileY: 0.6 };
        visual.homeRoom = 'leaving-door';
        visual.leavingStarted = true;
        queue.setTarget(agent.id, 'leaving-door', snapshot.now, visual.targetPoint, null, 'work', {
          immediate: true, minimumStayMs: 0, fromPoint: position ? { x: position.x, y: position.y } : (visual.simPosition ?? visual.targetPoint)
        });
      }
    } else if (!visual.arrivalRouteStarted) {
      queue.setTarget(agent.id, 'elevator', snapshot.now, visual.homeSeat, null, 'work', { minimumStayMs: 1000 });
    } else if (visual.delivery) {
      if (visual.delivery.stage !== 'returning') {
        queue.setTarget(agent.id, 'elevator', snapshot.now, visual.targetPoint, '상자 배송 중', 'work');
      } else {
        const room = ROOMS[agent.room] ? agent.room : 'desk';
        if (visual.seatRoom !== room) {
          visual.homeSeat = seatPoint(agent.id, room);
          visual.homeRoom = room;
          visual.seatRoom = room;
        }
      }
    } else if (agent.status === 'idle') {
      if (visual.previousStatus !== 'idle' && !visual.arrivalRestFrom) {
        visual.restMoveFrom = queue.position(agent.id, snapshot.now, { elevator: visual.targetPoint, desk: visual.targetPoint },
          personalityFor(agent, personality).speed);
        queue.clearPending(agent.id);
      }
      if (!visual.idleSpot || snapshot.now >= visual.nextIdleAt) {
        const spot = nextIdleSpot(agent, visual.idleSpot, personality);
        if (spot) {
          if (visual.idleSpot) visual.heldIdleSpots.add(visual.idleSpot);
          visual.idleSpot = spot;
          visual.idleTarget = idleSpotPosition(agent.id, spot, seats);
          visual.heldIdleSpots.add(spot);
          visual.nextIdleAt = snapshot.now + idleDelayMs();
        }
      }
      if (visual.idleSpot) {
        const fromPoint = visual.arrivalRestFrom ?? visual.restMoveFrom;
        queue.setTarget(agent.id, `idle:${visual.idleSpot}`, snapshot.now, visual.idleTarget, '쉬는 중', 'idle',
          fromPoint ? { immediate: true, minimumStayMs: 0, fromPoint } : {});
        visual.arrivalRestFrom = null;
        visual.restMoveFrom = null;
      }
    } else {
      if (cameFromRest) {
        queue.clearPending(agent.id);
        visual.releaseIdleAfterHome = true;
      }
      if (delivering) {
        queue.setTarget(agent.id, targetRoom, snapshot.now, visual.targetPoint, '상자 배송 중', tone);
      } else {
        if (visual.seatRoom !== targetRoom || !visual.homeSeat) {
          visual.homeSeat = seatPoint(agent.id, targetRoom);
          visual.homeRoom = targetRoom;
          visual.seatRoom = targetRoom;
        }
        visual.targetPoint = visual.homeSeat;
        queue.setTarget(agent.id, targetRoom, snapshot.now, visual.homeSeat, message, tone);
      }
    }
    visual.previousStatus = agent.status;
    visual.actor.visible = true;
    if (visual.labelText !== displayName(agent)) replaceNamePlate(visual);
    visual.bubble.visible = agent.status !== 'arriving' && agent.status !== 'leaving';
    visual.overlay.visible = !departed.has(agent.id);
  }
  for (const item of freshItems.filter((entry) => entry.kind === 'git')) {
    if (!initial || (item.live === true && snapshot.now - item.ts < 30_000)) handleGitEvent(item);
  }
  renderPanels(snapshot, snapshot.now);
  updateMailbox(snapshot);
  updateLabelPositions(snapshot.now);
  pipController?.update(snapshot, { actualRooms: actualScreenRooms() });
  if (widgetPage && !pipOfficeMode) renderMini(document.querySelector('#agents'), snapshot, { actualRooms: actualScreenRooms(), movingAgents: actualMovingAgents() });
}

function handleGitEvent(item) {
  const delivery = getTheme().delivery;
  if (item.git?.action === 'commit') {
    const visual = characters.get(item.stateAgentId);
    if (visual) {
      const letter = createLetter(PIXI, delivery?.letter);
      worldEffectsLayer.addChild(letter);
      mailAnimations.push({ letter, from: { ...visual.actor.position }, startedAt: Date.now() });
    }
  }
  if (['push', 'mr'].includes(item.git?.action)) {
    if (!deliveryQueue.active) {
      deliveryQueue.enqueue(item);
      startNextDelivery();
    }
  }
}

function persistCompletedDeliveries() {
  try { sessionStorage.setItem('agent-office.completed-deliveries', JSON.stringify(deliveryQueue.completedIds())); }
  catch { /* session storage may be unavailable in a restricted browser context */ }
}

function startNextDelivery() {
  const item = deliveryQueue.startNext();
  if (!item) return;
  const delivery = getTheme().delivery;
  const visual = characters.get(item.stateAgentId);
  if (!visual) {
    deliveryQueue.finish(item.id);
    persistCompletedDeliveries();
    startNextDelivery();
    return;
  }
  const destination = delivery?.destination ?? { x: 12.4, y: 3.6 };
  const elevator = isoSim(destination.x, destination.y);
  visual.delivery = { eventId: item.id, stage: 'outbound', from: { ...visual.homeSeat }, target: { ...elevator },
    originRoom: visual.homeRoom, startedAt: Date.now() };
  visual.parcel = createParcel(PIXI, delivery?.parcel);
  worldEffectsLayer.addChild(visual.parcel);
  visual.targetPoint = { x: elevator.x, y: elevator.y, tileX: destination.x, tileY: destination.y };
  const officeNow = clockAnchorOffice + (Date.now() - clockAnchorWall) * clockSpeed;
  const speed = personalityFor(visual.agent, personality).speed;
  const currentPosition = queue.position(item.stateAgentId, officeNow, { elevator: visual.targetPoint, desk: visual.targetPoint }, speed);
  queue.clearPending(item.stateAgentId);
  queue.setTarget(item.stateAgentId, 'elevator', officeNow, visual.targetPoint, '상자 배송 중', 'work', {
    immediate: true, minimumStayMs: 0,
    fromPoint: currentPosition ? { x: currentPosition.x, y: currentPosition.y } : (visual.simPosition ?? visual.homeSeat)
  });
}

function updateMailbox(snapshot) {
  if (!mailbox) return;
  const counts = snapshot.mailbox ?? {};
  const count = selectedProject === null
    ? Object.values(counts).reduce((sum, value) => sum + value, 0)
    : counts[selectedProject] ?? 0;
  mailbox.setCount(count);
  for (const letter of mailPile) letter.destroy();
  mailPile = [];
  const position = mailboxPosition();
  const delivery = getTheme().delivery;
  const tile = deliveryTile();
  const pile = delivery?.pile ?? { offsetX: -12, columnGap: 15, offsetY: -42, rowGap: 11 };
  for (let index = 0; index < Math.min(count, 5); index += 1) {
    const letter = createLetter(PIXI, delivery?.letter);
    letter.position.set(position.x + pile.offsetX + (index % 3) * pile.columnGap,
      position.y + pile.offsetY - Math.floor(index / 3) * pile.rowGap);
    letter.zIndex = depthOf(tile.x, tile.y) + (delivery?.letter?.depthOffset ?? 3);
    worldEffectsLayer.addChild(letter);
    mailPile.push(letter);
  }
}

function updateEffects(wallNow) {
  const now = clockAnchorOffice + (wallNow - clockAnchorWall) * clockSpeed;
  const light = lightingAt(now, lightingMode);
  office?.effects?.tick(wallNow, light.overtime);
  lighting.update(light);
  overtimeActive = light.overtime;
  const glowAlpha = light.period === 'night' ? 0.9 : light.period === 'dusk' ? 0.55 : 0.22;
  for (const [id, visual] of characters) {
    const desk = ['dev', 'desk'].includes(visual.homeRoom);
    const working = visual.agent.status === 'working';
    visual.glow.visible = desk && working;
    visual.glow.alpha = glowAlpha;
    if (desk && visual.homeSeat) {
      const monitor = iso(visual.homeSeat.tileX, visual.homeSeat.tileY - 0.28, 13);
      visual.glow.position.set(monitor.x, monitor.y);
      visual.glow.zIndex = depthOf(visual.homeSeat.tileX, visual.homeSeat.tileY) + 2;
      visual.snack.position.set(monitor.x + 13, monitor.y - 10);
      visual.snack.visible = working && light.overtime;
      visual.snack.zIndex = visual.glow.zIndex + 1;
    } else {
      visual.snack.visible = false;
    }
    visual.overtimeBadge.visible = working && light.overtime && !visual.inBundle;
    visual.overtimeBadge.scale.set(1 / Math.max(0.01, scene.scale.x));
    visual.overtimeBadge.position.set(visual.label.x + visual.label.width * 0.5 + 8, visual.label.y - 13);
    if (visual.delivery?.stage === 'unloading') {
      const progress = Math.min(1, (wallNow - visual.delivery.unloadAt) / 1200);
      const target = simToView(visual.targetPoint.x, visual.targetPoint.y);
      visual.parcel.position.set(target.x + 3, target.y - 10 + progress * 20);
      visual.parcel.alpha = 1 - progress;
      if (progress >= 1) {
        visual.parcel.destroy();
        visual.parcel = null;
        visual.delivery.stage = 'returning';
        const room = ROOMS[visual.agent.room] ? visual.agent.room : 'desk';
        const destination = seatPoint(id, room);
        visual.homeSeat = destination;
        visual.homeRoom = room;
        visual.seatRoom = room;
        visual.targetPoint = destination;
        queue.clearPending(id);
        queue.setTarget(id, room, now, destination, speechLabel(visual.agent), 'work', {
          immediate: true, minimumStayMs: 0,
          fromPoint: { x: visual.delivery.target.x, y: visual.delivery.target.y }
        });
      }
    } else if (visual.parcel && visual.delivery) {
      visual.parcel.alpha = 1;
      visual.parcel.position.set(visual.actor.x - 22, visual.actor.y - 24);
      visual.parcel.zIndex = 3000;
      const position = queue.position(id, now, { elevator: visual.targetPoint }, personalityFor(visual.agent, personality).speed);
      if (visual.delivery.stage === 'outbound' && position && !position.moving && !position.queueLength) {
        visual.delivery.stage = 'unloading';
        visual.delivery.unloadAt = wallNow;
      }
    } else if (visual.delivery?.stage === 'returning') {
      const position = queue.position(id, now, {}, personalityFor(visual.agent, personality).speed);
      if (position && !position.moving && !position.queueLength) {
        const eventId = visual.delivery.eventId;
        visual.delivery = null;
        visual.targetPoint = visual.homeSeat;
        deliveryQueue.finish(eventId);
        persistCompletedDeliveries();
        startNextDelivery();
      }
    }
  }
  for (const animation of [...mailAnimations]) {
    const progress = Math.min(1, (wallNow - animation.startedAt) / 1000);
    const target = mailboxPosition();
    animation.letter.position.set(animation.from.x + (target.x - animation.from.x) * progress,
      animation.from.y + (target.y - animation.from.y) * progress - Math.sin(progress * Math.PI) * 24);
    animation.letter.alpha = 1 - progress * 0.35;
    if (progress >= 1) {
      animation.letter.destroy();
      mailAnimations = mailAnimations.filter((entry) => entry !== animation);
    }
  }
}

function mailboxPosition() {
  const delivery = getTheme().delivery;
  const tile = deliveryTile();
  const point = iso(tile.x, tile.y);
  const offset = delivery?.mailbox ?? { offsetX: 24, offsetY: 18 };
  return { x: point.x + offset.offsetX, y: point.y + offset.offsetY };
}

function deliveryTile() {
  return getTheme().delivery?.destination ?? { x: 12.4, y: 3.6 };
}

function renderPanels(snapshot, now) {
  const actualRooms = new Map([...characters].map(([id, visual]) => [id,
    visual.delivery ? 'delivery' : visual.currentRoom ?? visual.agent.room]));
  renderOfficePanels(snapshot, ROOMS, selectedProject, (project) => {
    selectedProject = project;
    updateSnapshot(currentSnapshot);
  }, { selectedAgentId, actualRooms, onSelectAgent: selectAgent, presentationMode });
  lastPeopleRefresh = now;
}

function actualScreenRooms() {
  return new Map([...characters].map(([id, visual]) => [id,
    visual.delivery ? 'delivery' : visual.currentRoom ?? visual.agent.room]));
}

function actualMovingAgents() {
  return new Set([...characters].filter(([, visual]) => visual.moving).map(([id]) => id));
}

async function refreshConnectionScreen() {
  const screen = document.querySelector('#connection-screen');
  if (!screen) return;
  const result = await fetch('/api/connectivity').then((response) => response.json()).catch(() => null);
  if (!result?.sources) return;
  const sources = Object.entries(result.sources);
  const explanation = screen.querySelector('#connection-explanation');
  if (explanation) {
    explanation.textContent = '기록 파일은 이 PC에서만 읽습니다. Claude Desktop은 Claude Code 폴더에서 함께 읽습니다. 클라우드 세션은 표시되지 않습니다.';
  }
  document.querySelector('#connection-sources').replaceChildren(...sources.map(([source, state]) => {
    const row = document.createElement('span');
    const chip = connectionStatusChip(state);
    row.className = `connection-chip connection-${chip.status}`;
    const shared = source === 'claude-desktop' ? ' · Claude Code 폴더에서 함께 읽음' : '';
    row.textContent = `${chip.symbol} ${sourceLabel(source)}${shared} · ${chip.label}`;
    if (state.lastEventAt) row.title = `마지막 이벤트: ${new Date(state.lastEventAt).toLocaleString()}`;
    return row;
  }));
}

window.__agentOfficeShowConnection = async () => {
  window.__agentOfficeConnectionRequested = true;
  const screen = document.querySelector('#connection-screen');
  if (!screen) return;
  await refreshConnectionScreen();
  widgetChrome?.openSettings('connection');
};

function installConnectionForm() {
  const form = document.querySelector('#connection-form');
  if (!form) return;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const message = document.querySelector('#connection-message');
    const source = document.querySelector('#connection-source').value;
    let path = document.querySelector('#connection-path').value.trim();
    message.textContent = '폴더를 확인하고 있습니다…';
    const suggestionResponse = await fetch('/api/sources', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source, path, suggest: true })
    }).catch(() => null);
    const suggestion = suggestionResponse?.ok ? (await suggestionResponse.json()).suggestion : null;
    if (suggestion) {
      const accepted = window.confirm(`입력한 경로의 하위 폴더를 제안합니다.\n\n${suggestion}\n\n확인: 제안 경로 사용\n취소: 입력한 경로 그대로 저장`);
      if (accepted) path = suggestion;
    }
    const response = await fetch('/api/sources', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source, path })
    }).catch(() => null);
    if (!response?.ok) { message.textContent = '폴더를 연결하지 못했습니다. 경로를 확인해 주세요.'; return; }
    await new Promise((resolve) => setTimeout(resolve, 600));
    await refreshConnectionScreen();
    message.textContent = '경로를 저장했습니다. 기록 파일이 있으면 연결 상태가 바뀝니다.';
  });
  document.querySelector('#connection-reset')?.addEventListener('click', async () => {
    const source = document.querySelector('#connection-source').value;
    const message = document.querySelector('#connection-message');
    const response = await fetch('/api/sources', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source, reset: true })
    }).catch(() => null);
    if (!response?.ok) { message.textContent = '기본 경로로 되돌리지 못했습니다.'; return; }
    document.querySelector('#connection-path').value = '';
    await refreshConnectionScreen();
    message.textContent = '기본 경로로 되돌렸습니다.';
  });
}

function roomAt(position, visual) {
  if (position.room?.startsWith('idle:')) return IDLE_SPOTS[position.room.slice(5)]?.room ?? 'lounge';
  const { x, y } = simToTile(position.x, position.y);
  const match = Object.entries(ROOMS).find(([, room]) =>
    x >= room.rect[0] && x < room.rect[2] && y >= room.rect[1] && y < room.rect[3]);
  return match?.[0] ?? (visual.agent.status === 'leaving' ? 'elevator' : position.room);
}

function setLabelAtScreen(visual, screenX, labelY, scale) {
  const labelPoint = scene.toLocal({ x: screenX, y: labelY });
  const bubblePoint = scene.toLocal({ x: screenX, y: labelY - 28 });
  visual.label.position.set(labelPoint.x, labelPoint.y);
  visual.bubble.position.set(bubblePoint.x, bubblePoint.y);
  visual.label.scale.set(1 / scale);
  visual.bubble.scale.set(0.85 / scale);
  visual.label.visible = true;
  visual.bubble.visible = Boolean(visual.bubble.bubbleHeight) && !['arriving', 'leaving', 'idle'].includes(visual.agent.status);
}

function placeEmote(entry, scale, relativeScale = 1) {
  const point = scene.toLocal({ x: entry.x, y: entry.y - 21 });
  entry.visual.emote.position.copyFrom(point);
  entry.visual.emote.scale.set(relativeScale / scale);
  entry.visual.emoteScale = relativeScale;
  return entry.visual.emote.getBounds();
}

function placeChip(bundle, centerX, headCenterY, scale) {
  // Rotated overlapping emotes can span 47.42px between a head and chip center.
  // Keep the chip within that measured range plus a small subpixel margin.
  // Never displace it to
  // avoid a room sign; the sign is dimmed by dimOverlappedSigns instead.
  const point = scene.toLocal({ x: centerX, y: headCenterY });
  bundle.chip.position.copyFrom(point);
  bundle.chip.scale.set(1 / scale);
  const bounds = bundle.chip.getBounds();
  const corrected = scene.toLocal({
    x: centerX * 2 - bounds.x - bounds.width / 2,
    y: headCenterY * 2 - bounds.y - bounds.height / 2
  });
  bundle.chip.position.copyFrom(corrected);
  return bundle.chip.getBounds();
}

function objectBounds(objects) {
  return objects.filter((object) => object?.visible).map((object) => object.getBounds());
}

function bundleCenter(items) {
    const points = items.map(({ x, y }) => ({ x, y }));
    const candidates = [...points];
    for (let left = 0; left < points.length; left += 1) {
      for (let right = left + 1; right < points.length; right += 1) {
        candidates.push({ x: (points[left].x + points[right].x) / 2, y: (points[left].y + points[right].y) / 2 });
      }
    }
    for (let first = 0; first < points.length; first += 1) {
      for (let second = first + 1; second < points.length; second += 1) {
        for (let third = second + 1; third < points.length; third += 1) {
          const [a, b, c] = [points[first], points[second], points[third]];
          const denominator = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
          if (Math.abs(denominator) < 0.001) continue;
          const aa = a.x * a.x + a.y * a.y;
          const bb = b.x * b.x + b.y * b.y;
          const cc = c.x * c.x + c.y * c.y;
          candidates.push({
            x: (aa * (b.y - c.y) + bb * (c.y - a.y) + cc * (a.y - b.y)) / denominator,
            y: (aa * (c.x - b.x) + bb * (a.x - c.x) + cc * (b.x - a.x)) / denominator
          });
        }
      }
    }
    const radius = (center) => Math.max(...points.map((point) => Math.hypot(center.x - point.x, center.y - point.y)));
    const best = candidates.reduce((selected, candidate) => radius(candidate) < radius(selected) ? candidate : selected);
    const above = { x: best.x, y: best.y - 8 };
  return radius(above) <= MAX_BUNDLE_HEAD_DISTANCE_PX ? above : best;
}

function overlappingChipGroups(entries, boundsFor) {
  const components = groupOverlapping(entries, boundsFor);
  const result = [];
  const fitsCenter = (items) => {
    const center = bundleCenter(items);
    return items.every((entry) => Math.hypot(center.x - entry.x, center.y - entry.y) <= MAX_BUNDLE_HEAD_DISTANCE_PX);
  };
  for (const component of components) {
    let available = [...component];
    while (available.length >= 3) {
      let best = null;
      for (let left = 0; left < available.length - 2; left += 1) {
        for (let middle = left + 1; middle < available.length - 1; middle += 1) {
          for (let right = middle + 1; right < available.length; right += 1) {
            const triple = [available[left], available[middle], available[right]];
            if (!fitsCenter(triple)) continue;
            const center = bundleCenter(triple);
            const score = available.filter((entry) => !triple.includes(entry) && fitsCenter([...triple, entry])).length;
            if (!best || score > best.score) best = { group: triple, score, distance: Math.hypot(center.x, center.y) };
          }
        }
      }
      if (!best) break;
      const group = best.group;
      for (const candidate of [...available].sort((a, b) => {
        const center = bundleCenter(group);
        return Math.hypot(a.x - center.x, a.y - center.y) - Math.hypot(b.x - center.x, b.y - center.y);
      })) {
        if (group.includes(candidate) || !fitsCenter([...group, candidate])) continue;
        group.push(candidate);
      }
      result.push(group);
      available = available.filter((entry) => !group.includes(entry));
    }
  }
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const group of result) {
      const center = bundleCenter(group);
      const width = 150 + Math.max(0, group.length - 3) * 10;
      const chipBounds = { x: center.x - width / 2, y: center.y - 16, width, height: 32 };
      const candidates = entries.filter((entry) => !result.some((other) => other !== group && other.includes(entry)) &&
        !group.includes(entry) && boundsOverlap(boundsFor(entry), chipBounds));
      for (const candidate of candidates) {
        // 한 번에 모두 추가하면 각각은 맞던 후보들이 합쳐져 48px 한계를 넘을 수 있다.
        if (!fitsCenter([...group, candidate])) continue;
        group.push(candidate);
        expanded = true;
      }
    }
  }
  return result;
}

function placeLabels(positioned, now) {
  const scale = Math.max(0.01, scene.scale.x);
  const entries = positioned.map((item) => {
    const head = scene.toGlobal({ x: item.position.x, y: item.position.y - 51 });
    return { ...item, x: head.x, y: head.y };
  });
  for (const entry of entries) {
    entry.visual.emote.visible = true;
    placeEmote(entry, scale);
  }
  const emoteBounds = (entry) => entry.visual.emote.getBounds();
  const groups = groupOverlapping(entries, emoteBounds);
  window.__officeLabelGroups = () => groups.map((group) => ({ size: group.length, members: group.map((entry) => entry.visual.agent.id) }));
  const bundlesWanted = BUNDLE_CHIPS ? overlappingChipGroups(entries, emoteBounds) : [];
  const bundledIds = new Set(bundlesWanted.flatMap((group) => group.map((entry) => entry.visual.agent.id)));
  for (const entry of entries) {
    entry.visual.inBundle = bundledIds.has(entry.visual.agent.id);
    entry.visual.emote.visible = true;
    entry.visual.overlay.zIndex = 1;
  }
  const nextBundleKeys = new Set();
  const visibleObjects = [];
  const visibleEntries = entries;
  const overlapsByPair = new Map();
  for (let left = 0; left < visibleEntries.length; left += 1) {
    for (let right = left + 1; right < visibleEntries.length; right += 1) {
      const a = visibleEntries[left], b = visibleEntries[right];
      if (!boundsOverlap(emoteBounds(a), emoteBounds(b))) continue;
      const key = [a.visual.agent.id, b.visual.agent.id].sort().join('|');
      overlapsByPair.set(key, [a, b]);
    }
  }
  for (const [key, record] of emoteOverlapSince) {
    if (overlapsByPair.has(key)) record.lastSeenAt = now;
    else if (now - record.lastSeenAt > 500) emoteOverlapSince.delete(key);
  }
  const emoteScales = new Map(visibleEntries.map((entry) => [entry.visual.agent.id, 1]));
  for (const [key, pair] of overlapsByPair) {
    if (!emoteOverlapSince.has(key)) emoteOverlapSince.set(key, { lastSeenAt: now, pair });
  }
  for (const record of emoteOverlapSince.values()) {
    const [a, b] = record.pair;
    const rear = a.depth < b.depth ? a : b;
    emoteScales.set(rear.visual.agent.id, 0.55);
  }
  for (const entry of entries) {
    const relativeScale = emoteScales.get(entry.visual.agent.id) ?? 1;
    const bounds = placeEmote(entry, scale, relativeScale);
    if (entry.visual.emote.visible) visibleObjects.push(entry.visual.emote);
    entry.visual.emoteFixedBounds = bounds;
  }
  for (const entry of entries) {
    entry.visual.label.visible = false;
    entry.visual.bubble.visible = false;
  }

  for (const group of bundlesWanted) {
    const ids = group.map((entry) => entry.visual.agent.id).sort();
    const key = ids.join('|');
    nextBundleKeys.add(key);
    let bundle = bundles.get(key);
    if (!bundle) {
      const members = group.map(({ visual }) => ({
        texture: iconTextures.get(ICONS[visual.agent.source]) ?? null,
        color: colorOf(visual.agent.source)
      }));
      const activityKinds = [...new Set(group.map(({ visual }) => visual.activity))].slice(0, 3);
      const chip = createBundleChip(PIXI, { count: group.length, members, activityKinds });
      chip.zIndex = 0;
      bundle = { key, chip, group, card: null, cardSignature: '' };
      bundles.set(key, bundle);
      labelLayer.addChild(chip);
    }
    bundle.group = group;
    bundle.chip.setActivities([...new Set(group.map(({ visual }) => visual.activity))].slice(0, 3));
    const center = bundleCenter(group);
    placeChip(bundle, center.x, center.y, scale);
    bundle.chip.visible = true;
    bundle.chip.setNight(overtimeActive && group.some((entry) => entry.visual.agent.status === 'working'));
    const rowHeight = pipOfficeMode ? 19 : 25;
    const availableRows = Math.max(1, Math.floor((viewHeight() - 20) / rowHeight));
    const maxRows = Math.max(1, Math.min(8, availableRows - Number(group.length > availableRows)));
    const members = group.map(({ visual }) => ({
      id: visual.agent.id,
      text: `${displayName(visual.agent)} · ${visual.agent.status === 'working' ? speechLabel({ ...visual.agent, room: visual.currentRoom, delivering: Boolean(visual.delivery) }) : statusLabel(visual.agent.status)}`,
      color: colorOf(visual.agent.source),
      texture: iconTextures.get(ICONS[visual.agent.source]) ?? null
    }));
    const signature = `${maxRows}|${rowHeight}|${members.map((member) => `${member.id}:${member.text}`).join('|')}`;
    if (signature !== bundle.cardSignature) {
      bundle.card?.destroy({ children: true });
      bundle.card = createBundleCard(PIXI, { members, onSelect: selectAgent, maxRows, rowHeight });
      bundle.cardSignature = signature;
      labelLayer.addChild(bundle.card);
    }
  }
  for (const [key, bundle] of bundles) {
    if (nextBundleKeys.has(key)) continue;
    bundle.chip.destroy({ children: true });
    bundle.card?.destroy({ children: true });
    bundle.leader?.destroy();
    bundles.delete(key);
  }

  hoveredBundleKey = null;
  for (const [key, bundle] of bundles) {
    const chipBounds = bundle.chip.getBounds();
    const pointerOnChip = (bundle.chip.visible || bundle.expanded) && pointer.x >= chipBounds.x && pointer.x <= chipBounds.x + chipBounds.width &&
      pointer.y >= chipBounds.y && pointer.y <= chipBounds.y + chipBounds.height;
    const cardBounds = bundle.card?.getBounds();
    const pointerOnCard = bundle.card?.visible && cardBounds && pointer.x >= cardBounds.x && pointer.x <= cardBounds.x + cardBounds.width &&
      pointer.y >= cardBounds.y && pointer.y <= cardBounds.y + cardBounds.height;
    if (pointerOnChip || pointerOnCard) {
      hoveredBundleKey = key;
      bundle.hoverUntil = now + 700;
    } else if (!hoveredBundleKey && (bundle.hoverUntil ?? 0) > now) {
      // 칩에서 멀리 떨어진 카드로 포인터를 옮기는 동안 접히지 않게 잠시 유지한다
      hoveredBundleKey = key;
    }
  }

  for (const [key, bundle] of bundles) {
    const shouldExpand = key === hoveredBundleKey || bundle.group.some((entry) => entry.visual.agent.id === selectedAgentId);
    if (!shouldExpand) {
      visibleObjects.push(bundle.chip);
      bundle.card.visible = false;
      if (bundle.leader) bundle.leader.visible = false;
      for (const entry of bundle.group) {
        entry.visual.label.visible = false;
        entry.visual.bubble.visible = false;
      }
      continue;
    }
    bundle.expanded = shouldExpand;
    bundle.chip.visible = true;
    bundle.card.visible = true;
    bundle.card.scale.set(1 / scale);
    const chipBounds = bundle.chip.getBounds();
    const cardWidth = bundle.card.cardWidth;
    const cardHeight = bundle.card.cardHeight;
    const avoid = [...bundles.values()].filter((other) => other !== bundle && other.chip.visible).map((other) => other.chip.getBounds());
    avoid.push(chipBounds, ...chromeRects());
    const spot = pickCardSpot({
      width: cardWidth, height: cardHeight, viewWidth: viewWidth(), viewHeight: viewHeight(),
      anchor: { x: chipBounds.x + chipBounds.width / 2, y: chipBounds.y + chipBounds.height / 2 },
      hull: officeScreenHull(), avoid
    });
    const cardX = spot.x;
    const cardY = spot.y;
    drawCardLeader(bundle, chipBounds, { x: cardX, y: cardY, width: cardWidth, height: cardHeight }, scale);
    bundle.card.position.copyFrom(scene.toLocal({ x: cardX, y: cardY }));
    visibleObjects.push(bundle.chip, bundle.card);
    for (const entry of bundle.group) {
      entry.visual.label.visible = false;
      entry.visual.bubble.visible = false;
    }
  }

  const occupied = objectBounds(visibleObjects);
  const fullEntries = pipOfficeMode ? [] : entries.filter((entry) => !bundledIds.has(entry.visual.agent.id) &&
    (['working', 'thinking'].includes(entry.visual.agent.status) ||
      (entry.visual.agent.id === selectedAgentId && entry.visual.agent.status !== 'idle')))
    .sort((a, b) => Number(b.visual.agent.id === selectedAgentId) - Number(a.visual.agent.id === selectedAgentId) || b.depth - a.depth);
  for (const entry of fullEntries) {
    const { visual } = entry;
    setLabelAtScreen(visual, entry.x + 72, entry.y - 8, scale);
    const labelBounds = objectBounds([visual.label, visual.bubble]);
    const outside = labelBounds.some((bounds) => bounds.x < 0 || bounds.y < 0 ||
      bounds.x + bounds.width > viewWidth() || bounds.y + bounds.height > viewHeight());
    if (outside || labelBounds.some((bounds) => occupied.some((rect) => boundsOverlap(bounds, rect)))) {
      visual.label.visible = false;
      visual.bubble.visible = false;
      continue;
    }
    occupied.push(...labelBounds);
    visibleObjects.push(visual.label, ...(visual.bubble.bubbleHeight ? [visual.bubble] : []));
  }
  updateWidgetRoomSigns(now);
  dimOverlappedSigns(visibleObjects);

  if (now - lastPeopleRefresh >= 1000) renderPanels(currentSnapshot, now);
  window.__officeLabelBounds = () => visibleObjects.filter((object) => object.visible).map((object) => {
    const bounds = object.getBounds();
    const bundle = [...bundles.values()].find((entry) => entry.chip === object);
    const card = [...bundles.values()].find((entry) => entry.card === object);
    const visual = [...characters.values()].find((entry) => entry.bubble === object);
    const emoteVisual = [...characters.values()].find((entry) => entry.emote === object);
    return { id: bundle ? bundle.key : card ? card.key : visual?.agent.id ?? emoteVisual?.agent.id, kind: bundle ? 'chip' : card ? 'card' : emoteVisual ? 'emote' : visual?.bubble === object ? 'bubble' : 'label',
    x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
  });
  window.__officeLeaders = () => [...bundles.values()].map((bundle) => ({ visible: Boolean(bundle.leader?.visible), parent: Boolean(bundle.leader?.parent), bounds: bundle.leader?.getBounds?.() }));
  window.__officeBundles = () => [...bundles.values()].filter((bundle) => bundle.chip.visible).map((bundle) => {
    const bounds = bundle.chip.getBounds();
    return {
      memberCount: bundle.group.length,
      members: bundle.group.map((entry) => entry.visual.agent.id),
      center: { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 },
      heads: bundle.group.map((entry) => ({ x: entry.x, y: entry.y }))
    };
  });
  window.__officeBundleChips = BUNDLE_CHIPS;
  window.__officeLabelSnapshot = () => ({
    groups: groups.map((group) => ({ size: group.length, members: group.map((entry) => entry.visual.agent.id) })),
    bundles: window.__officeBundles()
  });
}

// 위젯 도구막대처럼 캔버스 위에 떠 있는 DOM 요소의 자리. 카드가 그 밑에 깔리지 않게 피한다.
function chromeRects() {
  const canvasRect = app.canvas.getBoundingClientRect();
  return ['#widget-toolbar', '#widget-settings', '.map-controls'].flatMap((selector) => [...document.querySelectorAll(selector)])
    .map((element) => element.getBoundingClientRect())
    .filter((rect) => rect.width && rect.height)
    .map((rect) => ({ x: rect.left - canvasRect.left - 4, y: rect.top - canvasRect.top - 4, width: rect.width + 8, height: rect.height + 8 }))
    .map((rect) => ({ ...rect, weight: 50 }));
}

// 사무실(바닥판·벽 포함)의 화면 좌표 외곽선. 카드를 이 바깥 빈 곳에 놓는 데 쓴다.
function officeScreenHull() {
  if (!office?.root) return [];
  const points = [];
  for (const [x, y] of [[0, 0], [PLAN.width, 0], [PLAN.width, PLAN.depth], [0, PLAN.depth]]) {
    for (const z of [-PLAN.slabHeight, PLAN.wallHeight]) {
      const p = iso(x, y, z);
      points.push(office.root.toGlobal({ x: p.x, y: p.y }));
    }
  }
  return convexHull(points);
}

// 칩과 멀리 놓인 카드를 가는 선으로 잇는다
function drawCardLeader(bundle, chip, card, scale) {
  if (!bundle.leader) {
    bundle.leader = new PIXI.Graphics();
    bundle.leader.zIndex = -1;
    labelLayer.addChild(bundle.leader);
  }
  const leader = bundle.leader;
  leader.clear();
  const from = { x: chip.x + chip.width / 2, y: chip.y + chip.height / 2 };
  const to = {
    x: Math.max(card.x, Math.min(card.x + card.width, from.x)),
    y: Math.max(card.y, Math.min(card.y + card.height, from.y))
  };
  const gap = Math.hypot(to.x - from.x, to.y - from.y);
  if (gap < 24) { leader.visible = false; return; }
  const a = scene.toLocal(from);
  const b = scene.toLocal(to);
  leader.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: 1.5 / scale, color: 0x5B6B78, alpha: 0.55 });
  leader.circle(b.x, b.y, 2.5 / scale).fill({ color: 0x5B6B78, alpha: 0.7 });
  leader.visible = true;
}

function dimOverlappedSigns(objects) {
  if (pipOfficeMode) {
    for (const sign of office.signs.children) sign.visible = false;
    if (screenSignLayer) screenSignLayer.visible = true;
    const emotes = [...characters.values()].filter((visual) => visual.emote.visible).map((visual) => visual.emote.getBounds());
    const markers = [...emotes, ...objects.filter((object) => object.visible && bundlesHasChip(object)).map((object) => object.getBounds())];
    for (const item of widgetRoomSigns) {
      const bounds = item.container.getBounds();
      item.container.alpha = markers.some((rect) => boundsOverlap(rect, bounds)) ? 0.35 : 1;
    }
    return;
  }
  if (screenSignLayer) screenSignLayer.visible = false;
  for (const sign of office.signs.children) sign.visible = true;
  const rectangles = objects.filter((object) => object.visible).map((object) => object.getBounds());
  for (const sign of office.signs.children) {
    sign.visible = true;
    const bounds = sign.getBounds();
    sign.alpha = rectangles.some((rect) => boundsOverlap(rect, bounds)) ? 0.3 : 1;
  }
}

function bundlesHasChip(object) {
  for (const bundle of bundles.values()) if (bundle.chip === object) return true;
  return false;
}

function updateLabelPositions(now) {
  const positioned = [];
  for (const [id, visual] of characters) {
    if (shouldMoveToDesk(visual, now)) {
      visual.homeSeat = seatPoint(id, 'desk');
      visual.homeRoom = 'desk';
      visual.seatRoom = 'desk';
      visual.targetPoint = visual.homeSeat;
      visual.arrivalFallbackDone = true;
      queue.setTarget(id, 'desk', now, visual.homeSeat, speechLabel(visual.agent), 'work');
    }
    if (visual.agent.status === 'idle' && now >= visual.nextIdleAt) {
      const spot = nextIdleSpot(visual.agent, visual.idleSpot, personality);
      if (spot) {
        if (visual.idleSpot) visual.heldIdleSpots.add(visual.idleSpot);
        visual.idleSpot = spot;
        visual.idleTarget = idleSpotPosition(id, spot, seats);
        visual.heldIdleSpots.add(spot);
        visual.nextIdleAt = now + idleDelayMs();
        queue.setTarget(id, `idle:${spot}`, now, visual.idleTarget, '쉬는 중', 'idle');
      }
    }
    const position = queue.position(id, now, { elevator: visual.targetPoint, desk: visual.targetPoint }, personalityFor(visual.agent, personality).speed);
    if (!position || departed.has(id)) continue;
    if (!visual.arrivalRouteStarted && position.room === 'elevator' && !position.moving && visual.arrivalSeatReachedAt === null) {
      visual.arrivalSeatReachedAt = now;
    }
    if (!visual.arrivalRouteStarted && visual.arrivalSeatReachedAt !== null && now - visual.arrivalSeatReachedAt >= 1000) {
      visual.arrivalRouteStarted = true;
      const room = visual.hadRoomEvent && ROOMS[visual.agent.room] ? visual.agent.room : 'desk';
      if (!visual.hadRoomEvent) visual.arrivalFallbackDone = true;
      visual.homeSeat = seatPoint(id, room);
      visual.homeRoom = room;
      visual.seatRoom = room;
      visual.targetPoint = visual.homeSeat;
      queue.setTarget(id, room, now, visual.homeSeat, speechLabel(visual.agent));
    }
    // 이동 좌표는 기준(회전 0) 좌표라서, 그릴 때만 현재 시점으로 옮긴다.
    visual.simPosition = { x: position.x, y: position.y };
    const view = simToView(position.x, position.y);
    const x = view.x;
    const y = view.y + (position.moving ? Math.sin(now / 90) * 5 * personalityFor(visual.agent, personality).bounce : 0);
    visual.actor.position.set(x, y);
    const idleAnim = personalityFor(visual.agent, personality).idleAnim;
    visual.actor.rotation = visual.agent.status === 'idle' && !position.moving
      ? Math.sin(now / (idleAnim === 'stretch' ? 230 : 520)) * (idleAnim === 'stretch' ? 0.055 : 0.018) : 0;
    visual.bubble.scale.set(0.85 / Math.max(0.01, scene.scale.x));
    visual.label.scale.set(1 / Math.max(0.01, scene.scale.x));
    const { x: tileX, y: tileY } = simToTile(position.x, position.y);
    visual.sceneTile = { x: tileX, y: tileY };
    visual.actor.zIndex = depthOf(tileX, tileY) + 1;
    visual.currentRoom = roomAt(position, visual);
    visual.moving = position.moving;
    visual.queueLength = position.queueLength;
    const activityStatus = position.moving && !['thinking', 'idle'].includes(visual.agent.status)
      ? 'arriving' : visual.agent.status === 'arriving' ? 'working' : visual.agent.status;
    setStableActivity(visual, activityPresentationOf({
      status: activityStatus,
      room: visual.currentRoom,
      delivering: Boolean(visual.delivery)
    }), now);
    visual.actor.tick(now, position.moving);
    visual.emote.position.set(x, y + visual.actor.emoteAnchorY);
    visual.emote.scale.set(1 / Math.max(0.01, scene.scale.x));
    visual.emote.tick(now);
    let message = position.message ?? '';
    if (visual.agent.status === 'thinking' && !position.moving && !position.queueLength) {
      message = `고민 중… ${Math.floor(Math.max(0, now - visual.agent.lastActivityAt) / 1000)}초`;
    }
    if (visual.agent.status !== 'idle' && visual.agent.status !== 'thinking') {
      message = visual.agent.status === 'arriving' && !position.moving && visual.currentRoom === 'desk' && !visual.hadRoomEvent
        ? '요청 기다리는 중'
        : speechLabel({ ...visual.agent, status: visual.agent.status === 'arriving' ? 'working' : visual.agent.status,
          room: visual.currentRoom, delivering: Boolean(visual.delivery) });
    }
    if (message !== visual.shownMessage) {
      replaceSpeech(visual, message, position.tone ?? 'work');
      visual.shownMessage = message;
    }
    if (visual.agent.status === 'idle' && position.room === `idle:${visual.idleSpot}` && !position.moving) {
      for (const spot of visual.heldIdleSpots) {
        if (spot === visual.idleSpot) continue;
        seats.releaseAux(id, `idle:${spot}`);
        visual.heldIdleSpots.delete(spot);
      }
    } else if (visual.releaseIdleAfterHome && !position.moving && position.room === visual.homeRoom) {
      seats.releaseAux(id);
      visual.heldIdleSpots.clear();
      visual.idleSpot = null;
      visual.releaseIdleAfterHome = false;
    }
    if (visual.agent.status === 'leaving' && position.room === 'leaving-door' && !position.moving) {
      visual.departureFadeAt ??= now;
      const alpha = Math.max(0, 1 - (now - visual.departureFadeAt) / 250);
      visual.actor.alpha = alpha;
      visual.overlay.alpha = alpha;
      if (alpha <= 0) {
        departed.add(id);
        visual.overlay.visible = false;
        visual.actor.visible = false;
      }
    } else {
      visual.actor.alpha = 1;
      visual.overlay.alpha = 1;
    }
    positioned.push({ visual, position: { x, y }, depth: visual.actor.zIndex });
  }
  placeLabels(positioned, now);
  if (widgetPage && !pipOfficeMode && now - lastMiniRefresh >= 250) {
    renderMini(document.querySelector('#agents'), currentSnapshot, { actualRooms: actualScreenRooms(), movingAgents: actualMovingAgents() });
    lastMiniRefresh = now;
  }
  if (pipController?.isOpen && !pipOfficeMode && now - lastMiniRefresh >= 250) {
    pipController.update(currentSnapshot, { actualRooms: actualScreenRooms() });
    lastMiniRefresh = now;
  }
  if (new URLSearchParams(window.location.search).has('sceneDiagnostics')) {
    window.__officeSceneAgents = () => [...characters.values()].map((visual) => ({
      id: visual.agent.id,
      room: visual.currentRoom ?? null,
      serverRoom: visual.agent.room ?? null,
      queueLength: visual.queueLength ?? 0,
      deliveryQueueLength: deliveryQueue.pendingCount,
      status: visual.agent.status,
      activity: visual.activity,
      emoteVisible: Boolean(visual.emote.visible),
      moving: Boolean(visual.moving),
      delivery: visual.delivery?.stage ?? null,
      tileX: visual.sceneTile?.x ?? null,
      tileY: visual.sceneTile?.y ?? null,
      inElevatorHall: Boolean(visual.sceneTile && visual.sceneTile.x >= 12 && visual.sceneTile.x < 14 &&
        visual.sceneTile.y >= 0 && visual.sceneTile.y < 3),
      emoteScale: visual.emoteScale ?? 1,
      head: screenPoint(visual.actor, { x: 0, y: -45 }),
      emote: screenPoint(visual.emote),
      badge: screenPoint(visual.badge),
      badgeDiameter: Math.max(visual.badge.getBounds().width, visual.badge.getBounds().height)
    }));
  }
}

function screenPoint(object, local = { x: 0, y: 0 }) {
  const point = object.toGlobal(local);
  return { x: point.x, y: point.y };
}

function fitScene() {
  if (!app) return;
  const { minX, minY, maxX, maxY } = office.bounds;
  const width = maxX - minX, height = maxY - minY;
  const widthPx = viewWidth();
  const heightPx = viewHeight();
  if (!widthPx || !heightPx) return;
  app.renderer.resize(widthPx, heightPx);
  app.canvas.style.width = '100%';
  app.canvas.style.height = '100%';
  // Leave a generous inset around drawOffice.bounds so both rear walls stay inside PiP.
  const fitMarginX = pipOfficeMode ? 0.94 : 0.9;
  const fitMarginY = pipOfficeMode ? 0.93 : 0.9;
  const scale = Math.min(widthPx * fitMarginX / width, heightPx * fitMarginY / height) * zoom;
  scene.scale.set(scale);
  scene.position.set((widthPx - width * scale) / 2 - minX * scale + pan.x,
    (heightPx - height * scale) / 2 - minY * scale + pan.y);
  if (labelLayer) {
    labelLayer.position.copyFrom(scene.position);
    labelLayer.scale.copyFrom(scene.scale);
  }
  if (glowLayer) {
    glowLayer.position.copyFrom(scene.position);
    glowLayer.scale.copyFrom(scene.scale);
  }
  lighting?.resize(app.screen.width, app.screen.height);
  for (const sign of office.signs.children) sign.scale.set(1 / Math.max(0.01, scale));
  for (const visual of characters.values()) visual.label.scale.set(1 / Math.max(0.01, scale));
}

// ---------- 시점 회전 (45도 단위, 8방향) ----------
const VIEW_KEY = 'agent-office.view';

function loadView() {
  try {
    const saved = localStorage.getItem(VIEW_KEY);
    if (saved !== null) setView(Number(saved));
  } catch { /* 저장소를 못 쓰면 기본 시점 */ }
}

function rotateView(delta) {
  setView(getView() + delta);
  try { localStorage.setItem(VIEW_KEY, String(getView())); } catch { /* 무시 */ }
  rebuildOffice();
  updateViewLabel();
  return viewAngle();
}

function updateViewLabel() {
  const label = document.querySelector('#view-angle');
  if (label) label.textContent = `${viewAngle()}°`;
}

/** 시점이 바뀌면 사무실 그림만 다시 그리고, 캐릭터·이동 상태는 그대로 옮겨 싣는다. */
function rebuildOffice() {
  if (!office) return;
  const old = office;
  const next = drawOffice(PIXI);
  next.objects.sortableChildren = true;
  for (const visual of characters.values()) {
    next.objects.addChild(visual.snack);
    next.objects.addChild(visual.actor);
  }
  const index = scene.getChildIndex(old.root);
  scene.removeChild(old.root);
  scene.addChildAt(next.root, index);
  old.root.destroy({ children: true });
  office = next;
  if (mailbox) {
    const mailboxPoint = mailboxPosition();
    mailbox.position.set(mailboxPoint.x, mailboxPoint.y + (getTheme().delivery?.mailbox?.baseOffsetY ?? -2));
    const tile = deliveryTile();
    mailbox.zIndex = depthOf(tile.x, tile.y) + (getTheme().delivery?.mailbox?.depthOffset ?? 2);
    updateMailbox(currentSnapshot);
  }
  for (const item of widgetRoomSigns) item.container.destroy({ children: true });
  createWidgetRoomSigns();
  fitScene();
  updateLabelPositions(Date.now());
}

window.__agentOfficeRotate = rotateView;
window.__agentOfficeSetTheme = (id) => {
  const selected = setTheme(id);
  const selector = document.querySelector('#theme-select');
  if (selector) selector.value = selected.id;
  applyThemeBackgrounds();
  rebuildOffice();
  renderPanels(currentSnapshot, Date.now());
  return selected.id;
};

function installControls() {
  document.querySelector('#zoom-in').onclick = () => { zoom = Math.min(1.8, zoom * 1.15); fitScene(); };
  document.querySelector('#zoom-out').onclick = () => { zoom = Math.max(0.55, zoom / 1.15); fitScene(); };
  document.querySelector('#reset-view').onclick = () => { zoom = 1; pan = { x: 0, y: 0 }; fitScene(); };
  const rotateLeft = document.querySelector('#rotate-left');
  const rotateRight = document.querySelector('#rotate-right');
  if (rotateLeft) rotateLeft.onclick = () => rotateView(-1);
  if (rotateRight) rotateRight.onclick = () => rotateView(1);
  window.addEventListener('keydown', (event) => {
    if (event.target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) return;
    if (event.key === '[') rotateView(-1);
    if (event.key === ']') rotateView(1);
  });
  updateViewLabel();
  app.canvas.addEventListener('pointerdown', (event) => {
    if (pipOfficeMode) return;
    drag = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
    app.canvas.setPointerCapture(event.pointerId);
  });
  app.canvas.addEventListener('pointermove', (event) => {
    const rect = app.canvas.getBoundingClientRect();
    pointer = { x: event.offsetX * app.screen.width / rect.width, y: event.offsetY * app.screen.height / rect.height };
    if (!drag) return;
    pan = { x: drag.panX + event.clientX - drag.x, y: drag.panY + event.clientY - drag.y };
    fitScene();
  });
  app.canvas.addEventListener('pointerup', () => { drag = null; });
  app.canvas.addEventListener('pointercancel', () => { drag = null; });
  app.canvas.addEventListener('pointerleave', () => { pointer = { x: -1, y: -1 }; });
  app.canvas.addEventListener('wheel', (event) => {
    if (pipOfficeMode) return;
    event.preventDefault(); zoom = Math.max(0.55, Math.min(1.8, zoom * (event.deltaY < 0 ? 1.08 : 0.92))); fitScene();
  }, { passive: false });
}

function installDesktopWidget() {
  const tauri = desktopTauri;
  const isDesktop = Boolean(tauri?.window?.getCurrentWindow);
  desktopWidgetWindow = isDesktop ? tauri.window.getCurrentWindow() : null;
  widgetChrome = installWidgetChrome(document, {
    initialMode: 'office',
    onRotate: (delta) => rotateView(delta),
    onThemeCycle: cycleTheme,
    desktop: Boolean(desktopWidgetWindow),
    settingsEnabled: true,
    onSettingsClose() { window.__agentOfficeConnectionRequested = false; },
    onHoverChange: onWidgetHoverChange,
    opacity: widgetOpacity,
    passthrough: cursorPassthrough,
    onPassthroughToggle() {
      if (!tauri?.core?.invoke) return;
      void tauri.core.invoke('set_mouse_passthrough', { enabled: !cursorPassthrough });
    },
    onOpacityChange(values) {
      widgetOpacity = { ...widgetOpacity, ...values };
      applyWidgetOpacity();
      void saveWidgetOpacity();
    },
    onMode(mode, officeView) {
      const wasOffice = pipOfficeMode;
      pipOfficeMode = mode === 'office';
      if (pipOfficeMode && !wasOffice) widgetSignExpandedUntil = Date.now() + 10_000;
      if (screenSignLayer) screenSignLayer.visible = pipOfficeMode;
      activeHost = host;
      if (pipOfficeMode) {
        zoom = 1;
        pan = { x: 0, y: 0 };
        fitScene();
      }
      renderMini(document.querySelector('#agents'), currentSnapshot, { actualRooms: actualScreenRooms() });
      updateLabelPositions(Date.now());
    },
    resizeWindow(mode) {
      if (!desktopWidgetWindow || !tauri?.window?.LogicalSize) return;
      if (mode === 'mini') {
        const height = 64;
        desktopWidgetWindow.setSize(new tauri.window.LogicalSize(420, height)).catch(() => {});
      } else {
        desktopWidgetWindow.setSize(new tauri.window.LogicalSize(desktopOfficeSize.width, desktopOfficeSize.height)).catch(() => {});
      }
    },
    onClose() {
      if (desktopWidgetWindow) desktopWidgetWindow.hide().catch(() => {});
      else window.close();
    }
  });

  if (window.__agentOfficeConnectionRequested) widgetChrome.openSettings('connection');

  if (!desktopWidgetWindow) return;
  window.__agentOfficeSetCursorPassthrough = (enabled) => {
    cursorPassthrough = enabled === true;
    widgetChrome?.setPassthrough(cursorPassthrough);
    applyWidgetOpacity();
  };
  void tauri.core.invoke('mouse_passthrough_enabled')
    .then((enabled) => window.__agentOfficeSetCursorPassthrough(enabled))
    .catch(() => {});
  desktopWidgetWindow.onResized(async () => {
    if (document.body.classList.contains('mini-mode')) return;
    try {
      const [size, factor] = await Promise.all([desktopWidgetWindow.innerSize(), desktopWidgetWindow.scaleFactor()]);
      desktopOfficeSize = { width: Math.round(size.width / factor), height: Math.round(size.height / factor) };
    } catch { /* Window state restoration may race initial page load. */ }
  });
  const canvas = app.canvas;
  let pendingDrag = null;
  const isInteractiveAt = (x, y) => {
    const objects = [...characters.values()].flatMap((visual) => [visual.label, visual.bubble, visual.badge]);
    for (const bundle of bundles.values()) objects.push(bundle.chip, bundle.card);
    return objects.some((object) => {
      if (!object?.visible || object.destroyed) return false;
      const bounds = object.getBounds();
      return x >= bounds.x && x <= bounds.x + bounds.width && y >= bounds.y && y <= bounds.y + bounds.height;
    });
  };
  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.offsetX * app.screen.width / rect.width;
    const y = event.offsetY * app.screen.height / rect.height;
    if (isInteractiveAt(x, y)) return;
    pendingDrag = { x: event.clientX, y: event.clientY };
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!pendingDrag || Math.hypot(event.clientX - pendingDrag.x, event.clientY - pendingDrag.y) < 4) return;
    pendingDrag = null;
    desktopWidgetWindow.startDragging().catch(() => {});
  });
  canvas.addEventListener('pointerup', () => { pendingDrag = null; });
  canvas.addEventListener('pointercancel', () => { pendingDrag = null; });
  // 설정 패널의 빈 곳은 창을 끄는 영역으로 쓰고, 조작 요소의 입력은 보존한다
  const settingsPanel = document.querySelector('#widget-settings');
  settingsPanel?.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || event.target.closest('button, input, select, textarea, label, a')) return;
    pendingDrag = { x: event.clientX, y: event.clientY };
  });
  settingsPanel?.addEventListener('pointermove', (event) => {
    if (!pendingDrag || Math.hypot(event.clientX - pendingDrag.x, event.clientY - pendingDrag.y) < 4) return;
    pendingDrag = null;
    desktopWidgetWindow.startDragging().catch(() => {});
  });
  settingsPanel?.addEventListener('pointerup', () => { pendingDrag = null; });
  settingsPanel?.addEventListener('pointercancel', () => { pendingDrag = null; });
}

async function start() {
  installThemeSelector();
  personality = await fetch('/personality.json').then((response) => response.json()).catch(() => ({}));
  const settings = await fetch('/api/settings').then((response) => response.json()).catch(() => ({}));
  lightingMode = settings.lighting === 'day' ? 'day' : 'auto';
  clockSpeed = Number.isFinite(settings.clockSpeed) && settings.clockSpeed > 0 ? settings.clockSpeed : 1;
  presentationMode = settings.presentationMode === true;
  desktopTauri = window.__TAURI__;
  if (widgetPage && desktopTauri?.core?.invoke) {
    try {
      const stored = await desktopTauri.core.invoke('load_widget_settings');
      widgetOpacity = {
        background: Math.max(0, Math.min(100, Number(stored?.background ?? 100))),
        overall: Math.max(30, Math.min(100, Number(stored?.overall ?? 100))),
        autoDim: stored?.autoDim === true
      };
    } catch (error) { console.warn('Could not load widget opacity settings', error); }
  }
  if (widgetPage) pipOfficeMode = true;
  applyThemeBackgrounds();
  await app.init({ antialias: true, autoDensity: true, backgroundAlpha: 0,
    width: host.clientWidth, height: host.clientHeight, resolution: window.devicePixelRatio || 1 });
  host.prepend(app.canvas);
  loadView();
  office = drawOffice(PIXI);
  office.objects.sortableChildren = true;
  glowLayer = new PIXI.Container();
  glowLayer.sortableChildren = true;
  worldEffectsLayer = new PIXI.Container();
  worldEffectsLayer.sortableChildren = true;
  lighting = createLightingOverlay(PIXI);
  labelLayer = new PIXI.Container();
  labelLayer.sortableChildren = true;
  screenSignLayer = new PIXI.Container();
  const mailboxPoint = mailboxPosition();
  mailbox = createMailbox(PIXI, getTheme().delivery?.mailbox);
  mailbox.position.set(mailboxPoint.x, mailboxPoint.y + (getTheme().delivery?.mailbox?.baseOffsetY ?? -2));
  const tile = deliveryTile();
  mailbox.zIndex = depthOf(tile.x, tile.y) + (getTheme().delivery?.mailbox?.depthOffset ?? 2);
  worldEffectsLayer.addChild(mailbox);
  scene.addChild(office.root, worldEffectsLayer);
  app.stage.addChild(scene, lighting.layer, glowLayer, screenSignLayer, labelLayer);
  createWidgetRoomSigns();
  if (widgetPage) widgetSignExpandedUntil = Date.now() + 10_000;
  applyWidgetOpacity();
  updatePresentationControl();
  document.querySelector('#presentation-toggle').addEventListener('click', async () => {
    const response = await fetch('/api/presentation', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ presentationMode: !presentationMode })
    });
    if (!response.ok) return;
    presentationMode = (await response.json()).presentationMode;
    updatePresentationControl();
    updateSnapshot(await fetch('/api/state').then((result) => result.json()), true);
  });
  installControls(); fitScene();
  const initial = await fetch('/api/state').then((response) => response.json());
  clockAnchorWall = Date.now();
  clockAnchorOffice = initial.now ?? clockAnchorWall;
  updateSnapshot(initial, true);
  if (widgetPage) {
    installConnectionForm();
    await refreshConnectionScreen();
    if (window.__agentOfficeConnectionRequested) window.__agentOfficeShowConnection();
  }
  const stream = new EventSource('/events');
  stream.addEventListener('snapshot', (event) => updateSnapshot(JSON.parse(event.data), true));
  stream.addEventListener('delta', (event) => updateSnapshot(JSON.parse(event.data)));
  app.ticker.add(() => {
    const now = Date.now();
    if (pipOfficeMode) window.__pipTickerFrameCount = (window.__pipTickerFrameCount ?? 0) + 1;
    applyWidgetOpacity(now);
    updateLabelPositions(now);
    updateEffects(now);
  });
  if (!widgetPage) pipController = installPipController({
    button: document.querySelector('#pip-toggle'),
    canvas: app.canvas,
    ticker: app.ticker,
    renderMini,
    onRotate: (delta) => rotateView(delta),
    onThemeCycle: cycleTheme,
    onEnter(pipHost) {
      pipViewState = { zoom, pan: { ...pan } };
      activeHost = pipHost;
      applyThemeBackgrounds();
      pipOfficeMode = true;
      widgetSignExpandedUntil = Date.now() + 10_000;
      if (screenSignLayer) screenSignLayer.visible = true;
      zoom = 1;
      pan = { x: 0, y: 0 };
      fitScene();
      updateLabelPositions(Date.now());
    },
    onResize() { fitScene(); updateLabelPositions(Date.now()); },
    onMode(mode, pipHost) {
      const wasOffice = pipOfficeMode;
      pipOfficeMode = mode === 'office';
      if (pipOfficeMode && !wasOffice) widgetSignExpandedUntil = Date.now() + 10_000;
      if (screenSignLayer) screenSignLayer.visible = pipOfficeMode;
      activeHost = pipHost;
      applyThemeBackgrounds();
      if (pipOfficeMode) {
        zoom = 1;
        pan = { x: 0, y: 0 };
        fitScene();
        updateLabelPositions(Date.now());
      }
    },
    onLeave() {
      pipOfficeMode = false;
      widgetSignHover = false;
      if (screenSignLayer) screenSignLayer.visible = false;
      activeHost = host;
      host.prepend(app.canvas);
      if (pipViewState) {
        zoom = pipViewState.zoom;
        pan = pipViewState.pan;
      }
      pipViewState = null;
      fitScene();
      updateLabelPositions(Date.now());
    }
  });
  if (widgetPage) installDesktopWidget();
  pipController?.update(currentSnapshot);
  window.addEventListener('resize', fitScene);
}

function updatePresentationControl() {
  const button = document.querySelector('#presentation-toggle');
  const badge = document.querySelector('#presentation-badge');
  if (!button || !badge) return;
  button.setAttribute('aria-pressed', String(presentationMode));
  button.textContent = presentationMode ? '발표 모드 끄기' : '발표 모드';
  badge.hidden = !presentationMode;
}

start().catch((error) => {
  console.error('Office view failed to initialize', error);
  host.textContent = '오피스 화면을 불러오지 못했습니다. 로컬 그림 파일을 확인해 주세요.';
});
