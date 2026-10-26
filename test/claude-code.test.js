import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAdapters } from '../src/adapters/index.js';
import claudeCodeAdapter, { createClaudeCodeAdapter } from '../src/adapters/claude-code.js';
import { validateEvent } from '../src/core/events.js';

test('adapter index loads the Claude Code adapter automatically', async () => {
  const adapters = await loadAdapters();
  assert.deepEqual(adapters.map((adapter) => adapter.id), ['antigravity', 'claude-code', 'codex', 'cowork', 'opencode']);
});

test('parses a redacted local-agent-mode fixture without exposing source text', async () => {
  const fixture = new URL('./fixtures/claude-desktop/local-agent-mode.jsonl', import.meta.url);
  const lines = (await readFile(fixture, 'utf8')).trim().split('\n');
  const fixturePath = fileURLToPath(fixture);
  const adapter = createClaudeCodeAdapter({
    now: () => 1000,
    roots: () => [dirname(fixturePath)],
    desktopRoot: () => dirname(fixturePath)
  });
  const session = adapter.createSession(fixturePath);
  const events = lines.flatMap((line) => adapter.parseLine(session, line));

  assert.deepEqual(events.map((event) => event.kind), [
    'session_start', 'thinking', 'tool_start', 'tool_end'
  ]);
  assert.equal(events[2].tool, 'Read');
  assert.equal(events[2].detail, '<redacted>');
  assert.equal(events[3].exitCode, 0);
  assert.equal(events.every((event) => event.source === 'claude-desktop'), true);
  assert.equal(events.every(validateEvent), true);
  assert.equal(JSON.stringify(events).includes('thinking>'), false);
});

test('malformed and unsupported transcript lines never throw', () => {
  const session = claudeCodeAdapter.createSession('redacted-session.jsonl');
  assert.deepEqual(claudeCodeAdapter.parseLine(session, 'not-json'), []);
  assert.deepEqual(claudeCodeAdapter.parseLine(session, '{"type":"queue-operation"}'), []);
  assert.equal(session.unknownCount, 2);
});

test('converts Task calls to spawn/despawn without retaining call arguments', () => {
  const adapter = createClaudeCodeAdapter({ now: () => 1000, roots: () => [] });
  const session = adapter.createSession('redacted-session.jsonl');
  const start = JSON.stringify({
    type: 'assistant',
    timestamp: '2026-01-01T00:00:00Z',
    sessionId: '<redacted>',
    isSidechain: false,
    message: { content: [{ type: 'tool_use', id: '<redacted>', name: 'Task', input: { prompt: '<redacted>' } }] }
  });
  const end = JSON.stringify({
    type: 'user',
    timestamp: '2026-01-01T00:00:01Z',
    sessionId: '<redacted>',
    isSidechain: false,
    message: { content: [{ type: 'tool_result', tool_use_id: '<redacted>', is_error: false, content: '<redacted>' }] }
  });
  const events = [...adapter.parseLine(session, start), ...adapter.parseLine(session, end)];
  assert.deepEqual(events.map((event) => event.kind), ['session_start', 'spawn', 'despawn']);
  assert.equal(JSON.stringify(events).includes('prompt'), false);
});

test('treats a Bash git result without is_error as success', () => {
  const adapter = createClaudeCodeAdapter({ now: () => 1000, roots: () => [] });
  const session = adapter.createSession('redacted-session.jsonl');
  const start = JSON.stringify({
    type: 'assistant',
    timestamp: '2026-01-01T00:00:00Z',
    sessionId: '<redacted>',
    isSidechain: false,
    message: { content: [{
      type: 'tool_use', id: '<redacted>', name: 'Bash', input: { command: 'git commit -m <redacted>' }
    }] }
  });
  const end = JSON.stringify({
    type: 'user',
    timestamp: '2026-01-01T00:00:01Z',
    sessionId: '<redacted>',
    isSidechain: false,
    message: { content: [{ type: 'tool_result', tool_use_id: '<redacted>', content: '<redacted>' }] }
  });
  const events = [...adapter.parseLine(session, start), ...adapter.parseLine(session, end)];
  assert.equal(events.find((event) => event.kind === 'tool_end').exitCode, 0);
  assert.deepEqual(events.find((event) => event.kind === 'git').git, { action: 'commit' });
  assert.equal(events.find((event) => event.kind === 'git').detail, 'git');
});

test('keeps side-agent IDs distinct when transcript session IDs equal the parent', () => {
  const adapter = createClaudeCodeAdapter({ now: () => 1000, roots: () => [] });
  const createSidechainEvent = (filePath, agentId) => {
    const session = adapter.createSession(filePath);
    const line = JSON.stringify({
      type: 'assistant',
      timestamp: '2026-01-01T00:00:00Z',
      sessionId: 'parent-session',
      agentId,
      isSidechain: true,
      message: { content: [{ type: 'text', text: '<redacted>' }] }
    });
    return adapter.parseLine(session, line)[0];
  };
  const first = createSidechainEvent(join('project', 'subagents', 'agent-one.jsonl'));
  const second = createSidechainEvent(join('project', 'subagents', 'agent-two.jsonl'));
  const explicit = createSidechainEvent(join('project', 'subagents', 'agent-three.jsonl'), 'custom-agent-id');

  assert.equal(first.agentId, 'agent-one');
  assert.equal(second.agentId, 'agent-two');
  assert.equal(first.sessionId, 'parent-session');
  assert.equal(first.agentId === second.agentId, false);
  assert.equal(explicit.agentId, 'custom-agent-id');
});

test('uses Claude Desktop source and clears relative cwd paths', () => {
  const root = 'C:\\Users\\example\\AppData\\Roaming\\Claude\\local-agent-mode-sessions';
  const adapter = createClaudeCodeAdapter({
    now: () => 1000,
    platform: 'darwin',
    roots: () => [root],
    desktopRoot: () => root
  });
  const session = adapter.createSession(`${root}\\conversation\\session.jsonl`);
  const line = JSON.stringify({
    type: 'assistant',
    timestamp: '2026-01-01T00:00:00Z',
    sessionId: '<redacted>',
    cwd: 'sessions/<redacted>',
    message: { content: [{ type: 'thinking', thinking: '<redacted>' }] }
  });
  const [event] = adapter.parseLine(session, line);
  assert.equal(event.source, 'claude-desktop');
  assert.equal(event.project, null);
});

function parsedSource(entrypoint, sourceConfig = {}) {
  const adapter = createClaudeCodeAdapter({ now: () => 1000, roots: () => [] });
  const session = adapter.createSession(join('Users', 'person', '.claude', 'projects', 'session.jsonl'), null, sourceConfig);
  const row = {
    type: 'assistant',
    timestamp: '2026-01-01T00:00:00Z',
    message: { content: [{ type: 'text', text: '<redacted>' }] }
  };
  if (entrypoint !== undefined) row.entrypoint = entrypoint;
  const events = adapter.parseLine(session, JSON.stringify(row));
  assert.equal(JSON.stringify(events).includes('entrypoint'), false);
  return events[0]?.source;
}

test('entrypoint claude-desktop selects Claude Desktop source', () => {
  assert.equal(parsedSource('claude-desktop'), 'claude-desktop');
});

test('CLI entrypoint selects Claude Code source', () => {
  assert.equal(parsedSource('cli'), 'claude-code');
});

test('missing entrypoint keeps the Claude Code default source', () => {
  assert.equal(parsedSource(undefined), 'claude-code');
});

test('forceSource overrides the entrypoint source', () => {
  assert.equal(parsedSource('claude-desktop', { forceSource: 'claude-code' }), 'claude-code');
});

test('Desktop 세션 폴더에서는 업로드·산출물과 .claude의 projects 밖을 건너뛴다', () => {
  const root = join('C:', 'appdata', 'Claude', 'local-agent-mode-sessions');
  const adapter = createClaudeCodeAdapter({ roots: () => [root], desktopRoot: () => root });
  const session = join(root, 'account', 'workspace', 'abc');
  assert.equal(adapter.descend(session), true);
  assert.equal(adapter.descend(join(session, '.claude')), true);
  assert.equal(adapter.descend(join(session, '.claude', 'projects')), true);
  assert.equal(adapter.descend(join(session, '.claude', 'skills')), false);
  assert.equal(adapter.descend(join(session, 'outputs')), false);
  assert.equal(adapter.descend(join(session, 'uploads-tmp')), false);
  assert.equal(adapter.descend(join('C:', 'home', '.claude', 'projects', 'outputs')), true);
});
