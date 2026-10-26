import office from './office.js';
import space from './space.js';
import restaurant from './restaurant.js';
import { hasExtraGlyph } from '../glyphs.js';

const themes = new Map([[office.id, validateTheme(office)]]);
themes.set(space.id, validateTheme(space));
themes.set(restaurant.id, validateTheme(restaurant));
const STORAGE_KEY = 'agent-office.theme';
let selected = null;

function requestedTheme() {
  try {
    const query = new URLSearchParams(globalThis.location?.search ?? '').get('theme');
    if (query !== null) return query;
    return globalThis.localStorage?.getItem(STORAGE_KEY);
  } catch { return null; }
}

export function validateTheme(theme) {
  const roomIds = ['library', 'meeting', 'elevator', 'server', 'dev', 'search', 'desk', 'lounge'];
  const activityIds = ['read', 'code', 'run', 'search', 'plan', 'reply', 'think', 'rest', 'walk', 'deliver'];
  const themedActivityIds = ['read', 'code', 'run', 'search', 'plan', 'reply'];
  if (!theme || typeof theme.id !== 'string' || !theme.name || !theme.rooms || !theme.activityLabels
    || !theme.activityColors || !theme.palette || typeof theme.drawFurniture !== 'function') {
    throw new Error('테마 구조가 올바르지 않습니다.');
  }
  for (const id of roomIds) {
    const room = theme.rooms[id];
    if (!room || !room.name || !room.icon || !room.floor?.kind || !Array.isArray(room.floor.colors) || !room.floor.colors.length) {
      throw new Error(`테마 ${theme.id}에 방 정보가 없습니다: ${id}`);
    }
  }
  for (const id of activityIds) {
    if (typeof theme.activityLabels[id] !== 'string' || !theme.activityLabels[id]) throw new Error(`테마 ${theme.id}에 활동 문구가 없습니다: ${id}`);
    if (!Number.isFinite(theme.activityColors[id])) throw new Error(`테마 ${theme.id}에 활동 색이 없습니다: ${id}`);
  }
  if (theme.activityGlyphs !== undefined) {
    for (const id of themedActivityIds) {
      const glyph = theme.activityGlyphs[id];
      if (typeof glyph !== 'string' || !hasExtraGlyph(glyph)) {
        throw new Error(`테마 ${theme.id}에 활동 기호가 없습니다: ${id}`);
      }
    }
  }
  return theme;
}

export function registerTheme(theme) {
  validateTheme(theme);
  themes.set(theme.id, theme);
}

export function getTheme() {
  if (!selected) {
    const requested = requestedTheme();
    selected = themes.get(requested) ?? office;
  }
  return selected;
}

export function setTheme(id) {
  selected = themes.get(id) ?? office;
  try { globalThis.localStorage?.setItem(STORAGE_KEY, selected.id); } catch { /* 저장소를 못 쓰면 현재 화면에만 적용 */ }
  return selected;
}

export function listThemes() {
  return [...themes.values()];
}

export function nextThemeId(id) {
  const ids = [...themes.keys()];
  const index = ids.indexOf(id);
  return ids[(index + 1 + ids.length) % ids.length];
}
