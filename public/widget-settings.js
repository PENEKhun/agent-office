import { connectivityStatusLabel } from './labels.js';

export const TOOLBAR_BUTTONS = Object.freeze([
  { id: 'mode', label: '전환', icon: '▤' },
  { id: 'theme', label: '테마', icon: '✦' },
  { id: 'rotate', label: '회전', icon: '⟳' },
  { id: 'opacity', label: '투명도', icon: '◐' },
  { id: 'pin', label: '핀', icon: '📍' },
  { id: 'settings', label: '설정', icon: '⚙' },
  { id: 'close', label: '숨기기', icon: '×' }
]);
export const TOOLBAR_GROUPS = Object.freeze([
  Object.freeze(['mode']),
  Object.freeze(['theme', 'rotate', 'opacity']),
  Object.freeze(['pin', 'settings', 'close'])
]);

export function toolbarLabelsVisible(width) {
  return Number.isFinite(width) && width >= 480;
}

export function transientHint(value, shownAt, now, durationMs = 1500) {
  return typeof value === 'string' && value.length > 0 && Number.isFinite(shownAt) &&
    Number.isFinite(now) && now >= shownAt && now - shownAt < durationMs ? value : '';
}

export function opacityPopoverState(isOpen, action) {
  if (action === 'open') return true;
  if (action === 'close') return false;
  if (action === 'toggle') return !isOpen;
  return isOpen;
}

export function connectionStatusChip(state) {
  const status = !state.folder ? 'missing' : !state.recent ? 'stale' : 'active';
  const symbol = status === 'active' ? '●' : status === 'stale' ? '◐' : '✕';
  return { status, symbol, label: connectivityStatusLabel(state) };
}

export function settingsPanelState(isOpen, action) {
  if (action === 'open') return true;
  if (action === 'close') return false;
  if (action === 'toggle') return !isOpen;
  return isOpen;
}

export function pinHintVisible(enabled, enabledAt, now, durationMs = 2500) {
  return enabled === true && Number.isFinite(enabledAt) && now >= enabledAt && now - enabledAt < durationMs;
}
