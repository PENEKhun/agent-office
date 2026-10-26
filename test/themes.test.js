import test from 'node:test';
import assert from 'node:assert/strict';
import office from '../public/themes/office.js';
import space from '../public/themes/space.js';
import restaurant from '../public/themes/restaurant.js';
import { getTheme, listThemes, nextThemeId, setTheme, validateTheme } from '../public/themes/index.js';
import { EXTRA_GLYPH_NAMES } from '../public/glyphs.js';

test('등록된 모든 테마가 방 8개와 활동 10개의 필수 항목을 가진다', () => {
  assert.deepEqual(listThemes().map(({ id }) => id), ['office', 'space', 'restaurant']);
  for (const theme of listThemes()) assert.equal(validateTheme(theme), theme);
  assert.equal(validateTheme(space), space);
  assert.equal(validateTheme(restaurant), restaurant);
  assert.equal(getTheme().id, 'office');
});

test('필수 방 키가 빠진 테마는 등록 검증에서 거부한다', () => {
  const incomplete = { ...office, rooms: { ...office.rooms } };
  delete incomplete.rooms.lounge;
  assert.throws(() => validateTheme(incomplete), /lounge/u);
});

test('필수 활동 문구가 빠진 테마는 등록 검증에서 거부한다', () => {
  const incomplete = { ...office, activityLabels: { ...office.activityLabels } };
  delete incomplete.activityLabels.deliver;
  assert.throws(() => validateTheme(incomplete), /deliver/u);
});

test('테마 활동 기호는 여섯 종류를 모두 구현 이름으로 지정한다', () => {
  const required = ['read', 'code', 'run', 'search', 'plan', 'reply'];
  for (const theme of [space, restaurant]) {
    assert.deepEqual(Object.keys(theme.activityGlyphs).sort(), [...required].sort());
    for (const glyph of Object.values(theme.activityGlyphs)) assert.ok(EXTRA_GLYPH_NAMES.includes(glyph));
    assert.equal(validateTheme(theme), theme);
  }
  assert.equal(Object.hasOwn(office, 'activityGlyphs'), false);
});

test('기호를 하나 빼거나 모르는 기호를 쓰면 테마 등록을 거부한다', () => {
  const missing = { ...space, activityGlyphs: { ...space.activityGlyphs } };
  delete missing.activityGlyphs.reply;
  assert.throws(() => validateTheme(missing), /reply/u);
  const unknown = { ...space, activityGlyphs: { ...space.activityGlyphs, reply: 'unknown-glyph' } };
  assert.throws(() => validateTheme(unknown), /reply/u);
});

test('알 수 없는 테마를 고르면 사무실 테마로 돌아간다', () => {
  assert.equal(setTheme('unknown').id, 'office');
  assert.equal(getTheme().id, 'office');
});

test('테마 순환은 사무실·우주 정거장·레스토랑 순서다', () => {
  assert.equal(nextThemeId('office'), 'space');
  assert.equal(nextThemeId('space'), 'restaurant');
  assert.equal(nextThemeId('restaurant'), 'office');
});

test('선택한 테마를 저장하고 새 화면에서 다시 불러온다', async () => {
  const localStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const locationDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'location');
  const values = new Map();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
  });
  Object.defineProperty(globalThis, 'location', { configurable: true, value: { search: '' } });
  try {
    setTheme('restaurant');
    assert.equal(values.get('agent-office.theme'), 'restaurant');
    const moduleUrl = new URL('../public/themes/index.js', import.meta.url);
    moduleUrl.searchParams.set('reload', String(Date.now()));
    const reloaded = await import(moduleUrl.href);
    assert.equal(reloaded.getTheme().id, 'restaurant');
  } finally {
    setTheme('office');
    if (localStorageDescriptor) Object.defineProperty(globalThis, 'localStorage', localStorageDescriptor);
    else delete globalThis.localStorage;
    if (locationDescriptor) Object.defineProperty(globalThis, 'location', locationDescriptor);
    else delete globalThis.location;
  }
});
