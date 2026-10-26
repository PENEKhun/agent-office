import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadAdapters } from '../src/adapters/index.js';
import codexAdapter, { createCodexAdapter } from '../src/adapters/codex.js';
import { validateEvent } from '../src/core/events.js';

test('adapter index loads Codex with the other sources', async () => {
  const adapters = await loadAdapters();
  assert.deepEqual(adapters.map((adapter) => adapter.id), ['antigravity', 'claude-code', 'codex', 'cowork']);
});

test('matches rollout JSONL files below the configured sessions root', () => {
  const adapter = createCodexAdapter({ roots: () => ['C:\\redacted\\sessions'] });
  assert.equal(adapter.match('C:\\redacted\\sessions\\2026\\rollout-session.jsonl'), true);
  assert.equal(adapter.match('C:\\redacted\\sessions\\rollout-session.txt'), false);
  assert.equal(adapter.match('C:\\other\\rollout-session.jsonl'), false);
});

test('uses the trailing filename UUID and primes project without replacing the session ID', () => {
  const adapter = createCodexAdapter({ now: () => 1000 });
  const session = adapter.createSession('C:\\sessions\\rollout-redacted-123e4567-e89b-12d3-a456-426614174000.jsonl');
  adapter.primeSession(session, JSON.stringify({
    type: 'session_meta',
    payload: { id: 'different-redacted-id', cwd: 'C:\\Workspace\\Project' }
  }));
  assert.equal(session.sessionId, '123e4567-e89b-12d3-a456-426614174000');
  assert.equal(session.project, 'c:/Workspace/Project');
});

test('parses redacted fixture events without forwarding source content', async () => {
  const fixture = new URL('./fixtures/codex/rollout-structure.jsonl', import.meta.url);
  const lines = (await readFile(fixture, 'utf8')).trim().split('\n');
  const adapter = createCodexAdapter({ now: () => 1000 });
  const session = adapter.createSession('C:\\redacted\\rollout-123e4567-e89b-12d3-a456-426614174000.jsonl');
  const events = lines.flatMap((line) => adapter.parseLine(session, line));

  assert.deepEqual(events.map((event) => event.kind), [
    'session_start', 'turn_start', 'tool_start', 'tool_end', 'tool_end',
    'tool_end', 'tool_end', 'thinking', 'message', 'turn_end'
  ]);
  assert.deepEqual(events.slice(0, 2).map((event) => event.project), [null, null]);
  assert.equal(events.every(validateEvent), true);
  assert.equal(JSON.stringify(events).includes('stdout'), false);
  assert.equal(JSON.stringify(events).includes('results'), false);
});

test('maps a local session, command timing, git success, and redacted output', () => {
  const adapter = createCodexAdapter({ now: () => 1000 });
  const session = adapter.createSession('C:\\redacted\\rollout-123e4567-e89b-12d3-a456-426614174000.jsonl');
  const [start] = adapter.parseLine(session, JSON.stringify({
    type: 'session_meta',
    timestamp: '2026-10-20T00:00:00Z',
    payload: { id: 'session-redacted', cwd: 'C:\\Workspace\\Project' }
  }));
  const events = adapter.parseLine(session, JSON.stringify({
    type: 'event_msg',
    timestamp: '2026-10-20T00:00:02Z',
    payload: {
      type: 'item_completed',
      started_at_ms: 100,
      completed_at_ms: 200,
      item: {
        type: 'CommandExecution',
        command: 'git commit -m <redacted>',
        exit_code: 0,
        stdout: 'private output',
        stderr: 'private error'
      }
    }
  }));

  assert.equal(start.sessionId, '123e4567-e89b-12d3-a456-426614174000');
  assert.equal(start.project, 'c:/Workspace/Project');
  assert.equal(start.live, true);
  assert.deepEqual(events.map((event) => event.kind), ['tool_start', 'tool_end', 'git']);
  assert.equal(events[0].detail, 'git');
  assert.equal(events[0].startedAt, 100);
  assert.equal(events[1].endedAt, 200);
  assert.equal(events[1].exitCode, 0);
  assert.deepEqual(events[2].git, { action: 'commit' });
  assert.equal(JSON.stringify(events).includes('private'), false);
});

test('handles the command argument array shape found in current rollouts', () => {
  const adapter = createCodexAdapter({ now: () => 1000 });
  const session = adapter.createSession('C:\\redacted\\rollout-session.jsonl');
  const [start, end] = adapter.parseLine(session, JSON.stringify({
    type: 'event_msg',
    payload: {
      type: 'item_completed',
      started_at_ms: 10,
      completed_at_ms: 20,
      item: {
        type: 'CommandExecution',
        command: ['C:\\Tools\\pwsh.exe', '-Command', 'rg <redacted>'],
        exit_code: 0
      }
    }
  }));
  assert.equal(start.room, 'library');
  assert.equal(start.detail, 'rg');
  assert.equal(end.exitCode, 0);
});

test('uses the shell script for command detail, search classification, and git detection', () => {
  const adapter = createCodexAdapter({ now: () => 1000 });
  const session = adapter.createSession('C:\\redacted\\rollout-session.jsonl');
  const [searchStart] = adapter.parseLine(session, JSON.stringify({
    type: 'event_msg',
    payload: {
      type: 'item_completed',
      item: {
        type: 'CommandExecution',
        command: ['bash', '-lc', 'rg <redacted>'],
        exit_code: 1
      }
    }
  }));
  const gitEvents = adapter.parseLine(session, JSON.stringify({
    type: 'event_msg',
    payload: {
      type: 'item_completed',
      item: {
        type: 'CommandExecution',
        command: ['powershell.exe', '-Command', 'git commit -m <redacted>'],
        exit_code: 0
      }
    }
  }));
  assert.equal(searchStart.room, 'library');
  assert.equal(searchStart.detail, 'rg');
  assert.deepEqual(gitEvents.map((event) => event.kind), ['tool_start', 'tool_end', 'git']);
  assert.equal(gitEvents[0].detail, 'git');
});

test('maps file changes, MCP tool names, Extension, thinking, and agent messages safely', () => {
  const adapter = createCodexAdapter({ now: () => 1000 });
  const session = adapter.createSession('C:\\redacted\\rollout-session.jsonl');
  const makeRow = (item) => JSON.stringify({
    type: 'event_msg',
    timestamp: '2026-10-20T00:00:00Z',
    payload: { type: 'item_completed', completed_at_ms: 200, item }
  });

  const fileEvents = adapter.parseLine(session, makeRow({
    type: 'FileChange',
    changes: [{ path: 'C:\\private\\src\\Main.js' }],
    stdout: 'private diff'
  }));
  const mcpEvents = adapter.parseLine(session, makeRow({
    type: 'McpToolCall', server: 'example', tool: 'lookup', arguments: 'private', result: 'private'
  }));
  const extensionEvents = adapter.parseLine(session, makeRow({
    type: 'Extension', kind: 'private', query: 'private', results: 'private'
  }));
  const reasoningEvents = adapter.parseLine(session, makeRow({ type: 'Reasoning', text: 'private' }));
  const messageEvents = adapter.parseLine(session, makeRow({ type: 'AgentMessage', message: 'private' }));

  assert.equal(fileEvents[0].room, 'dev');
  assert.equal(fileEvents[0].detail, 'Main.js');
  assert.equal(mcpEvents[0].room, 'search');
  assert.equal(mcpEvents[0].detail, 'example/lookup');
  assert.equal(extensionEvents[0].detail, 'Extension');
  assert.equal(reasoningEvents[0].kind, 'thinking');
  assert.equal(messageEvents[0].kind, 'message');
  assert.equal([...fileEvents, ...mcpEvents, ...extensionEvents, ...reasoningEvents, ...messageEvents]
    .every(validateEvent), true);
  assert.equal(JSON.stringify([...fileEvents, ...mcpEvents, ...extensionEvents, ...reasoningEvents, ...messageEvents])
    .includes('private'), false);
});

test('separates intentionally ignored and unknown lines without throwing on malformed JSON', () => {
  const adapter = createCodexAdapter({ now: () => 1000 });
  const session = adapter.createSession('C:\\redacted\\rollout-session.jsonl');
  assert.deepEqual(adapter.parseLine(session, '{'), []);
  assert.deepEqual(adapter.parseLine(session, JSON.stringify({ type: 'response_item', payload: {} })), []);
  assert.deepEqual(adapter.parseLine(session, JSON.stringify({ type: 'event_msg', payload: { type: 'turn_aborted' } })), []);
  assert.deepEqual(adapter.parseLine(session, JSON.stringify({ type: 'future_record', payload: {} })), []);
  assert.deepEqual(adapter.parseLine(session, JSON.stringify({
    type: 'event_msg', payload: { type: 'item_completed', item: { type: 'ImageView' } }
  })), []);
  assert.equal(session.ignoredCount, 2);
  assert.equal(session.unknownCount, 3);
});

test('exports the Codex adapter instance', () => {
  assert.equal(codexAdapter.id, 'codex');
});
