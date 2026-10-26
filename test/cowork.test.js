import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { createCoworkAdapter, inboxRoot } from '../src/adapters/cowork.js';

const root = join('C:', 'inbox');
const adapter = createCoworkAdapter({ roots: () => [root], now: () => 1000 });

function parse(row) {
  const session = adapter.createSession(join(root, 'demo.jsonl'));
  return { session, events: adapter.parseLine(session, typeof row === 'string' ? row : JSON.stringify(row)) };
}

test('인박스 줄을 cowork 이벤트로 바꾼다', () => {
  const { events } = parse({ v: 1, ts: 5, kind: 'tool_start', tool: 'Edit' });
  assert.equal(events.length, 1);
  assert.equal(events[0].source, 'cowork');
  assert.equal(events[0].sessionId, 'cowork-demo');
  assert.equal(events[0].room, 'dev');
  assert.equal(events[0].tool, 'Edit');
  assert.equal(events[0].ts, 5);
});

test('도구 이름 말고는 아무 값도 옮기지 않는다', () => {
  const { events } = parse({ v: 1, ts: 5, kind: 'tool_start', tool: 'Bash', detail: 'rm -rf secret', prompt: '비밀' });
  assert.equal(events[0].detail, null);
  assert.equal(events[0].room, 'server');
  assert.ok(!JSON.stringify(events).includes('secret'));
  assert.ok(!JSON.stringify(events).includes('비밀'));
});

test('MCP 도구는 서버 이름을 숨기고 검색실로 보낸다', () => {
  const { events } = parse({ v: 1, kind: 'tool_start', tool: 'mcp__example__tool' });
  assert.equal(events[0].tool, 'mcp');
  assert.equal(events[0].room, 'search');
  assert.equal(events[0].ts, 1000);
});

test('생각 중은 회의실, 세션 시작·끝은 엘리베이터', () => {
  assert.equal(parse({ v: 1, kind: 'thinking' }).events[0].room, 'meeting');
  assert.equal(parse({ v: 1, kind: 'session_start' }).events[0].room, 'elevator');
  assert.equal(parse({ v: 1, kind: 'session_end' }).events[0].room, 'elevator');
});

test('모르는 형식은 throw 없이 빈 배열', () => {
  for (const line of ['', '{', 'null', '[]', '{"v":2,"kind":"thinking"}', '{"v":1,"kind":"git"}', '{"v":1,"kind":"tool_start","tool":"a b"}']) {
    const { session, events } = parse(line);
    if (line.includes('a b')) {
      assert.equal(events[0].tool, null);
      continue;
    }
    assert.deepEqual(events, []);
    assert.equal(session.unknownCount, 1);
  }
});

test('인박스 바로 아래 jsonl만 받는다', () => {
  assert.ok(adapter.match(join(root, 'cowork-1.jsonl')));
  assert.ok(!adapter.match(join(root, 'sub', 'a.jsonl')));
  assert.ok(!adapter.match(join(root, 'a.txt')));
  assert.ok(!adapter.match(join('C:', 'other', 'a.jsonl')));
});

test('인박스 위치는 환경 변수, LOCALAPPDATA, 홈 순서로 정한다', () => {
  assert.equal(inboxRoot({ AGENT_OFFICE_INBOX: 'X' }), 'X');
  assert.equal(inboxRoot({ LOCALAPPDATA: 'L' }), join('L', 'AgentOffice', 'inbox'));
  assert.match(inboxRoot({}), /\.agent-office/);
});

test('실행 중에 새로 생긴 인박스 파일도 첫 줄부터 읽는다', async () => {
  const { mkdtemp, writeFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { createScanner } = await import('../src/lib/scanner.js');
  const dir = await mkdtemp(join(tmpdir(), 'inbox-'));
  const local = createCoworkAdapter({ roots: () => [dir] });
  const seen = [];
  const scanner = createScanner({ adapters: [local], onEvent: (event) => seen.push(event.kind),
    setIntervalFn: () => 1, clearIntervalFn: () => {} });
  await scanner.start();
  await writeFile(join(dir, 'late.jsonl'), '{"v":1,"kind":"session_start"}\n{"v":1,"kind":"tool_start","tool":"Edit"}\n');
  await scanner.discover();
  await scanner.pollOnce();
  assert.deepEqual(seen, ['session_start', 'tool_start']);
});
