import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, win32 } from 'node:path';
import { createOpenCodeAdapter } from '../src/adapters/opencode.js';

const temporaryDirectories = [];
const NOW = 1_800_000_000_000;

test.after(async () => {
  await Promise.all(temporaryDirectories.map((directory) => rm(directory, { recursive: true, force: true })));
});

async function makeDatabase() {
  const directory = await mkdtemp(join(tmpdir(), 'agent-office-opencode-'));
  temporaryDirectories.push(directory);
  const path = join(directory, 'opencode.db');
  const database = new DatabaseSync(path);
  database.exec(`
    CREATE TABLE session (id TEXT PRIMARY KEY, project_id TEXT, parent_id TEXT, directory TEXT, title TEXT, time_created INTEGER, time_updated INTEGER);
    CREATE TABLE message (id TEXT PRIMARY KEY, session_id TEXT, time_created INTEGER, time_updated INTEGER, data TEXT);
    CREATE TABLE part (id TEXT PRIMARY KEY, message_id TEXT, session_id TEXT, time_created INTEGER, time_updated INTEGER, data TEXT);
    CREATE TABLE project (id TEXT PRIMARY KEY, worktree TEXT, name TEXT);
    CREATE INDEX message_session_time_created_id_idx ON message(session_id, time_created, id);
    CREATE INDEX part_session_idx ON part(session_id);
  `);
  const project = database.prepare('INSERT INTO project VALUES (?, ?, ?)');
  project.run('project-<redacted>', '/redacted/work/<redacted>', '<redacted>');
  const session = database.prepare('INSERT INTO session VALUES (?, ?, ?, ?, ?, ?, ?)');
  session.run('parent-<redacted>', 'project-<redacted>', null, '<redacted>', '<redacted>', NOW - 5000, NOW - 2000);
  session.run('child-<redacted>', 'project-<redacted>', 'parent-<redacted>', '<redacted>', '<redacted>', NOW - 1000, NOW - 1000);
  session.run('stale-<redacted>', 'project-<redacted>', null, '<redacted>', '<redacted>', NOW - 8_000_000, NOW - 8_000_000);
  const message = database.prepare('INSERT INTO message VALUES (?, ?, ?, ?, ?)');
  message.run('message-<redacted>', 'parent-<redacted>', NOW - 1900, NOW - 1900, JSON.stringify({ role: 'user' }));
  message.run('message-assistant-<redacted>', 'parent-<redacted>', NOW - 1450, NOW - 1450,
    JSON.stringify({ role: 'assistant', time: { completed: NOW - 1450 } }));
  message.run('message-child-<redacted>', 'child-<redacted>', NOW - 900, NOW - 900, JSON.stringify({ role: 'user' }));
  const part = database.prepare('INSERT INTO part VALUES (?, ?, ?, ?, ?, ?)');
  part.run('part-reasoning-<redacted>', 'message-<redacted>', 'parent-<redacted>', NOW - 1800, NOW - 1800, JSON.stringify({ type: 'reasoning' }));
  part.run('part-text-<redacted>', 'message-<redacted>', 'parent-<redacted>', NOW - 1750, NOW - 1750, JSON.stringify({ type: 'text' }));
  part.run('part-tool-running-<redacted>', 'message-<redacted>', 'parent-<redacted>', NOW - 1700, NOW - 1700, JSON.stringify({ type: 'tool', tool: 'bash', state: { status: 'running' } }));
  part.run('part-tool-done-<redacted>', 'message-<redacted>', 'parent-<redacted>', NOW - 1600, NOW - 1600, JSON.stringify({ type: 'tool', tool: 'bash', state: { status: 'completed' } }));
  part.run('part-tool-error-<redacted>', 'message-<redacted>', 'parent-<redacted>', NOW - 1500, NOW - 1500, JSON.stringify({ type: 'tool', tool: 'websearch', state: { status: 'error' } }));
  part.run('part-step-finish-<redacted>', 'message-<redacted>', 'parent-<redacted>', NOW - 1450, NOW - 1450, JSON.stringify({ type: 'step-finish' }));
  part.run('part-task-<redacted>', 'message-<redacted>', 'parent-<redacted>', NOW - 1400, NOW - 1400, JSON.stringify({ type: 'tool', tool: 'task', state: { status: 'running' } }));
  part.run('part-task-done-<redacted>', 'message-<redacted>', 'parent-<redacted>', NOW - 1200, NOW - 1200, JSON.stringify({ type: 'tool', tool: 'task', state: { status: 'completed' } }));
  database.close();
  return { path, directory };
}

function tableReferences(sql) {
  return [...sql.matchAll(/\b(?:FROM|JOIN|UPDATE|INTO|DELETE\s+FROM)\s+([a-z_]+)/giu)]
    .map((match) => match[1].toLowerCase()).filter((table) => table !== 'path_parts');
}

test('OpenCode database path follows XDG and accepts a selected database or folder', () => {
  const adapter = createOpenCodeAdapter({ platform: 'win32', home: 'C:\\Users\\person', env: { XDG_DATA_HOME: 'C:\\data' }, now: () => NOW });
  assert.equal(adapter.configuredDatabasePath(), win32.join('C:\\data', 'opencode', 'opencode.db'));
  assert.equal(adapter.configuredDatabasePath({ path: 'C:\\logs\\custom.db' }), 'C:\\logs\\custom.db');
  assert.equal(adapter.configuredDatabasePath({ path: 'C:\\logs\\opencode' }), win32.join('C:\\logs\\opencode', 'opencode.db'));
  const windows = createOpenCodeAdapter({ platform: 'win32', home: 'C:\\Users\\person', env: {}, now: () => NOW });
  assert.equal(windows.configuredDatabasePath(), win32.join('C:\\Users\\person', '.local', 'share', 'opencode', 'opencode.db'));
});

test('maps only safe OpenCode structure into session, turn, thinking, tool, and child events', async () => {
  const { path } = await makeDatabase();
  const statements = [];
  const adapter = createOpenCodeAdapter({ now: () => NOW, databasePath: path,
    databaseFactory: (file, options) => {
      assert.deepEqual(options, { readOnly: true });
      const native = new DatabaseSync(file, options);
      assert.throws(() => native.exec('CREATE TABLE readonly_probe (id INTEGER)'), /readonly/iu);
      return {
        prepare(sql) { statements.push(sql); return native.prepare(sql); },
        close() { native.close(); }
      };
    } });
  const events = adapter.poll();

  assert.deepEqual(events.filter((event) => event.agentId === 'parent-<redacted>').map((event) => event.kind), [
    'session_start', 'turn_start', 'thinking', 'message', 'tool_start', 'tool_end', 'tool_end', 'turn_end', 'turn_end', 'spawn', 'despawn'
  ]);
  const childStart = events.find((event) => event.agentId === 'child-<redacted>' && event.kind === 'session_start');
  assert.equal(childStart.parentAgentId, 'parent-<redacted>');
  assert.equal(events.find((event) => event.kind === 'session_start').project, '<redacted>');
  assert.equal(events.find((event) => event.kind === 'session_start').title, null);
  assert.equal(events.find((event) => event.kind === 'tool_start').room, 'server');
  assert.equal(events.find((event) => event.kind === 'tool_end').exitCode, 0);
  const failedTool = events.find((event) => event.tool === 'websearch');
  assert.equal(failedTool.exitCode, 1);
  assert.equal(failedTool.room, 'search');
  assert.equal(events.find((event) => event.kind === 'spawn').tool, 'task');
  assert.equal(events.every((event) => event.source === 'opencode'), true);
  assert.equal(events.every((event) => event.title === null), true);
  assert.equal(JSON.stringify(events).includes('/redacted/work/'), false);
  assert.equal(events.some((event) => event.sessionId === 'stale-<redacted>'), false);
  const referencedTables = new Set(statements.flatMap(tableReferences));
  assert.deepEqual([...referencedTables].sort(), ['message', 'part', 'project', 'session']);
  assert.equal(statements.some((sql) => /\b(account|credential|control_account)\b/iu.test(sql)), false);
  assert.equal(statements.some((sql) => /\$\.(?:text|input|output|reasoning)/iu.test(sql)), false);
  assert.equal(statements.some((sql) => /SELECT\s+(?:[\w.]+\s*,\s*)*data\s*(?:,|FROM)/iu.test(sql)), false);
  assert.equal(statements.filter((sql) => /\bFROM\s+(?:message|part|session)\b/iu.test(sql))
    .every((sql) => /\bLIMIT\b/iu.test(sql)), true);
});

test('poll reads only rows after each (time_updated, id) cursor', async () => {
  const { path } = await makeDatabase();
  const adapter = createOpenCodeAdapter({ now: () => NOW, databasePath: path });
  adapter.poll();
  const database = new DatabaseSync(path);
  database.prepare('UPDATE session SET time_updated = ? WHERE id = ?').run(NOW + 20, 'parent-<redacted>');
  const insert = database.prepare('INSERT INTO part VALUES (?, ?, ?, ?, ?, ?)');
  const tools = [
    ['read', 'library'], ['glob', 'library'], ['grep', 'library'],
    ['edit', 'dev'], ['write', 'dev'], ['patch', 'dev'],
    ['webfetch', 'search'], ['websearch', 'search'], ['unknown-tool', 'desk']
  ];
  tools.forEach(([tool], index) => insert.run(
    `part-new-<redacted>-${index}`, 'message-<redacted>', 'parent-<redacted>', NOW + index, NOW + index,
    JSON.stringify({ type: 'tool', tool, state: { status: 'running' } })
  ));
  database.close();
  const events = adapter.poll();
  assert.deepEqual(events.map((event) => event.kind), tools.map(() => 'tool_start'));
  assert.deepEqual(events.map((event) => event.room), tools.map(([, room]) => room));
  // 알 수 없는 도구 이름(MCP 서버 이름 등)은 이벤트에 그대로 싣지 않고 mcp로 줄인다
  assert.equal(events.at(-1).tool, 'mcp');
  assert.equal(JSON.stringify(events).includes('unknown-tool'), false);
});

test('database open and schema failures return empty results and expose counts only', () => {
  const adapter = createOpenCodeAdapter({ databasePath: '/unavailable/opencode.db', now: () => NOW });
  assert.doesNotThrow(() => assert.deepEqual(adapter.poll(), []));
  assert.deepEqual(adapter.diagnostics(), { ignoredCount: 0, unknownCount: 0, databaseErrorCount: 1 });
  assert.deepEqual(adapter.connectivity(), { recent: false, lastEventAt: null });
  const locked = createOpenCodeAdapter({ now: () => NOW, databaseFactory: () => { throw new Error('database is locked'); } });
  assert.deepEqual(locked.poll(), []);
  assert.deepEqual(locked.diagnostics(), { ignoredCount: 0, unknownCount: 0, databaseErrorCount: 1 });
  assert.doesNotThrow(() => locked.parseLine({ sessionId: '<redacted>' }, '<redacted>'));
});

test('schema drift is handled as an empty poll with a numeric database error count', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'agent-office-opencode-schema-'));
  temporaryDirectories.push(directory);
  const path = join(directory, 'opencode.db');
  const database = new DatabaseSync(path);
  database.close();
  const adapter = createOpenCodeAdapter({ databasePath: path, now: () => NOW });
  assert.deepEqual(adapter.poll(), []);
  assert.deepEqual(adapter.diagnostics(), { ignoredCount: 0, unknownCount: 0, databaseErrorCount: 1 });
});
