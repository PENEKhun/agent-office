import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTIVITIES, ROOM_ACTIVITY, activityOf, activityPresentationOf } from '../public/office-activity.js';
import { roomLabel, speechLabel } from '../public/labels.js';
import { activityIcon } from '../public/mini-render.js';

test('activityOf keeps its string return value and existing non-thinking priorities', () => {
  assert.equal(activityOf({ status: 'thinking', room: 'lounge' }), 'rest');
  assert.equal(Object.hasOwn(ACTIVITIES, 'sleep'), false);
  assert.equal(activityOf({ status: 'idle', room: 'server' }), 'rest');
  assert.equal(activityOf({ status: 'working', room: 'dev' }), 'code');
  assert.equal(activityOf({ status: 'working', room: 'delivery' }), 'deliver');
  assert.equal(activityOf({ status: 'working', room: 'desk', delivering: true }), 'deliver');
});

test('thinking keeps a known room symbol and adds a think marker', () => {
  assert.deepEqual(activityPresentationOf({ status: 'thinking', room: 'dev' }), { kind: 'code', think: true });
  assert.deepEqual(activityPresentationOf({ status: 'thinking', room: 'library' }), { kind: 'read', think: true });
  assert.deepEqual(activityPresentationOf({ status: 'thinking', room: 'lounge' }), { kind: 'rest', think: true });
  assert.deepEqual(activityPresentationOf({ status: 'thinking', room: 'desk' }), { kind: 'think', think: false });
  assert.deepEqual(activityPresentationOf({ status: 'thinking', room: null }), { kind: 'think', think: false });
  assert.deepEqual(activityPresentationOf({ status: 'thinking', room: 'unknown' }), { kind: 'think', think: false });
});

test('delivery and movement states do not get the thinking marker', () => {
  assert.deepEqual(activityPresentationOf({ status: 'thinking', room: 'dev', delivering: true }), { kind: 'deliver', think: false });
  assert.deepEqual(activityPresentationOf({ status: 'arriving', room: 'dev' }), { kind: 'walk', think: false });
  assert.deepEqual(activityPresentationOf({ status: 'leaving', room: 'dev' }), { kind: 'walk', think: false });
});

test('room activity and shared labels keep the response desk wording consistent', () => {
  assert.equal(ROOM_ACTIVITY.desk, 'reply');
  assert.equal(roomLabel('desk'), '응답 데스크');
  assert.equal(speechLabel({ status: 'working', room: 'desk' }), ACTIVITIES.reply.label);
  assert.equal(speechLabel({ status: 'working', room: 'dev' }), ACTIVITIES.code.label);
});

test('mini bar activity icons use the same activity palette and include all kinds', () => {
  for (const [kind, activity] of Object.entries(ACTIVITIES)) {
    const svgData = decodeURIComponent(activityIcon(kind).slice('data:image/svg+xml,'.length));
    assert.match(svgData, /<svg/);
    assert.ok(svgData.includes(`#${activity.color.toString(16).padStart(6, '0')}`));
  }
});
