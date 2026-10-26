import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { findBrowser } from './lib/browser.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const pages = ['/', '/widget', '/mini'];
const theme = process.argv.find((argument) => argument.startsWith('--theme='))?.slice('--theme='.length) ?? 'office';
const timingEnabled = process.argv.includes('--timing');
const timeoutMs = 20_000;
const failures = [];
const processes = [];
let profile = null;

function timing(label, startedAt) {
  if (timingEnabled) console.log(`TIME ${label}: ${(performance.now() - startedAt).toFixed(0)}ms`);
}

async function availablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitFor(check, description) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await check();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`${description} 제한 시간 초과`);
}

function connectCdp(url) {
  const socket = new WebSocket(url);
  let nextId = 0;
  const pending = new Map();
  const events = [];
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    } else if (message.method) events.push(message);
  });
  const opened = new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', () => reject(new Error('브라우저 디버그 연결 실패')), { once: true });
  });
  return {
    async ready() { await opened; },
    send(method, params = {}) {
      const id = ++nextId;
      socket.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    },
    events,
    close() { socket.close(); }
  };
}

async function inspectPage(base, route, isMini) {
  const startedAt = performance.now();
  const targetResponse = await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: 'PUT' });
  if (!targetResponse.ok) throw new Error(`브라우저 탭 생성 실패 (${targetResponse.status})`);
  const target = await targetResponse.json();
  const cdp = connectCdp(target.webSocketDebuggerUrl);
  try {
    await cdp.ready();
    await Promise.all(['Page.enable', 'Runtime.enable', 'Log.enable'].map((method) => cdp.send(method)));
    const pageUrl = new URL(route, base);
    pageUrl.searchParams.set('theme', theme);
    await cdp.send('Page.navigate', { url: pageUrl.href });
    try {
      await waitFor(async () => {
        const result = await cdp.send('Runtime.evaluate', {
          expression: isMini
            ? "document.readyState === 'complete' && !!document.querySelector('#agents') && document.querySelector('#agents').children.length > 0"
            : "document.readyState === 'complete' && !!document.querySelector('#map-host canvas')",
          returnByValue: true
        });
        return result.result?.value === true;
      }, isMini ? `${route} 미니 항목 렌더링` : `${route} Pixi 캔버스 초기화`);
    } catch (error) {
      const errors = cdp.events.filter(({ method, params }) =>
        method === 'Runtime.exceptionThrown'
        || (method === 'Runtime.consoleAPICalled' && params.type === 'error')
        || (method === 'Log.entryAdded' && params.entry.level === 'error'));
      const details = errors.map(({ params }) => params.exceptionDetails?.exception?.description
        ?? params.exceptionDetails?.text
        ?? params.args?.map((argument) => argument.value ?? argument.description).filter(Boolean).join(' ')
        ?? params.entry?.text).filter(Boolean);
      throw new Error(`${error.message}${details.length ? `: ${details.join(' | ')}` : ''}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
    const result = await cdp.send('Runtime.evaluate', {
      expression: "({title:document.title, body:document.body.innerText, canvas:!!document.querySelector('canvas')})",
      returnByValue: true
    });
    const body = result.result?.value?.body ?? '';
    if (body.includes('오피스 화면을 불러오지 못했습니다')) throw new Error('초기화 실패 문구가 표시됨');
    if (!isMini && !result.result?.value?.canvas) throw new Error('캔버스가 없음');
    if (route === '/widget') {
      // 위젯의 배경 투명도는 #widget-background가 맡는다. #map-host가 배경을 가지면 슬라이더가 듣지 않는다.
      const hostBackground = await cdp.send('Runtime.evaluate', {
        expression: "getComputedStyle(document.querySelector('#map-host')).backgroundImage",
        returnByValue: true
      });
      if (hostBackground.result?.value !== 'none') throw new Error('위젯의 #map-host에 배경이 있어 배경 투명도가 적용되지 않음');
    }
    const errors = cdp.events.filter(({ method, params }) =>
      method === 'Runtime.exceptionThrown'
      || (method === 'Runtime.consoleAPICalled' && params.type === 'error')
      || (method === 'Log.entryAdded' && params.entry.level === 'error'));
    if (errors.length) {
      throw new Error(`콘솔 오류 ${errors.length}개: ${errors.map(({ params }) =>
        params.exceptionDetails?.text ?? params.args?.[0]?.value
          ?? `${params.entry?.text ?? '브라우저 오류'}${params.entry?.url ? ` (${params.entry.url})` : ''}`).join(' | ')}`);
    }
    console.log(`PASS ${route}: ${isMini ? '미니 목록 렌더링' : '캔버스 초기화'}, 콘솔 오류 0개, 초기화 실패 문구 없음`);
    timing(`page ${route}`, startedAt);
  } finally {
    cdp.close();
    await fetch(`http://127.0.0.1:${debugPort}/json/close/${target.id}`).catch(() => {});
  }
}

let debugPort;
let serverProcess;
let browserProcess;
const totalStartedAt = performance.now();
let stageStartedAt = performance.now();
let browser;
try {
  const serverPort = await availablePort();
  debugPort = await availablePort();
  browser = findBrowser();
  if (!browser) throw new Error('헤드리스 브라우저를 찾을 수 없습니다. Chrome을 설치하거나 EDGE_PATH를 지정하세요.');
  timing('browser lookup', stageStartedAt);
  stageStartedAt = performance.now();
  profile = await mkdtemp(join(tmpdir(), 'agent-office-smoke-'));
  serverProcess = spawn(process.execPath, ['server.js', '--demo'], {
    cwd: root,
    env: { ...process.env, AGENT_OFFICE_PORT: String(serverPort) },
    stdio: 'ignore',
    windowsHide: true
  });
  processes.push(serverProcess);
  await waitFor(async () => {
    if (serverProcess.exitCode !== null) throw new Error('테스트 서버가 시작 전에 종료됨');
    try { return (await fetch(`http://127.0.0.1:${serverPort}/api/state`)).ok; } catch { return false; }
  }, '테스트 서버 시작');
  timing('server start', stageStartedAt);

  stageStartedAt = performance.now();
  browserProcess = spawn(browser, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-allow-origins=*', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, 'about:blank'
  ], { stdio: 'ignore', windowsHide: true });
  processes.push(browserProcess);
  await waitFor(async () => {
    if (browserProcess.exitCode !== null) throw new Error('헤드리스 브라우저가 시작 전에 종료됨');
    try { return (await fetch(`http://127.0.0.1:${debugPort}/json/version`)).ok; } catch { return false; }
  }, '헤드리스 브라우저 시작');
  timing('browser start', stageStartedAt);

  for (const route of pages) await inspectPage(`http://127.0.0.1:${serverPort}`, route, route === '/mini');
} catch (error) {
  failures.push(error.message);
} finally {
  const cleanupStartedAt = performance.now();
  for (const child of processes.reverse()) {
    if (child.exitCode === null) child.kill();
  }
  await Promise.all(processes.map((child) => child.exitCode !== null ? Promise.resolve() : new Promise((resolve) => {
    child.once('exit', resolve);
    const timeout = setTimeout(resolve, 2_000);
    timeout.unref();
  })));
  if (profile) await rm(profile, { recursive: true, force: true }).catch(() => {});
  timing('cleanup', cleanupStartedAt);
}

if (failures.length) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  process.exitCode = 1;
} else {
  console.log('모든 페이지 스모크 검증 통과');
}
timing('total', totalStartedAt);
