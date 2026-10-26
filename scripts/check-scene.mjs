import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { findBrowser } from './lib/browser.js';
import { acquireSceneLock, sceneLockOwnedBy } from './lib/scene-lock.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const scenarios = [
  { name: 'demo', crowd: false, clockSpeed: 1, durationMs: 70_000, reconnectAtMs: 62_000 },
  { name: 'crowd', crowd: true, clockSpeed: 1, durationMs: 70_000, reconnectAtMs: 62_000 },
  { name: 'clock-speed-600', crowd: false, clockSpeed: 600, durationMs: 15_000 },
  { name: 'simultaneous-reconnect-pushes', crowd: true, clockSpeed: 1, durationMs: 18_000,
    injectPushes: true, reconnectAtMs: 6500 },
  { name: 'widget-badge', crowd: false, clockSpeed: 1, durationMs: 3000, widget: true },
  { name: 'long-run-crowd', crowd: true, clockSpeed: 10, demoClockSpeed: 1, intervalMs: 140,
    durationMs: Number(process.env.SCENE_LONG_RUN_MS) || 60_000, sampleEveryMs: 6000, injectPushesEveryMs: 6000, longRun: true,
    screenshot: 'docs/reviews/fix-0.1.3-crowd.png' }
];
const scenarioFilter = process.argv.find((argument) => argument.startsWith('--scenario='))?.slice('--scenario='.length);
const theme = process.argv.find((argument) => argument.startsWith('--theme='))?.slice('--theme='.length) ?? 'office';
const updateBaseline = process.argv.includes('--update-baseline');
const allViews = process.argv.includes('--views=all');
// --view=N(0~7)이면 시점을 돌린 화면에서 같은 검증을 한다. 지정하지 않으면 기본 시점(1, 45도)이다.
const viewArgument = process.argv.find((argument) => argument.startsWith('--view='))?.slice('--view='.length);
const view = viewArgument === undefined ? null : Number(viewArgument);
if (view !== null && !(Number.isInteger(view) && view >= 0 && view <= 7)) {
  console.error('--view는 0부터 7까지의 정수여야 합니다.');
  process.exit(1);
}

const sceneLockPath = join(tmpdir(), 'agent-office-check-scene.lock');
const delegatedLockPid = Number(process.env.AGENT_OFFICE_SCENE_LOCK_PID);
let releaseSceneLock = null;
if (delegatedLockPid > 0 && sceneLockOwnedBy(sceneLockPath, delegatedLockPid)) {
  // --views=all 하위 실행은 부모가 잡은 잠금을 공유한다.
} else {
  releaseSceneLock = acquireSceneLock(sceneLockPath);
  if (!releaseSceneLock) {
    console.error('다른 check-scene 검사가 실행 중입니다. 동시에 돌리면 묶음 거리 지표가 흔들립니다.');
    process.exit(2);
  }
  process.once('exit', releaseSceneLock);
}

const browserPath = findBrowser();

if (allViews) {
  console.log('안내: --views=all은 시점별 전체 시나리오를 8회 순서대로 실행하므로 오래 걸립니다.');
  const rows = [];
  const scriptPath = fileURLToPath(import.meta.url);
  for (let selectedView = 0; selectedView < 8; selectedView += 1) {
    const args = [scriptPath, `--view=${selectedView}`];
    if (theme !== 'office') args.push(`--theme=${theme}`);
    if (scenarioFilter) args.push(`--scenario=${scenarioFilter}`);
    if (updateBaseline) args.push('--update-baseline');
    const child = spawnSync(process.execPath, args, {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env, AGENT_OFFICE_SCENE_LOCK_PID: String(process.pid) }
    });
    let result = null;
    try { result = JSON.parse(child.stdout.trim()).result; } catch { /* 실패한 자식은 FAIL로 기록 */ }
    rows.push({ view: selectedView, result: child.status === 0 && result === 'PASS' ? 'PASS' : 'FAIL' });
  }
  console.log('\n시점 | 결과\n-----|-----');
  for (const row of rows) console.log(`${row.view} | ${row.result}`);
  if (rows.some(({ result }) => result !== 'PASS')) process.exitCode = 1;
  releaseSceneLock?.();
}

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitFor(url, timeoutMs = 15_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch { /* server is still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function cdpClient(socket) {
  let nextId = 1;
  const pending = new Map();
  const events = [];
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    if (message.method) events.push(message);
    if (!message.id) return;
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(message.error.message));
    else waiter.resolve(message.result);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  send.events = events;
  return send;
}

async function openBrowser(url, { width = 1440, height = 900 } = {}) {
  const debuggingPort = await reservePort();
  const profile = mkdtempSync(join(tmpdir(), 'agent-office-scene-check-'));
  const process = spawn(browserPath, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-allow-origins=*', `--window-size=${width},${height}`, '--force-device-scale-factor=1',
    `--remote-debugging-port=${debuggingPort}`, `--user-data-dir=${profile}`, 'about:blank'
  ], { stdio: 'ignore' });
  let socket;
  try {
    await waitFor(`http://127.0.0.1:${debuggingPort}/json/version`);
    const response = await fetch(`http://127.0.0.1:${debuggingPort}/json/new?about:blank`, { method: 'PUT' });
    const target = await response.json();
    socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
    });
    const send = cdpClient(socket);
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Page.navigate', { url });
    return { send, socket, process, profile };
  } catch (error) {
    socket?.close();
    process.kill();
    rmSync(profile, { recursive: true, force: true });
    throw error;
  }
}

async function closeBrowser(browser) {
  if (!browser) return;
  try {
    await Promise.race([browser.send('Browser.close'), new Promise((resolve) => setTimeout(resolve, 1200))]);
  } catch { /* browser may have already exited */ }
  browser.socket.close();
  if (browser.process.exitCode === null) browser.process.kill();
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try { rmSync(browser.profile, { recursive: true, force: true }); break; }
    catch { await new Promise((resolve) => setTimeout(resolve, 250)); }
  }
}

async function evaluate(send, expression) {
  const reply = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (reply.exceptionDetails) throw new Error('Browser scene diagnostics failed.');
  return reply.result.value;
}

async function runScenario(scenario) {
  const port = await reservePort();
  const speed = scenario.clockSpeed;
  const bootstrap = `import('./src/server/http.js').then(async ({createServer}) => {
    const {createDemo} = await import('./src/server/demo.js');
    const speed = ${speed};
    const baseDemo = createDemo({crowd:${scenario.crowd}, clockSpeed:${scenario.demoClockSpeed ?? speed}, intervalMs:${scenario.intervalMs ?? 1400}});
    let demo = baseDemo;
      if (${scenario.injectPushes === true || scenario.injectPushesEveryMs ? 'true' : 'false'}) {
      const agents = [
        ['claude-code','demo-claude','demo-claude',null], ['codex','demo-codex','demo-codex',null],
        ['antigravity','demo-antigravity','demo-antigravity',null], ['codex','demo-codex','demo-subagent','demo-codex'],
        ['claude-code','crowd-library','crowd-library',null], ['codex','crowd-search','crowd-search',null],
        ['antigravity','crowd-lounge','crowd-lounge',null], ['claude-code','crowd-child','crowd-child','demo-claude']
      ];
      demo = { subscribe(onEvent) {
        const stop = baseDemo.subscribe(onEvent);
        const emitPushes = () => agents.forEach(([source,sessionId,agentId,parentAgentId]) => onEvent({
          v:1, source, sessionId, agentId, parentAgentId, project:process.cwd().replaceAll('\\\\','/'),
          title:null, kind:'git', tool:'CommandExecution', room:'dev', detail:null, exitCode:null,
          git:{action:'push'}, ts:Date.now(), startedAt:null, endedAt:null, live:true
        }));
        const timer = ${scenario.injectPushesEveryMs ? `setInterval(emitPushes, ${scenario.injectPushesEveryMs})` : `setTimeout(emitPushes, 4000)`};
        return () => { ${scenario.injectPushesEveryMs ? `clearInterval(timer)` : `clearTimeout(timer)`}; stop(); };
      }};
    }
    const server = createServer({demo, lighting:'auto', clockSpeed:speed,
      stateOptions:{idleAfterSec:60/speed, goneAfterSec:360/speed}});
    server.listen(${port}, '127.0.0.1');
  });`;
  const serverProcess = spawn(process.execPath, ['--input-type=module', '-e', bootstrap], { cwd: root, stdio: 'ignore' });
  let browser;
  try {
    const route = scenario.widget ? '/widget' : '/';
    const width = scenario.widget ? 420 : 1440;
    const height = scenario.widget ? 300 : 900;
    const url = `http://127.0.0.1:${port}${route}?sceneDiagnostics=1&theme=${encodeURIComponent(theme)}`;
    await waitFor(`http://127.0.0.1:${port}/api/state`);
    browser = await openBrowser(url, { width, height });
    if (view !== null) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await evaluate(browser.send, `localStorage.setItem('agent-office.view', '${view}')`);
      await browser.send('Page.reload', { ignoreCache: true });
    }
    await new Promise((resolve) => setTimeout(resolve, 750));
    let occupancy = null;
    const elevatorIntervals = [];
    let maxElevatorOccupancy = 0;
    let labelsChecked = 0;
    let overlappingPairs = 0;
    let deliveriesSeen = 0;
    const traces = new Map();
    let restLocationViolations = 0;
    const restViolationExamples = [];
    let twoPersonChipViolations = 0;
    let bundleDistanceViolations = 0;
    let maxBundleHeadDistancePx = 0;
    const bundleDistanceExamples = [];
    let badgeSizeViolations = 0;
    let queueLimitViolations = 0;
    let roomMismatchViolations = 0;
    let missingEmoteViolations = 0;
    let chipCoverageViolations = 0;
    let missingDiagnostics = 0;
    let deliveryBacklogViolations = 0;
    let stalledDeliveryViolations = 0;
    const chipCoverageExamples = [];
    const roomMismatchSince = new Map();
    const deliverySince = new Map();
    const minuteLog = [];
    const overlapExamples = [];
    const startedAt = Date.now();
    let reconnected = false;
    while (Date.now() - startedAt < scenario.durationMs) {
      const elapsed = Date.now() - startedAt;
      if (!reconnected && scenario.reconnectAtMs && elapsed >= scenario.reconnectAtMs) {
        await browser.send('Page.reload', { ignoreCache: true });
        reconnected = true;
        await new Promise((resolve) => setTimeout(resolve, 700));
      }
      const agents = await evaluate(browser.send, 'window.__officeSceneAgents?.() ?? null');
      if (agents) {
        if (scenario.longRun && elapsed >= (minuteLog.length + 1) * scenario.sampleEveryMs) {
          minuteLog.push({ minute: minuteLog.length + 1, agents: agents.map((agent) => ({
            id: agent.id, queue: agent.queueLength, screenRoom: agent.room, serverRoom: agent.serverRoom,
            delivery: agent.delivery
          })), activeDeliveries: agents.filter((agent) => agent.delivery !== null).length,
          queuedDeliveries: Math.max(0, ...agents.map((agent) => agent.deliveryQueueLength ?? 0)),
          elevatorCount: agents.filter((agent) => agent.inElevatorHall).length });
        }
        if (scenario.longRun && agents.some((agent) => (agent.deliveryQueueLength ?? 0) > 0)) deliveryBacklogViolations += 1;
        const elevatorCount = agents.filter((agent) => agent.inElevatorHall).length;
        maxElevatorOccupancy = Math.max(maxElevatorOccupancy, elevatorCount);
        if (elevatorCount >= 3) {
          occupancy ??= { startedAt: elapsed, maximum: 0 };
          occupancy.maximum = Math.max(occupancy.maximum, elevatorCount);
        } else if (occupancy !== null) {
          elevatorIntervals.push({ durationMs: elapsed - occupancy.startedAt, maximum: occupancy.maximum });
          occupancy = null;
        }
        deliveriesSeen = Math.max(deliveriesSeen, agents.filter((agent) => agent.delivery !== null).length);
        for (const agent of agents) {
          if (scenario.longRun) {
            if (agent.queueLength >= 3) queueLimitViolations += 1;
            if (!agent.emoteVisible && agent.status !== 'gone') missingEmoteViolations += 1;
            const mismatched = agent.delivery === null && agent.room && agent.serverRoom && agent.room !== agent.serverRoom;
            if (mismatched) {
              const since = roomMismatchSince.get(agent.id) ?? elapsed;
              roomMismatchSince.set(agent.id, since);
              if (elapsed - since > 10_000) roomMismatchViolations += 1;
            } else roomMismatchSince.delete(agent.id);
            if (agent.delivery !== null) {
              const since = deliverySince.get(agent.id) ?? elapsed;
              deliverySince.set(agent.id, since);
              if (elapsed - since > 10_000) stalledDeliveryViolations += 1;
            } else deliverySince.delete(agent.id);
          }
          const trace = traces.get(agent.id) ?? [];
          const distance = (left, right) => Math.hypot(left.x - right.x, left.y - right.y);
          trace.push({ t: elapsed, emoteDistance: distance(agent.head, agent.emote), badgeDistance: distance(agent.head, agent.badge), scale: agent.emoteScale });
          traces.set(agent.id, trace);
          const inLounge = agent.tileX >= 7 && agent.tileX < 13 && agent.tileY >= 11 && agent.tileY < 14;
          const inLoungeQueue = agent.tileX >= 7 && agent.tileX < 13 && agent.tileY >= 14 && agent.tileY < 18;
          const inDesk = agent.tileX >= 14 && agent.tileX < 20 && agent.tileY >= 7 && agent.tileY < 14;
          const invalidIdle = !agent.moving && agent.status === 'idle' && !inLounge && !inLoungeQueue;
          if (invalidIdle) {
            restLocationViolations += 1;
            if (restViolationExamples.length < 5) restViolationExamples.push({ status: agent.status, room: agent.room, tileX: agent.tileX, tileY: agent.tileY });
          }
          if (scenario.widget && agent.emoteScale >= 0.99 && agent.badgeDiameter < 12) badgeSizeViolations += 1;
        }
        const labelSnapshot = await evaluate(browser.send, 'window.__officeLabelSnapshot?.() ?? null');
        const bundles = labelSnapshot?.bundles ?? [];
        const chipsEnabled = await evaluate(browser.send, 'window.__officeBundleChips !== false');
        if (scenario.longRun && chipsEnabled) {
          const groups = labelSnapshot?.groups ?? [];
          const covered = new Set(bundles.flatMap((bundle) => bundle.members));
          if (groups.some((group) => group.size >= 3 && group.members.filter((id) => covered.has(id)).length < 3)) {
            chipCoverageViolations += 1;
            if (chipCoverageExamples.length < 3) chipCoverageExamples.push({ groups: groups.filter((group) => group.size >= 3)
              .map((group) => ({ ...group, heads: group.members.map((id) => ({ id, point: agents.find((agent) => agent.id === id)?.head })) })),
            bundles: bundles.map((bundle) => bundle.members) });
          }
        }
        for (const bundle of bundles) {
          if (bundle.memberCount === 2) twoPersonChipViolations += 1;
          for (const head of bundle.heads) {
            const distance = Math.hypot(bundle.center.x - head.x, bundle.center.y - head.y);
            maxBundleHeadDistancePx = Math.max(maxBundleHeadDistancePx, distance);
            if (distance > 48) {
              bundleDistanceViolations += 1;
              if (bundleDistanceExamples.length < 3) bundleDistanceExamples.push({ center: bundle.center,
                head, distance: Number(distance.toFixed(2)), members: bundle.members });
            }
          }
        }
        if (labelsChecked < 20) {
          const bounds = await evaluate(browser.send, 'window.__officeLabelBounds?.() ?? null');
          if (bounds) {
            labelsChecked += 1;
            for (let left = 0; left < bounds.length; left += 1) {
              for (let right = left + 1; right < bounds.length; right += 1) {
                const a = bounds[left], b = bounds[right];
                if (a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y) {
                  if (a.kind === 'emote' && b.kind === 'emote') continue;
                  const emote = a.kind === 'emote' ? a : b.kind === 'emote' ? b : null;
                  const chip = a.kind === 'chip' ? a : b.kind === 'chip' ? b : null;
                  // Chips intentionally sit behind persistent emotes; this is a layered overlap,
                  // not a collision that can hide either visual.
                  if (emote && chip) continue;
                  overlappingPairs += 1;
                  if (overlapExamples.length < 5) overlapExamples.push({
                    first: { kind: a.kind, id: a.id, x: a.x, y: a.y, width: a.width, height: a.height },
                    second: { kind: b.kind, id: b.id, x: b.x, y: b.y, width: b.width, height: b.height }
                  });
                }
              }
            }
          }
        }
      } else if (scenario.longRun) {
        missingDiagnostics += 1;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (occupancy !== null) {
      elevatorIntervals.push({ durationMs: Date.now() - startedAt - occupancy.startedAt, maximum: occupancy.maximum });
    }
    if (scenario.longRun && minuteLog.length < 10) {
      const agents = await evaluate(browser.send, 'window.__officeSceneAgents?.() ?? []');
      minuteLog.push({ minute: 10, agents: agents.map((agent) => ({
        id: agent.id, queue: agent.queueLength, screenRoom: agent.room, serverRoom: agent.serverRoom,
        delivery: agent.delivery
      })), activeDeliveries: agents.filter((agent) => agent.delivery !== null).length,
      queuedDeliveries: Math.max(0, ...agents.map((agent) => agent.deliveryQueueLength ?? 0)),
      elevatorCount: agents.filter((agent) => agent.inElevatorHall).length });
    }
    let maxDistanceVariation = 0;
    let maxScaleChangesPerSecond = 0;
    for (const trace of traces.values()) {
      for (let start = 0; start < trace.length; start += 1) {
        const window = trace.slice(start).filter((sample) => sample.t <= trace[start].t + 10_000);
        if (window.length < 2) continue;
        for (const key of ['emoteDistance', 'badgeDistance']) {
          const values = window.map((sample) => sample[key]);
          maxDistanceVariation = Math.max(maxDistanceVariation, Math.max(...values) - Math.min(...values));
        }
        let changes = 0;
        for (let index = 1; index < window.length; index += 1) {
          if (window[index].scale !== window[index - 1].scale) changes += 1;
        }
        maxScaleChangesPerSecond = Math.max(maxScaleChangesPerSecond, changes / 10);
      }
    }
    if (scenario.screenshot && scenario.durationMs >= 60_000) {
      const shot = await browser.send('Page.captureScreenshot', { format: 'png' });
      // 기본 실행 결과는 임시 폴더에 두고, 명시한 경우에만 기준 스크린숏을 갱신한다.
      // 회전 시점은 이전처럼 항상 임시 폴더에 저장한다.
      const shotPath = view !== null
        ? join(tmpdir(), `agent-office-scene-view${view}.png`)
        : updateBaseline
          ? join(root, scenario.screenshot)
          : join(tmpdir(), `agent-office-scene-${scenario.name}.png`);
      writeFileSync(shotPath, Buffer.from(shot.data, 'base64'));
    }
    const viewLabel = await evaluate(browser.send, "document.querySelector('#view-angle')?.textContent ?? localStorage.getItem('agent-office.view')");
    return {
      scenario: scenario.name,
      viewLabel,
      observedSeconds: Math.round((Date.now() - startedAt) / 1000),
      reconnectTested: reconnected,
      maxElevatorOccupancy,
      elevatorIntervalsOver5Seconds: elevatorIntervals.filter((interval) => interval.durationMs > 5000).length,
      elevatorIntervals,
      deliveriesSeen,
      maxHeadMarkerDistanceVariationPx: Number(maxDistanceVariation.toFixed(2)),
      maxEmoteScaleChangesPerSecond: Number(maxScaleChangesPerSecond.toFixed(2)),
      restLocationViolations,
      restViolationExamples,
      twoPersonChipViolations,
      bundleDistanceViolations,
      maxBundleHeadDistancePx: Number(maxBundleHeadDistancePx.toFixed(2)),
      bundleDistanceExamples,
      badgeSizeViolations,
      queueLimitViolations,
      roomMismatchViolations,
      missingEmoteViolations,
      chipCoverageViolations,
      missingDiagnostics,
      deliveryBacklogViolations,
      stalledDeliveryViolations,
      consoleErrors: browser.send.events.filter(({ method, params }) => method === 'Runtime.exceptionThrown' ||
        (method === 'Runtime.consoleAPICalled' && params.type === 'error')).map(({ method, params }) =>
        method === 'Runtime.exceptionThrown' ? params.exceptionDetails?.text : params.args?.map((arg) => arg.value ?? arg.description ?? arg.type).join(' ')).slice(0, 5),
      chipCoverageExamples,
      minuteLog,
      overlapExamples,
      labelSamples: labelsChecked,
      overlappingPairs
    };
  } finally {
    await closeBrowser(browser);
    serverProcess.kill();
  }
}

if (!allViews && !browserPath) {
  console.error('Microsoft Edge 또는 Google Chrome 실행 파일이 없습니다. EDGE_PATH를 지정하세요.');
  process.exitCode = 1;
} else if (!allViews) {
  const results = [];
  try {
    for (const scenario of scenarios.filter((item) => !scenarioFilter || item.name === scenarioFilter)) results.push(await runScenario(scenario));
    const report = {
      view: view ?? 1,
      scenarios: results,
      elevatorIntervalsOver5Seconds: results.reduce((sum, result) => sum + result.elevatorIntervalsOver5Seconds, 0),
      overlappingPairs: results.reduce((sum, result) => sum + result.overlappingPairs, 0),
      result: results.every((result) => result.elevatorIntervalsOver5Seconds === 0 &&
        result.maxHeadMarkerDistanceVariationPx <= 6 && result.maxEmoteScaleChangesPerSecond <= 2 && result.restLocationViolations === 0 &&
        result.twoPersonChipViolations === 0 && result.bundleDistanceViolations === 0 && result.badgeSizeViolations === 0 &&
        result.missingDiagnostics === 0 &&
        result.deliveryBacklogViolations === 0 && result.stalledDeliveryViolations === 0 &&
        result.queueLimitViolations === 0 && result.roomMismatchViolations === 0 && result.missingEmoteViolations === 0 &&
        result.chipCoverageViolations === 0) ? 'PASS' : 'FAIL'
    };
    console.log(JSON.stringify(report, null, 2));
    if (report.result !== 'PASS') process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
