import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceWidgetDim, createWidgetDimState } from '../public/widget-opacity.js';

const idleAgents = [{ status: 'idle' }];

test('automatic dim waits ten seconds, then transitions over half a second', () => {
  let state = createWidgetDimState();
  state = advanceWidgetDim(state, idleAgents, { autoDim: true }, 1000);
  assert.equal(state.factor, 1);

  state = advanceWidgetDim(state, idleAgents, { autoDim: true }, 10_999);
  assert.equal(state.factor, 1);

  state = advanceWidgetDim(state, idleAgents, { autoDim: true }, 11_000);
  assert.equal(state.factor, 1);
  state = advanceWidgetDim(state, idleAgents, { autoDim: true }, 11_250);
  assert.equal(state.factor, 0.7);
  state = advanceWidgetDim(state, idleAgents, { autoDim: true }, 11_500);
  assert.equal(state.factor, 0.4);
});

test('working or thinking agents immediately restore full opacity', () => {
  let state = createWidgetDimState();
  state = advanceWidgetDim(state, idleAgents, { autoDim: true }, 1000);
  state = advanceWidgetDim(state, idleAgents, { autoDim: true }, 11_500);
  state = advanceWidgetDim(state, [{ status: 'thinking' }], { autoDim: true }, 11_501);
  assert.equal(state.factor, 1);
  assert.equal(state.inactiveSince, null);
});

test('pin and automatic dim factors multiply and respect the lower bound', () => {
  let state = createWidgetDimState();
  state = advanceWidgetDim(state, idleAgents, {
    autoDim: true,
    pinned: true,
    idleDelayMs: 0,
    pinFactor: 0.7,
    automaticFactor: 0.4,
    transitionMs: 1,
    pinTransitionMs: 1
  }, 1000);
  state = advanceWidgetDim(state, idleAgents, {
    autoDim: true,
    pinned: true,
    idleDelayMs: 0,
    pinFactor: 0.7,
    automaticFactor: 0.4,
    transitionMs: 1,
    pinTransitionMs: 1
  }, 1001);
  assert.equal(state.factor, 0.28);

  state = advanceWidgetDim(state, idleAgents, {
    autoDim: true,
    pinned: true,
    idleDelayMs: 0,
    pinFactor: 0.2,
    automaticFactor: 0.4,
    minimumFactor: 0.25,
    transitionMs: 1
  }, 1002);
  state = advanceWidgetDim(state, idleAgents, {
    autoDim: true,
    pinned: true,
    idleDelayMs: 0,
    pinFactor: 0.2,
    automaticFactor: 0.4,
    minimumFactor: 0.25,
    transitionMs: 1
  }, 1003);
  assert.equal(state.factor, 0.25);
});

test('hover restores automatic dim when passthrough is off', () => {
  let state = createWidgetDimState();
  state = advanceWidgetDim(state, idleAgents, {
    autoDim: true,
    idleDelayMs: 0,
    transitionMs: 500
  }, 1000);
  state = advanceWidgetDim(state, idleAgents, {
    autoDim: true,
    idleDelayMs: 0,
    transitionMs: 500
  }, 1500);
  assert.equal(state.factor, 0.4);
  state = advanceWidgetDim(state, idleAgents, {
    autoDim: true,
    hovered: true,
    transitionMs: 500
  }, 1501);
  assert.equal(state.factor, 0.4);
  state = advanceWidgetDim(state, idleAgents, {
    autoDim: true,
    hovered: true,
    transitionMs: 500
  }, 2001);
  assert.equal(state.factor, 1);
});
