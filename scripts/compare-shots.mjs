import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer as createNetServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import { findBrowser } from './lib/browser.js';
import { baselineWarning } from './lib/compare-baseline.js';

// 사용법: --baseline은 임시 기준 이미지와 meta.json을 만든다. --compare는 이를 비교한다.
// --theme=<id>는 office, space, restaurant를 고른다. 저장소 루트는 AGENT_OFFICE_COMPARE_ROOT로 지정한다.
// 기준이 오래됐거나 메타데이터·크기가 맞지 않으면 staleBaseline 경고를 내고 가능한 비교는 계속한다.

// 비교 조건: 실제 --demo --crowd 서버에서 /events를 비우고 /api/state도 빈 스냅샷으로 바꿔 캐릭터를 만들지 않는다.
// Date.now()를 고정해 조명·시간 효과를 유지하고, 8개 시점과 두 화면 크기를 모두 캡처한다.
const root = resolve(process.env.AGENT_OFFICE_COMPARE_ROOT ?? fileURLToPath(new URL('../', import.meta.url)));
const tempRoot = join(tmpdir(), 'agent-office-w4-shots');
const mode = process.argv.includes('--baseline') ? 'baseline' : process.argv.includes('--compare') ? 'compare' : null;
const theme = process.argv.find((argument) => argument.startsWith('--theme='))?.slice('--theme='.length) ?? 'office';
if (!mode) throw new Error('사용법: node scripts/compare-shots.mjs --baseline | --compare');
if (!['office', 'space', 'restaurant'].includes(theme)) throw new Error(`알 수 없는 테마: ${theme}`);
const browserPath = findBrowser();
if (!browserPath) throw new Error('Microsoft Edge 또는 Chrome을 찾지 못했습니다.');
const metadataPath = join(tempRoot, 'meta.json');
const currentCommit = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

const fixedNow = Date.parse('2026-10-22T03:00:00.000Z');
const dimensions = [
  { key: 'main', path: '/', width: 1440, height: 900 },
  { key: 'widget', path: '/widget', width: 420, height: 300 }
];

function reservePort() {
  return new Promise((resolvePort, reject) => {
    const server = createNetServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolvePort(port));
    });
  });
}

async function waitFor(url, timeoutMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch { /* 서버 준비 대기 */ }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  throw new Error('데모 서버 시작 시간 초과');
}

function cdpClient(socket) {
  let id = 0;
  const pending = new Map();
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(String(data));
    if (!message.id) return;
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(message.error.message));
    else waiter.resolve(message.result);
  });
  return (method, params = {}) => new Promise((resolveReply, reject) => {
    id += 1;
    pending.set(id, { resolve: resolveReply, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function openBrowser() {
  const port = await reservePort();
  const profile = mkdtempSync(join(tmpdir(), 'agent-office-w4-browser-'));
  const child = spawn(browserPath, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-allow-origins=*', '--window-size=1440,900', '--force-device-scale-factor=1',
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'
  ], { stdio: 'ignore' });
  try {
    await waitFor(`http://127.0.0.1:${port}/json/version`);
    const target = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' }).then((response) => response.json());
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolveOpen, reject) => {
      socket.addEventListener('open', resolveOpen, { once: true });
      socket.addEventListener('error', reject, { once: true });
    });
    const send = cdpClient(socket);
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Network.enable');
    await send('Network.setBlockedURLs', { urls: ['*events*'] });
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `
      const fixedNow = ${fixedNow};
      Date.now = () => fixedNow;
      window.EventSource = class { addEventListener() {} close() {} };
      const originalFetch = window.fetch.bind(window);
      window.fetch = (input, options) => {
        const url = new URL(typeof input === 'string' ? input : input.url, location.href);
        if (url.pathname === '/api/state') {
          return Promise.resolve(new Response(JSON.stringify({ floors: [], activity: [], now: fixedNow }), {
            headers: { 'Content-Type': 'application/json' }
          }));
        }
        return originalFetch(input, options);
      };
    ` });
    return { send, socket, process: child, profile };
  } catch (error) {
    child.kill();
    rmSync(profile, { recursive: true, force: true });
    throw error;
  }
}

async function evaluate(send, expression) {
  const reply = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (reply.exceptionDetails) throw new Error('브라우저 화면 준비 실패');
  return reply.result.value;
}

function decodePng(buffer) {
  let offset = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
  const data = [];
  while (offset < buffer.length) {
    const size = buffer.readUInt32BE(offset); offset += 4;
    const type = buffer.toString('ascii', offset, offset + 4); offset += 4;
    const chunk = buffer.subarray(offset, offset + size); offset += size + 4;
    if (type === 'IHDR') {
      width = chunk.readUInt32BE(0); height = chunk.readUInt32BE(4);
      bitDepth = chunk[8]; colorType = chunk[9]; interlace = chunk[12];
    }
    if (type === 'IDAT') data.push(chunk);
    if (type === 'IEND') break;
  }
  if (bitDepth !== 8 || ![2, 6].includes(colorType) || interlace !== 0) throw new Error('지원하지 않는 PNG 형식');
  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(data));
  const pixels = Buffer.alloc(height * stride);
  let input = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[input++];
    const row = y * stride;
    for (let x = 0; x < stride; x += 1) {
      const value = raw[input++];
      const left = x >= channels ? pixels[row + x - channels] : 0;
      const up = y ? pixels[row - stride + x] : 0;
      const upperLeft = y && x >= channels ? pixels[row - stride + x - channels] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = Math.floor((left + up) / 2);
      else if (filter === 4) {
        const p = left + up - upperLeft;
        const distances = [Math.abs(p - left), Math.abs(p - up), Math.abs(p - upperLeft)];
        predictor = distances[0] <= distances[1] && distances[0] <= distances[2] ? left
          : distances[1] <= distances[2] ? up : upperLeft;
      } else if (filter !== 0) throw new Error(`알 수 없는 PNG 필터: ${filter}`);
      pixels[row + x] = (value + predictor) & 0xff;
    }
  }
  return { width, height, channels, pixels };
}

function comparePng(beforeBytes, afterBytes) {
  const before = decodePng(beforeBytes), after = decodePng(afterBytes);
  if (before.width !== after.width || before.height !== after.height) return { changed: -1, bounds: null };
  let changed = 0, minX = before.width, minY = before.height, maxX = -1, maxY = -1;
  for (let y = 0; y < before.height; y += 1) {
    for (let x = 0; x < before.width; x += 1) {
      const a = (y * before.width + x) * before.channels;
      const b = (y * after.width + x) * after.channels;
      const different = [0, 1, 2].some((channel) => before.pixels[a + channel] !== after.pixels[b + channel]) ||
        (before.channels === 4 && before.pixels[a + 3] !== after.pixels[b + 3]);
      if (!different) continue;
      changed += 1; minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
  }
  return { changed, bounds: changed ? { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 } : null };
}

const port = await reservePort();
const server = spawn(process.execPath, ['server.js', '--demo', '--crowd'], {
  cwd: root, stdio: 'ignore', env: { ...process.env, AGENT_OFFICE_PORT: String(port) }
});
let browser;
try {
  await waitFor(`http://127.0.0.1:${port}/`);
  browser = await openBrowser();
  mkdirSync(tempRoot, { recursive: true });
  const results = [];
  let dimensionsMatch = true;
  await browser.send('Page.navigate', { url: `http://127.0.0.1:${port}/` });
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
  for (let view = 0; view < 8; view += 1) {
    for (const page of dimensions) {
      await browser.send('Emulation.setDeviceMetricsOverride', {
        width: page.width, height: page.height, deviceScaleFactor: 1, mobile: false
      });
      await evaluate(browser.send, `localStorage.setItem('agent-office.view', '${view}'); localStorage.setItem('agent-office.theme', '${theme}')`);
      await browser.send('Page.navigate', { url: `http://127.0.0.1:${port}${page.path}?theme=${theme}` });
      let ready = false;
      for (let attempt = 0; attempt < 100; attempt += 1) {
        ready = await evaluate(browser.send, "Boolean(document.querySelector('#map-host canvas'))");
        if (ready) break;
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
      }
      if (!ready) throw new Error(`캔버스 초기화 실패: ${page.path} 시점 ${view}`);
      await evaluate(browser.send, 'document.fonts.ready');
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
      const { data } = await browser.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      const name = `${page.key}-view${view}.png`;
      const shot = Buffer.from(data, 'base64');
      if (mode === 'baseline') {
        writeFileSync(join(tempRoot, `before-${name}`), shot);
        results.push({ name, saved: true });
      } else {
        const beforePath = join(tempRoot, `before-${name}`);
        if (!existsSync(beforePath)) throw new Error(`기준 스크린숏 누락: ${name}`);
        writeFileSync(join(tempRoot, `after-${name}`), shot);
        const beforeBytes = readFileSync(beforePath);
        const before = decodePng(beforeBytes), after = decodePng(shot);
        if (before.width !== after.width || before.height !== after.height) dimensionsMatch = false;
        const diff = comparePng(beforeBytes, shot);
        results.push({ name, ...diff });
      }
    }
  }
  let staleBaseline = null;
  if (mode === 'baseline') {
    writeFileSync(metadataPath, `${JSON.stringify({ commit: currentCommit, theme, browserPath, createdAt: new Date().toISOString(), repoRoot: root }, null, 2)}\n`);
  } else {
    let metadata = null;
    try { metadata = JSON.parse(readFileSync(metadataPath, 'utf8')); } catch { /* 누락·손상된 메타데이터는 경고 대상 */ }
    const ancestor = (baselineCommit, head) => {
      try {
        execFileSync('git', ['-C', root, 'merge-base', '--is-ancestor', baselineCommit, head], { stdio: 'ignore' });
        return true;
      } catch { return false; }
    };
    staleBaseline = baselineWarning({
      metadata,
      currentCommit,
      theme,
      now: Date.now(),
      dimensionsMatch,
      isAncestor: ancestor
    });
  }
  process.stdout.write(`${JSON.stringify({ staleBaseline, mode, theme, currentCommit, conditions: 'demo --crowd; EventSource 대체; /api/state 빈 스냅샷; Date.now 고정; 캐릭터 없음', tempRoot, results }, null, 2)}\n`);
  if (mode === 'compare' && results.some((result) => result.changed !== 0)) process.exitCode = 1;
} finally {
  if (browser) {
    try { await browser.send('Browser.close'); } catch { /* 닫힌 창 */ }
    browser.socket.close();
    if (browser.process.exitCode === null) browser.process.kill();
    try { rmSync(browser.profile, { recursive: true, force: true }); } catch { /* Edge 프로필 정리 */ }
  }
  server.kill();
}
