import test from 'node:test';
import assert from 'node:assert/strict';
import { activityLabel, agentLabel, connectivityStatusLabel, detailLabel, roomLabel, sourceLabel, speechLabel, statusLabel } from '../public/labels.js';

test('labels translate sources, rooms, and statuses to Korean', () => {
  assert.equal(sourceLabel('codex'), 'Codex');
  assert.equal(sourceLabel('claude-code'), 'Claude Code');
  assert.equal(sourceLabel('claude-desktop'), 'Claude Desktop');
  assert.equal(sourceLabel('opencode'), 'opencode');
  assert.equal(roomLabel('library'), '자료실');
  assert.equal(roomLabel('desk'), '응답 데스크');
  assert.equal(statusLabel('thinking'), '고민 중');
});

test('connection screen distinguishes missing, inactive, and active folders', () => {
  assert.equal(connectivityStatusLabel({ folder: false, recent: false }), '폴더 없음');
  assert.equal(connectivityStatusLabel({ folder: true, recent: false }), '폴더 있음 · 최근 활동 없음');
  assert.equal(connectivityStatusLabel({ folder: true, recent: true }), '활동 중');
});

test('agent names prefer a short title and append a four character id', () => {
  assert.equal(agentLabel({ title: '작업 제목이 너무 깁니다', agentId: '123456' }), '작업 제목이 너무 깁니다 · 1234');
  assert.equal(agentLabel({ source: 'antigravity', agentId: 'abcd' }), 'Antigravity · abcd');
  assert.equal(agentLabel({ source: 'codex', agentId: 'child-id', parentAgentId: 'parent-123' }), 'Codex · pare');
  assert.equal(agentLabel({ source: 'codex', agentId: 'child-id', parentAgentId: 'parent-123' }, { hideId: true }), 'Codex');
  assert.equal(agentLabel({ source: 'codex', title: 'Private title', agentId: 'child-id' }, { hideId: true }), 'Private title');
});

test('filler details do not appear in speech', () => {
  assert.equal(detailLabel('도구 사용'), '');
  assert.equal(detailLabel('세부 작업'), '');
  assert.equal(speechLabel({ status: 'working', room: 'server', detail: '도구 사용' }), '명령 실행 중');
  assert.equal(speechLabel({ status: 'working', room: 'server', detail: '세부 작업' }), '명령 실행 중');
});

test('internal English details are translated or replaced with a safe Korean label', () => {
  assert.equal(detailLabel('CommandExecution'), '명령 실행');
  assert.equal(detailLabel('npm run test'), '');
  assert.equal(detailLabel('문서 정리'), '문서 정리');
});

test('speech and activity use Korean action labels', () => {
  assert.equal(speechLabel({ status: 'working', room: 'dev', detail: 'Edit' }), '코드 수정 중 · 파일 수정');
  assert.equal(activityLabel({ kind: 'tool_end', room: 'server', tool: 'Bash' }), '명령 실행 중');
  assert.equal(speechLabel({ status: 'working', room: 'server', detail: null }), '명령 실행 중');
  assert.equal(activityLabel({ kind: 'git' }), 'git 작업 완료');
  assert.equal(speechLabel({ status: 'working', room: 'desk', detail: null }), '답변 쓰는 중');
  assert.equal(speechLabel({ status: 'thinking', room: 'lounge', detail: null }), '고민 중… 0초');
});
