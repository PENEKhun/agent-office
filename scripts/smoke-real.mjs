import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.AGENT_OFFICE_PORT ?? 4777);
const durationMs = Number(process.env.SMOKE_DURATION_MS ?? 610_000);
const sampleEveryMs = Number(process.env.SMOKE_INTERVAL_MS ?? 60_000);
const sources = ['claude-code', 'codex', 'antigravity', 'claude-desktop'];
const sourceNames = new Map([
  ['claude-code', 'Claude Code'], ['codex', 'Codex'],
  ['antigravity', 'Antigravity'], ['claude-desktop', 'Claude Desktop']
]);

async function waitForServer(url, process, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (process.exitCode !== null) throw new Error('npm start가 준비 전에 종료됐습니다.');
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch { /* server is still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('실제 Agent Office 서버가 30초 안에 준비되지 않았습니다.');
}

function agentCount(snapshot) {
  return snapshot.floors.reduce((total, floor) => total + floor.agents.reduce((count, agent) =>
    count + 1 + (agent.children?.length ?? 0), 0), 0);
}

function makeRow(elapsedMs, diagnostics, snapshot) {
  const minute = Number((elapsedMs / 60_000).toFixed(1));
  const row = { minute, floors: snapshot.floors.length, agents: agentCount(snapshot) };
  const events = diagnostics.eventsBySource ?? {};
  const unknown = diagnostics.unknownCountBySource ?? {};
  const ignored = diagnostics.ignoredCountBySource ?? {};
  for (const source of sources) {
    row[`${source}Events`] = events[source] ?? 0;
    row[`${source}Unknown`] = unknown[source] ?? 0;
    row[`${source}Ignored`] = ignored[source] ?? 0;
  }
  return row;
}

function toMarkdown(rows) {
  const header = ['분'];
  for (const source of sources) header.push(`${sourceNames.get(source)} 수신`, '알 수 없음', '의도적 제외');
  header.push('층', '에이전트');
  const separator = header.map(() => '---');
  const lines = [`| ${header.join(' | ')} |`, `| ${separator.join(' | ')} |`];
  for (const row of rows) {
    const cells = [row.minute];
    for (const source of sources) cells.push(row[`${source}Events`], row[`${source}Unknown`], row[`${source}Ignored`]);
    cells.push(row.floors, row.agents);
    lines.push(`| ${cells.join(' | ')} |`);
  }
  return lines.join('\n');
}

const npmCommand = process.platform === 'win32' ? (process.env.ComSpec ?? 'cmd.exe') : 'npm';
const npmArgs = process.platform === 'win32' ? ['/d', '/s', '/c', 'npm start'] : ['start'];
let alreadyRunning = false;
try {
  const response = await fetch(`http://127.0.0.1:${port}/api/state`, { signal: AbortSignal.timeout(800) });
  alreadyRunning = response.ok;
} catch { /* expected when no server is listening */ }

if (alreadyRunning) {
  console.error(`127.0.0.1:${port}에서 서버가 이미 실행 중입니다. 기존 서버를 종료하고 다시 실행하세요.`);
  process.exitCode = 1;
} else if (!Number.isInteger(port) || port < 1 || port > 65535 || durationMs < 600_001 || sampleEveryMs < 1000) {
  console.error('포트, 10분 초과 관측 시간 또는 표본 간격이 올바르지 않습니다.');
  process.exitCode = 1;
} else {
  const npmProcess = spawn(npmCommand, npmArgs, {
    cwd: root,
    stdio: 'ignore'
  });
  const rows = [];
  try {
    await waitForServer(`http://127.0.0.1:${port}/api/diagnostics`, npmProcess);
    const startedAt = Date.now();
    while (true) {
      const [diagnostics, snapshot] = await Promise.all([
        fetch(`http://127.0.0.1:${port}/api/diagnostics`).then((response) => response.json()),
        fetch(`http://127.0.0.1:${port}/api/state`).then((response) => response.json())
      ]);
      const elapsed = Date.now() - startedAt;
      const row = makeRow(elapsed, diagnostics, snapshot);
      rows.push(row);
      process.stdout.write(`${JSON.stringify(row)}\n`);
      if (elapsed >= durationMs) break;
      await new Promise((resolve) => setTimeout(resolve, Math.min(sampleEveryMs, durationMs - elapsed)));
    }
    process.stdout.write(`\n${toMarkdown(rows)}\n`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    if (process.platform === 'win32' && npmProcess.pid) {
      spawnSync('taskkill', ['/pid', String(npmProcess.pid), '/t', '/f'], { stdio: 'ignore' });
    } else {
      npmProcess.kill('SIGTERM');
    }
  }
}
