import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdir, mkdtemp, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { loadAdapters } from '../src/adapters/index.js';
import antigravityAdapter, { createAntigravityAdapter } from '../src/adapters/antigravity.js';
import { validateEvent } from '../src/core/events.js';

const directories = [];

test.after(async () => {
  await Promise.all(directories.map((directory) => rm(directory, { recursive: true, force: true })));
});

async function makeHome() {
  const home = await mkdtemp(join(tmpdir(), 'agent-office-antigravity-'));
  directories.push(home);
  return home;
}

function createSummaryDatabase(home, rows = []) {
  const databasePath = join(home, '.gemini', 'antigravity', 'conversation_summaries.db');
  const database = new DatabaseSync(databasePath);
  database.exec(`CREATE TABLE conversation_summaries (
    conversation_id TEXT,
    workspace_uris TEXT,
    status TEXT
  )`);
  const insert = database.prepare('INSERT INTO conversation_summaries VALUES (?, ?, ?)');
  for (const row of rows) {
    insert.run(row.conversationId, row.workspaceUris, row.status);
  }
  database.close();
  return databasePath;
}

test('adapter index discovers Antigravity alongside Claude adapters', async () => {
  const adapters = await loadAdapters();
  assert.deepEqual(adapters.map((adapter) => adapter.id), ['antigravity', 'claude-code', 'codex', 'cowork']);
});

test('parses multiple tool calls in FIFO order and ignores their raw values', async () => {
  const fixture = new URL('./fixtures/antigravity/multiple-tool-calls.jsonl', import.meta.url);
  const lines = (await readFile(fixture, 'utf8')).trim().split('\n');
  const adapter = createAntigravityAdapter({ home: 'C:\\redacted-home', now: () => 1000 });
  const session = adapter.createSession('C:\\redacted-home\\.gemini\\antigravity\\brain\\conversation\\.system_generated\\logs\\transcript.jsonl');
  const events = lines.flatMap((line) => adapter.parseLine(session, line));

  assert.deepEqual(events.map((event) => event.kind), [
    'session_start', 'turn_start', 'tool_start', 'tool_start', 'tool_end', 'tool_end', 'message', 'turn_end'
  ]);
  assert.deepEqual(events.slice(2, 6).map((event) => event.tool), [
    'read_file', 'run_command', 'read_file', 'run_command'
  ]);
  assert.equal(events[2].room, 'library');
  assert.equal(events[3].room, 'server');
  assert.equal(events.every(validateEvent), true);
  assert.equal(JSON.stringify(events).includes('Command exited'), false);
  assert.equal(session.queue.length, 0);
});

test('maps command exit status and source fields without keeping output text', () => {
  const adapter = createAntigravityAdapter({ home: 'C:\\redacted-home', now: () => 1000 });
  const session = adapter.createSession('C:\\redacted-home\\.gemini\\antigravity\\brain\\conversation\\.system_generated\\logs\\transcript.jsonl');
  adapter.parseLine(session, JSON.stringify({
    type: 'PLANNER_RESPONSE',
    source: 'MODEL',
    created_at: '2026-01-01T00:00:00Z',
    tool_calls: [{ name: 'run_command', args: { CommandLine: 'rg <redacted>' } }]
  }));
  const [event] = adapter.parseLine(session, JSON.stringify({
    type: 'GENERIC',
    source: 'SYSTEM',
    created_at: '2026-01-01T00:00:01Z',
    content: 'Command exited with code 7'
  }));
  assert.equal(event.kind, 'tool_end');
  assert.equal(event.exitCode, 7);
  assert.equal(event.room, 'library');
  assert.equal(JSON.stringify(event).includes('Command exited'), false);
});

test('reads summary metadata read-only and starts from the transcript, ending when its lock disappears', async () => {
  const home = await makeHome();
  const conversationId = 'conversation-redacted';
  const workspaceUris = JSON.stringify(['file:///C:/Workspace/Agent%20Office']);
  await mkdir(join(home, '.gemini', 'antigravity'), { recursive: true });
  const databasePath = createSummaryDatabase(home, [{ conversationId, workspaceUris, status: 'RUNNING' }]);
  const brainDirectory = join(home, '.gemini', 'antigravity', 'brain', conversationId, '.system_generated', 'logs');
  const presenceDirectory = join(home, '.gemini', 'antigravity', 'presence');
  await mkdir(brainDirectory, { recursive: true });
  await mkdir(presenceDirectory, { recursive: true });
  const transcriptPath = join(brainDirectory, 'transcript.jsonl');
  await writeFile(transcriptPath, '');
  const lockPath = join(presenceDirectory, `${conversationId}.lock`);
  await writeFile(lockPath, '');

  let now = 1000;
  let readonlyRequested = false;
  const adapter = createAntigravityAdapter({
    home,
    now: () => now,
    databaseFactory(path) {
      assert.equal(path, databasePath);
      readonlyRequested = true;
      return new DatabaseSync(path, { readOnly: true });
    }
  });
  const starts = await adapter.poll();
  assert.equal(readonlyRequested, true);
  assert.deepEqual(starts, []);
  const session = adapter.createSession(transcriptPath);
  const [sessionStart, turnStart] = adapter.parseLine(session, JSON.stringify({
    type: 'USER_INPUT',
    created_at: '2026-01-01T00:00:00Z'
  }));
  assert.equal(sessionStart.kind, 'session_start');
  assert.equal(sessionStart.project, 'c:/Workspace/Agent Office');
  assert.equal(turnStart.kind, 'turn_start');
  assert.deepEqual(adapter.parseLine(session, JSON.stringify({
    type: 'USER_INPUT',
    created_at: '2026-01-01T00:00:01Z'
  })).map((event) => event.kind), ['turn_start']);
  assert.equal(adapter.match(transcriptPath), true);
  assert.equal(adapter.match(transcriptPath.replace('transcript.jsonl', 'transcript_full.jsonl')), false);
  assert.equal(adapter.match(join(dirname(brainDirectory), 'steps', 'step.jsonl')), false);

  now += 1000;
  await unlink(lockPath);
  const ends = await adapter.poll();
  assert.equal(ends.length, 1);
  assert.equal(ends[0].kind, 'session_end');
  assert.equal(ends[0].sessionId, conversationId);
});

test('clears stale FIFO calls when a new user turn begins', () => {
  const adapter = createAntigravityAdapter({ home: 'C:\\redacted-home', now: () => 1000 });
  const session = adapter.createSession('C:\\redacted-home\\.gemini\\antigravity\\brain\\conversation\\.system_generated\\logs\\transcript.jsonl');
  adapter.parseLine(session, JSON.stringify({
    type: 'PLANNER_RESPONSE',
    created_at: 1,
    tool_calls: [{ name: 'read_file', args: { Path: '<redacted>' } }]
  }));
  adapter.parseLine(session, JSON.stringify({ type: 'USER_INPUT', created_at: 2 }));
  assert.equal(session.queue.length, 0);
  assert.deepEqual(adapter.parseLine(session, JSON.stringify({
    type: 'GENERIC',
    created_at: 3,
    content: 'Command exited with code 0'
  })), []);
  adapter.parseLine(session, JSON.stringify({
    type: 'PLANNER_RESPONSE',
    created_at: 4,
    tool_calls: [{ name: 'run_command', args: { CommandLine: 'git <redacted>' } }]
  }));
  const [ended] = adapter.parseLine(session, JSON.stringify({
    type: 'GENERIC',
    created_at: 5,
    content: 'Command exited with code 0'
  }));
  assert.equal(ended.tool, 'run_command');
});

test('keeps FIFO calls when a new planner response arrives', () => {
  const adapter = createAntigravityAdapter({ home: 'C:\\redacted-home', now: () => 1000 });
  const session = adapter.createSession('C:\\redacted-home\\.gemini\\antigravity\\brain\\conversation\\.system_generated\\logs\\transcript.jsonl');
  adapter.parseLine(session, JSON.stringify({
    type: 'PLANNER_RESPONSE',
    created_at: 1,
    tool_calls: [
      { name: 'read_file', args: { Path: '<redacted>' } },
      { name: 'run_command', args: { CommandLine: 'git <redacted>' } }
    ]
  }));
  const events = adapter.parseLine(session, JSON.stringify({
    type: 'PLANNER_RESPONSE',
    created_at: 2,
    tool_calls: [{ name: 'view_file', args: { AbsolutePath: '<redacted>' } }]
  }));

  assert.deepEqual(events.map((event) => event.kind), ['tool_start']);
  assert.equal(session.queue.length, 3);
  const [firstEnd] = adapter.parseLine(session, JSON.stringify({
    type: 'GENERIC', created_at: 3, content: '<redacted>'
  }));
  assert.equal(firstEnd.tool, 'read_file');
  assert.equal(session.queue.length, 2);
});

test('emits git only for a successful queued git command without exposing the command', () => {
  for (const [exitCode, expectedGit] of [[0, 'commit'], [1, undefined]]) {
    const adapter = createAntigravityAdapter({ home: 'C:\\redacted-home', now: () => 1000 });
    const session = adapter.createSession('C:\\redacted-home\\.gemini\\antigravity\\brain\\conversation\\.system_generated\\logs\\transcript.jsonl');
    adapter.parseLine(session, JSON.stringify({
      type: 'PLANNER_RESPONSE', created_at: 1,
      tool_calls: [{ name: 'run_command', args: { CommandLine: 'git commit -m <redacted>' } }]
    }));
    const events = adapter.parseLine(session, JSON.stringify({
      type: 'GENERIC', created_at: 2, content: `Command exited with code ${exitCode}`
    }));
    const gitEvent = events.find((event) => event.kind === 'git');
    assert.equal(gitEvent?.git?.action, expectedGit);
    assert.equal(JSON.stringify(events).includes('git commit'), false);
  }
});

test('missing or invalid summary databases do not break polling', async () => {
  const adapter = createAntigravityAdapter({ home: await makeHome(), now: () => 1000 });
  assert.deepEqual(await adapter.poll(), []);
});

test('refreshes summary metadata at ten-second intervals without waiting', async () => {
  const home = await makeHome();
  let now = 1000;
  let opens = 0;
  const adapter = createAntigravityAdapter({
    home,
    now: () => now,
    databaseFactory() {
      opens += 1;
      throw new Error('database unavailable');
    },
    readDirectory: async () => []
  });

  await adapter.poll();
  now = 10999;
  await adapter.poll();
  assert.equal(opens, 1);
  now = 11000;
  await adapter.poll();
  assert.equal(opens, 2);
});

test('brain 폴더에서는 transcript가 있는 logs까지만 내려간다', () => {
  const home = join('C:', 'home');
  const adapter = createAntigravityAdapter({ home });
  const brain = join(home, '.gemini', 'antigravity', 'brain');
  const session = join(brain, 'conversation');
  assert.equal(adapter.descend(session), true);
  assert.equal(adapter.descend(join(session, '.system_generated')), true);
  assert.equal(adapter.descend(join(session, '.system_generated', 'logs')), true);
  assert.equal(adapter.descend(join(session, '.system_generated', 'steps')), false);
  assert.equal(adapter.descend(join(session, '.system_generated', 'logs', 'nested')), false);
  assert.equal(adapter.descend(join(session, 'scratch')), false);
  assert.equal(adapter.descend(join(session, '.user_uploaded')), false);
});
