import test from 'node:test';
import assert from 'node:assert/strict';
import {
  connectionStatusChip, opacityPopoverState, pinHintVisible, settingsPanelState,
  toolbarLabelsVisible, transientHint, TOOLBAR_BUTTONS, TOOLBAR_GROUPS
} from '../public/widget-settings.js';

test('toolbar has seven ordered buttons in three groups', () => {
  assert.deepEqual(TOOLBAR_GROUPS, [['mode'], ['theme', 'rotate', 'opacity'], ['pin', 'settings', 'close']]);
  assert.deepEqual(TOOLBAR_BUTTONS.map(({ id }) => id), ['mode', 'theme', 'rotate', 'opacity', 'pin', 'settings', 'close']);
});

test('toolbar labels appear at 480 pixels and remain hidden below it', () => {
  assert.equal(toolbarLabelsVisible(479), false);
  assert.equal(toolbarLabelsVisible(480), true);
  assert.equal(toolbarLabelsVisible(Number.NaN), false);
});

test('theme and view hints expire after the injected 1.5 second interval', () => {
  assert.equal(transientHint('레스토랑', 1000, 2499), '레스토랑');
  assert.equal(transientHint('45°', 1000, 2500), '');
  assert.equal(transientHint('', 1000, 1100), '');
});

test('opacity popover toggles and closes when another action or Escape requests it', () => {
  assert.equal(opacityPopoverState(false, 'toggle'), true);
  assert.equal(opacityPopoverState(true, 'toggle'), false);
  assert.equal(opacityPopoverState(true, 'close'), false);
  assert.equal(opacityPopoverState(false, 'open'), true);
});

test('connection status chips use distinct symbols with text labels', () => {
  assert.deepEqual(connectionStatusChip({ folder: true, recent: true }), { status: 'active', symbol: '●', label: '활동 중' });
  assert.deepEqual(connectionStatusChip({ folder: true, recent: false }), { status: 'stale', symbol: '◐', label: '폴더 있음 · 최근 활동 없음' });
  assert.deepEqual(connectionStatusChip({ folder: false, recent: false }), { status: 'missing', symbol: '✕', label: '폴더 없음' });
});

test('settings panel open, close, and toggle transitions stay predictable', () => {
  assert.equal(settingsPanelState(false, 'open'), true);
  assert.equal(settingsPanelState(true, 'close'), false);
  assert.equal(settingsPanelState(false, 'toggle'), true);
  assert.equal(settingsPanelState(true, 'toggle'), false);
});

test('pin hint lasts only for the injected interval after enabling', () => {
  assert.equal(pinHintVisible(true, 1000, 3499), true);
  assert.equal(pinHintVisible(true, 1000, 3500), false);
  assert.equal(pinHintVisible(false, 1000, 1100), false);
  assert.equal(pinHintVisible(true, null, 1100), false);
});
