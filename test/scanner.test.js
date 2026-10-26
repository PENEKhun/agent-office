import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile, appendFile, utimes, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { createScanner } from '../src/lib/scanner.js';

test('restores recent lines, tails appended data, and honors source settings', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'agent-office-scanner-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const filePath = join(directory, 'sample.jsonl');
  await writeFile(filePath, 'restore-1\nrestore-2\n');

  const events = [];
  const cleared = [];
  const delays = [];
  const adapter = {
    id: 'sample',
    roots: () => [],
    match: (path) => path.endsWith('.jsonl'),
    createSession: (path) => ({ path, ignoredCount: 1, unknownCount: 1 }),
    parseLine: (_session, line) => [line]
  };
  let nextTimer = 0;
  const scanner = createScanner({
    adapters: [adapter],
    sources: { sample: { enabled: true, path: directory } },
    now: () => Date.now(),
    onEvent: (event, metadata) => events.push({ event, metadata }),
    setIntervalFn: (_callback, delay) => {
      delays.push(delay);
      return { id: ++nextTimer, delay };
    },
    clearIntervalFn: (timer) => cleared.push(timer.id)
  });

  await scanner.start();
  assert.deepEqual(delays, [1000, 5000]);
  assert.deepEqual(events.map((entry) => entry.event), ['restore-1', 'restore-2']);
  assert.equal(events.every((entry) => entry.metadata.restored), true);
  assert.deepEqual((({ scan, ...rest }) => rest)(scanner.diagnostics()), {
    watchedFilesBySource: { sample: 1 },
    ignoredCountBySource: { sample: 1 },
    unknownCountBySource: { sample: 1 }
  });
  await appendFile(filePath, 'live-1\n');
  await scanner.pollOnce();
  assert.equal(events.at(-1).event, 'live-1');
  assert.equal(events.at(-1).metadata.restored, false);
  scanner.stop();
  assert.deepEqual(cleared, [1, 2]);
});

test('configured roots add to defaults and root folder stats stay cached across rescans', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'agent-office-root-default-'));
  const extra = await mkdtemp(join(tmpdir(), 'agent-office-root-extra-'));
  context.after(async () => {
    await rm(root, { recursive: true, force: true });
    await rm(extra, { recursive: true, force: true });
  });
  await writeFile(join(root, 'default.jsonl'), 'default\n');
  await writeFile(join(extra, 'extra.jsonl'), 'extra\n');
  const rootStats = new Map();
  const scanner = createScanner({
    adapters: [{
      id: 'sample', roots: () => [root], match: (path) => path.endsWith('.jsonl'),
      createSession: () => ({ source: 'sample' }), parseLine: (_session, line) => [{ kind: line }]
    }],
    sources: { sample: { path: extra } },
    statFile: async (path) => {
      const info = await stat(path);
      if (info.isDirectory()) rootStats.set(path, (rootStats.get(path) ?? 0) + 1);
      return info;
    },
    setIntervalFn: () => 1,
    clearIntervalFn: () => {}
  });

  await scanner.start();
  assert.equal(scanner.knownFiles.size, 2);
  assert.deepEqual(scanner.connectivity().sample, { folder: true, recent: true });
  await scanner.discover();
  await scanner.discover();
  assert.equal(rootStats.get(root), 1);
  assert.equal(rootStats.get(extra), 1);
  scanner.stop();
});

test('primes Codex project from the first line even when restoring only the last MiB', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'agent-office-prime-session-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const filePath = join(directory, 'rollout-123e4567-e89b-12d3-a456-426614174000.jsonl');
  const sessionMeta = JSON.stringify({
    type: 'session_meta',
    payload: { id: 'different-redacted-id', cwd: 'C:\\Workspace\\Project' }
  });
  const largeLine = `${JSON.stringify({ type: 'entry', value: 'x'.repeat(20000) })}\n`;
  await writeFile(filePath, `${sessionMeta}\n${largeLine.repeat(110)}`);
  assert.ok((await stat(filePath)).size > 2 * 1024 * 1024);

  const events = [];
  const adapter = {
    id: 'codex-prime',
    roots: () => [],
    match: (path) => path.endsWith('.jsonl'),
    createSession: () => ({ project: null }),
    primeSession(session, firstLine) {
      session.project = JSON.parse(firstLine).payload.cwd.replaceAll('\\', '/').replace(/^([A-Z]):/, (_, drive) => `${drive.toLowerCase()}:`);
    },
    parseLine: (session) => [{ kind: 'restored-line', project: session.project }]
  };
  const scanner = createScanner({
    adapters: [adapter],
    sources: { 'codex-prime': { path: directory } },
    onEvent: (event, metadata) => events.push({ event, metadata }),
    setIntervalFn: () => 1,
    clearIntervalFn: () => {}
  });

  await scanner.start();
  assert.ok(events.length > 0);
  assert.equal(events.every(({ event, metadata }) =>
    event.project === 'c:/Workspace/Project' && metadata.restored === true), true);
  scanner.stop();
});

test('does not scan disabled sources', async () => {
  const events = [];
  const adapter = {
    id: 'sample',
    roots: () => { throw new Error('disabled adapter scanned'); },
    match: () => false,
    createSession: () => ({}),
    parseLine: () => []
  };
  const scanner = createScanner({
    adapters: [adapter],
    sources: { sample: { enabled: false } },
    onEvent: (event) => events.push(event),
    setIntervalFn: () => 1,
    clearIntervalFn: () => {}
  });
  await scanner.start();
  scanner.stop();
  assert.deepEqual(events, []);
});

test('newly discovered session files emit from offset zero as live events', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'agent-office-new-session-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const events = [];
  const adapter = {
    id: 'sample',
    roots: () => [],
    match: (path) => path.endsWith('.jsonl'),
    createSession: (path) => ({ path }),
    parseLine: (_session, line) => [{ kind: line }]
  };
  const scanner = createScanner({
    adapters: [adapter],
    sources: { sample: { path: directory } },
    now: Date.now,
    onEvent: (event, metadata) => events.push({ event, metadata }),
    setIntervalFn: () => 1,
    clearIntervalFn: () => {}
  });

  await scanner.start();
  const filePath = join(directory, 'new-session.jsonl');
  await writeFile(filePath, 'session_start\n');
  await scanner.discover();
  await scanner.pollOnce();

  assert.deepEqual(events, [{ event: { kind: 'session_start' }, metadata: { restored: false } }]);
  scanner.stop();
});

test('keeps stale files skipped until their modification time changes', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'agent-office-stale-session-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const filePath = join(directory, 'stale-session.jsonl');
  await writeFile(filePath, 'session_start\n');
  const now = Date.now();
  const oldTime = new Date(now - 4 * 60 * 60 * 1000);
  await utimes(filePath, oldTime, oldTime);
  const events = [];
  const adapter = {
    id: 'sample',
    roots: () => [],
    match: (path) => path.endsWith('.jsonl'),
    createSession: (path) => ({ path }),
    parseLine: (_session, line) => [{ kind: line }]
  };
  const scanner = createScanner({
    adapters: [adapter],
    sources: { sample: { path: directory } },
    now: () => now,
    onEvent: (event, metadata) => events.push({ event, metadata }),
    setIntervalFn: () => 1,
    clearIntervalFn: () => {}
  });

  await scanner.start();
  await scanner.discover();
  assert.equal(scanner.skippedFiles.has(filePath), true);
  assert.equal(scanner.knownFiles.has(filePath), false);
  const recentTime = new Date(now);
  await utimes(filePath, recentTime, recentTime);
  await scanner.discover();
  assert.deepEqual(events, [{ event: { kind: 'session_start' }, metadata: { restored: true } }]);
  await appendFile(filePath, 'new-session_start\n');
  await scanner.pollOnce();

  assert.deepEqual(events, [
    { event: { kind: 'session_start' }, metadata: { restored: true } },
    { event: { kind: 'new-session_start' }, metadata: { restored: false } }
  ]);
  scanner.stop();
});

test('polls adapter-level sources during startup and later cycles', async () => {
  const events = [];
  let polls = 0;
  const adapter = {
    id: 'poll-source',
    roots: () => [],
    match: () => false,
    createSession: () => ({}),
    parseLine: () => [],
    poll: async () => [{ kind: `event-${++polls}` }]
  };
  const scanner = createScanner({
    adapters: [adapter],
    onEvent: (event, metadata) => events.push({ event, metadata }),
    setIntervalFn: () => 1,
    clearIntervalFn: () => {}
  });

  await scanner.start();
  await scanner.pollOnce();
  assert.deepEqual(events, [
    { event: { kind: 'event-1' }, metadata: { restored: true } },
    { event: { kind: 'event-2' }, metadata: { restored: false } }
  ]);
  scanner.stop();
});

test('멈춘 네트워크 경로가 있어도 로컬 출처 발견과 폴링은 진행된다', async () => {
  const { mkdtemp, writeFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = await mkdtemp(join(tmpdir(), 'lane-'));
  await writeFile(join(dir, 'a.jsonl'), 'x\n');
  const stuck = { id: 'stuck', roots: () => ['\\\\wsl.localhost\\never'], match: () => true, createSession: () => ({}), parseLine: () => [] };
  const local = { id: 'local', roots: () => [dir], match: () => true, createSession: () => ({ source: 'local' }), parseLine: () => [] };
  const timers = [];
  const scanner = createScanner({ adapters: [stuck, local], setIntervalFn: (fn) => { timers.push(fn); return timers.length; }, clearIntervalFn: () => {},
    statFile: async (path) => path.startsWith('\\\\') ? new Promise(() => {}) : { mtimeMs: Date.now() } });
  await scanner.start();
  assert.equal(timers.length, 2);
  assert.equal(scanner.diagnostics().watchedFilesBySource.local, 1);
});

test('어댑터가 descend로 거른 폴더는 내려가지 않는다', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'agent-office-descend-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(join(directory, 'keep'), { recursive: true });
  await mkdir(join(directory, 'skip', 'deep'), { recursive: true });
  await writeFile(join(directory, 'keep', 'a.jsonl'), 'kept\n');
  await writeFile(join(directory, 'skip', 'deep', 'b.jsonl'), 'skipped\n');

  const visited = [];
  const events = [];
  const scanner = createScanner({
    adapters: [{
      id: 'sample',
      roots: () => [directory],
      match: (path) => path.endsWith('.jsonl'),
      descend: (path) => { visited.push(basename(path)); return basename(path) !== 'skip'; },
      createSession: (path) => ({ path }),
      parseLine: (_session, line) => [line]
    }],
    onEvent: (event) => events.push(event)
  });

  await scanner.discover({ initial: true, remote: false });
  assert.deepEqual(events, ['kept']);
  assert.equal(visited.includes('deep'), false);
});

test('descend가 throw 해도 폴더를 건너뛰지 않는다', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'agent-office-descend-throw-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(join(directory, 'nested'));
  await writeFile(join(directory, 'nested', 'a.jsonl'), 'line\n');

  const events = [];
  const scanner = createScanner({
    adapters: [{
      id: 'sample',
      roots: () => [directory],
      match: (path) => path.endsWith('.jsonl'),
      descend: () => { throw new Error('boom'); },
      createSession: (path) => ({ path }),
      parseLine: (_session, line) => [line]
    }],
    onEvent: (event) => events.push(event)
  });

  await scanner.discover({ initial: true, remote: false });
  assert.deepEqual(events, ['line']);
});
