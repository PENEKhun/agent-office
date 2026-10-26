import { open, readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const root = join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'sessions');
const sampleCount = Number(process.argv.find((arg) => arg.startsWith('--count='))?.split('=')[1] ?? 3);
const pollIntervalMs = Number(process.argv.find((arg) => arg.startsWith('--poll-ms='))?.split('=')[1] ?? 200);
const timeoutMs = Number(process.argv.find((arg) => arg.startsWith('--timeout-ms='))?.split('=')[1] ?? 180000);
const states = new Map();

async function listRollouts(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listRollouts(path));
    } else if (entry.isFile() && basename(path).startsWith('rollout-') && path.endsWith('.jsonl')) {
      files.push(path);
    }
  }
  return files;
}

async function initializeBaseline() {
  for (const path of await listRollouts(root)) {
    try {
      states.set(path, { offset: (await stat(path)).size, pending: Buffer.alloc(0) });
    } catch {
      // 회전 중 사라진 파일은 다음 검색에서 다시 확인
    }
  }
}

function matchesSample(command) {
  const parts = typeof command === 'string' ? [command] : Array.isArray(command) ? command : [];
  return parts.some((part) => typeof part === 'string' && /^Start-Sleep\s+-Seconds\s+5\s*$/i.test(part));
}

async function readAppendedLines(path, state) {
  let info;
  try {
    info = await stat(path);
  } catch {
    return [];
  }
  if (info.size < state.offset) {
    state.offset = 0;
    state.pending = Buffer.alloc(0);
  }
  if (info.size === state.offset) {
    return [];
  }

  const handle = await open(path, 'r');
  const chunks = [];
  let position = state.offset;
  try {
    while (position < info.size) {
      const chunk = Buffer.alloc(Math.min(64 * 1024, info.size - position));
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, position);
      if (bytesRead === 0) {
        break;
      }
      chunks.push(chunk.subarray(0, bytesRead));
      position += bytesRead;
    }
  } finally {
    await handle.close();
  }
  state.offset = position;
  const combined = Buffer.concat([state.pending, ...chunks]);
  const lines = [];
  let start = 0;
  for (let newline = combined.indexOf(0x0a); newline !== -1; newline = combined.indexOf(0x0a, start)) {
    lines.push(combined.subarray(start, newline).toString('utf8'));
    start = newline + 1;
  }
  state.pending = combined.subarray(start);
  return lines;
}

function completedCommand(line) {
  let row;
  try {
    row = JSON.parse(line);
  } catch {
    return null;
  }
  if (row?.type !== 'event_msg' || row.payload?.type !== 'item_completed' ||
      row.payload?.item?.type !== 'CommandExecution' || !matchesSample(row.payload.item.command)) {
    return null;
  }
  return typeof row.payload.completed_at_ms === 'number' && Number.isFinite(row.payload.completed_at_ms)
    ? row.payload.completed_at_ms
    : null;
}

if (!Number.isInteger(sampleCount) || sampleCount < 1 || !Number.isFinite(pollIntervalMs) || pollIntervalMs < 1) {
  throw new Error('count와 poll-ms는 양의 수여야 합니다.');
}

await initializeBaseline();
const samples = [];
const deadline = Date.now() + timeoutMs;
while (samples.length < sampleCount && Date.now() < deadline) {
  for (const path of await listRollouts(root)) {
    let state = states.get(path);
    if (!state) {
      state = { offset: 0, pending: Buffer.alloc(0) };
      states.set(path, state);
    }
    for (const line of await readAppendedLines(path, state)) {
      const completedAt = completedCommand(line);
      if (completedAt !== null && samples.length < sampleCount) {
        samples.push(Date.now() - completedAt);
      }
    }
  }
  if (samples.length < sampleCount) {
    await delay(pollIntervalMs);
  }
}

if (samples.length !== sampleCount) {
  process.stderr.write(`측정 이벤트 ${sampleCount}개 중 ${samples.length}개만 관찰했습니다.\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`${JSON.stringify({ pollIntervalMs, latencyMs: samples })}\n`);
}
