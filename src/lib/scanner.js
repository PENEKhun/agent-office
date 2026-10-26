import { open, readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createTail } from './tail.js';
import { isNetworkPath } from './platform-roots.js';

const RESTORE_WINDOW_MS = 2 * 60 * 60 * 1000;
const RESTORE_LINE_LIMIT = 500;
const PRIME_LINE_LIMIT = 64 * 1024;
const ROOT_STAT_CACHE_MS = 30_000;

async function readFirstLine(filePath) {
  let handle;
  try {
    handle = await open(filePath, 'r');
    const buffer = Buffer.alloc(PRIME_LINE_LIMIT);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    let line = buffer.subarray(0, bytesRead);
    const newline = line.indexOf(0x0a);
    if (newline !== -1) {
      line = line.subarray(0, newline);
    }
    if (line.at(-1) === 0x0d) {
      line = line.subarray(0, -1);
    }
    return line.toString('utf8');
  } catch {
    return null;
  } finally {
    await handle?.close();
  }
}

// descend가 false를 돌려준 폴더는 들어가지 않는다. 로그와 무관한 큰 폴더를 5초마다 훑지 않기 위해서다.
async function listFiles(directory, descend = () => true) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }

  const found = [];
  for (const entry of entries) {
    const filePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (descend(filePath)) {
        found.push(...await listFiles(filePath, descend));
      }
      continue;
    }
    if (entry.isFile()) {
      found.push(filePath);
    }
  }
  return found;
}

/** 로그 파일을 재탐색하고 알려진 파일을 주기적으로 읽기 */
export function createScanner({
  adapters,
  sources = {},
  onEvent = () => {},
  now = Date.now,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
  tail = createTail(),
  statFile = stat
}) {
  const sourceOverrides = { ...sources };
  const knownFiles = new Map();
  const skippedFiles = new Map();
  const rootStatCache = new Map();
  const rootsBySource = new Map();
  const lastEventAtBySource = new Map();
  let pollTimer = null;
  let rescanTimer = null;
  let polling = false;
  const running = { local: null, remote: null };
  const scan = { currentRoot: null, lastLocalMs: null, lastRemoteMs: null };

  async function rootExists(root, allowFile = false) {
    const path = resolve(root);
    const cached = rootStatCache.get(path);
    if (cached && now() - cached.checkedAt < ROOT_STAT_CACHE_MS) return cached.exists;
    let exists = false;
    try {
      const info = await statFile(path);
      exists = allowFile || typeof info.isDirectory !== 'function' ? true : info.isDirectory();
    } catch {
      exists = false;
    }
    rootStatCache.set(path, { exists, checkedAt: now() });
    return exists;
  }

  function rootsFor(adapter, sourceConfig) {
    let defaults = [];
    try { defaults = adapter.roots(sourceConfig); } catch { /* 기본 경로를 읽지 못한 출처는 지정 경로만 사용 */ }
    const configured = adapter.handlesConfiguredPath ? []
      : (typeof sourceConfig.path === 'string' && sourceConfig.path.trim() ? [sourceConfig.path] : []);
    const roots = [...defaults, ...configured];
    return [...new Set(roots.map((root) => resolve(root)))];
  }

  function emit(event, metadata) {
    if (Number.isFinite(event?.ts)) {
      const source = event.source;
      lastEventAtBySource.set(source, Math.max(lastEventAtBySource.get(source) ?? 0, event.ts));
    }
    onEvent(event, metadata);
  }

  // WSL(\\wsl.localhost) 같은 네트워크 경로는 느리거나 멈출 수 있어 로컬 경로와 따로 돈다.
  // 한쪽이 오래 걸려도 다른 출처의 발견과 폴링이 막히지 않는다.
  function isRemote(root) {
    return isNetworkPath(String(root));
  }

  function discover({ initial = false, remote = 'all' } = {}) {
    const lanes = remote === 'all' ? ['local', 'remote'] : [remote ? 'remote' : 'local'];
    return Promise.all(lanes.map((lane) => {
      if (running[lane]) return running[lane];
      const started = now();
      running[lane] = discoverLane({ initial, lane }).finally(() => {
        scan[lane === 'local' ? 'lastLocalMs' : 'lastRemoteMs'] = now() - started;
        running[lane] = null;
      });
      return running[lane];
    })).then(() => undefined);
  }

  async function discoverLane({ initial, lane }) {
    const cutoff = now() - RESTORE_WINDOW_MS;
    for (const adapter of adapters) {
      const sourceConfig = sourceOverrides[adapter.id] ?? {};
      if (sourceConfig.enabled === false) {
        rootsBySource.set(adapter.id, []);
        continue;
      }
      const roots = rootsFor(adapter, sourceConfig);
      rootsBySource.set(adapter.id, roots);
      for (const root of roots) {
        if (isRemote(root) !== (lane === 'remote')) continue;
        if (lane === 'local') scan.currentRoot = root;
        await rootExists(root, adapter.pollOnly === true);
        if (adapter.pollOnly) continue;
        const descend = typeof adapter.descend === 'function'
          ? (dirPath) => { try { return adapter.descend(dirPath, root) !== false; } catch { return true; } }
          : undefined;
        for (const filePath of await listFiles(resolve(root), descend)) {
          if (knownFiles.has(filePath) || !adapter.match(filePath, root)) {
            continue;
          }
          try {
            const info = await statFile(filePath);
            if (info.mtimeMs < cutoff) {
              if (skippedFiles.get(filePath) === info.mtimeMs) {
                continue;
              }
              skippedFiles.set(filePath, info.mtimeMs);
              continue;
            }
            const restoringSkippedFile = skippedFiles.has(filePath);
            if (restoringSkippedFile) {
              skippedFiles.delete(filePath);
            }
            const rootConfig = sourceConfig.forceSource && sourceConfig.path && resolve(sourceConfig.path) === root
              ? sourceConfig : { ...sourceConfig, forceSource: null };
            const session = adapter.createSession(filePath, root, rootConfig);
            if (typeof adapter.primeSession === 'function') {
              await adapter.primeSession(session, await readFirstLine(filePath));
            }
            knownFiles.set(filePath, { adapter, session });
            const restored = initial || restoringSkippedFile;
            // 처음부터 짧게 쓰이는 파일(인박스)은 실행 중에 새로 생겨도 앞줄을 놓치지 않게 읽는다
            if (restored || adapter.readNewFilesFromStart) {
              const lines = await tail.readInitialLines(filePath, RESTORE_LINE_LIMIT);
              for (const line of lines) {
                for (const event of adapter.parseLine(session, line)) {
                  emit(event, { restored });
                }
              }
            }
          } catch {
            knownFiles.delete(filePath);
          }
        }
      }
    }
  }

  async function pollOnce() {
    if (polling) {
      return;
    }
    polling = true;
    try {
      for (const [filePath, entry] of knownFiles) {
        try {
          for (const line of await tail.readNewLines(filePath)) {
            for (const event of entry.adapter.parseLine(entry.session, line)) {
              emit(event, { restored: false });
            }
          }
        } catch {
          // 삭제되거나 잠긴 파일은 다음 재탐색 때 다시 처리
        }
      }
      await pollAdapters(false);
    } finally {
      polling = false;
    }
  }

  async function pollAdapters(restored) {
    for (const adapter of adapters) {
      if (typeof adapter.poll !== 'function') {
        continue;
      }
      if (sourceOverrides[adapter.id]?.enabled === false) continue;
      try {
        for (const event of await adapter.poll(sourceOverrides[adapter.id] ?? {})) {
          emit(event, { restored });
        }
      } catch {
        // SQLite 접근 실패 등 보조 소스 오류는 다음 폴링에서 다시 확인
      }
    }
  }

  async function start() {
    await pollAdapters(true);
    await discover({ initial: true, remote: false });
    scan.currentRoot = null;
    pollTimer = setIntervalFn(() => void pollOnce(), 1000);
    rescanTimer = setIntervalFn(() => void discover(), 5000);
    void discover({ initial: true, remote: true });
  }

  function stop() {
    if (pollTimer !== null) {
      clearIntervalFn(pollTimer);
      pollTimer = null;
    }
    if (rescanTimer !== null) {
      clearIntervalFn(rescanTimer);
      rescanTimer = null;
    }
  }

  function diagnostics() {
    const watchedFilesBySource = {};
    const ignoredCountBySource = {};
    const unknownCountBySource = {};
    const databaseErrorCountBySource = {};
    for (const { adapter, session } of knownFiles.values()) {
      const source = session.source ?? adapter.id;
      watchedFilesBySource[source] = (watchedFilesBySource[source] ?? 0) + 1;
      ignoredCountBySource[source] = (ignoredCountBySource[source] ?? 0) + (session.ignoredCount ?? 0);
      unknownCountBySource[source] = (unknownCountBySource[source] ?? 0) + (session.unknownCount ?? 0);
    }
    for (const adapter of adapters) {
      if (typeof adapter.diagnostics !== 'function') continue;
      const counts = adapter.diagnostics();
      ignoredCountBySource[adapter.id] = (ignoredCountBySource[adapter.id] ?? 0) + (counts.ignoredCount ?? 0);
      unknownCountBySource[adapter.id] = (unknownCountBySource[adapter.id] ?? 0) + (counts.unknownCount ?? 0);
      databaseErrorCountBySource[adapter.id] = counts.databaseErrorCount ?? 0;
    }
    return { watchedFilesBySource, ignoredCountBySource, unknownCountBySource, databaseErrorCountBySource,
      scan: { ...scan, localRunning: Boolean(running.local), remoteRunning: Boolean(running.remote) } };
  }

  function connectivity() {
    const { watchedFilesBySource } = diagnostics();
    return Object.fromEntries([...rootsBySource].map(([source, roots]) => {
      const adapter = adapters.find((entry) => entry.id === source);
      const dynamic = typeof adapter?.connectivity === 'function' ? adapter.connectivity(now()) : {};
      return [source, {
        folder: roots.some((root) => rootStatCache.get(root)?.exists === true),
        recent: dynamic.recent ?? ((watchedFilesBySource[source] ?? 0) > 0),
        lastEventAt: dynamic.lastEventAt ?? lastEventAtBySource.get(source) ?? null
      }];
    }));
  }

  async function configureSource(source, path, options = {}) {
    const updated = { ...(sourceOverrides[source] ?? {}), ...options };
    if (typeof path === 'string' && path.trim()) updated.path = path.trim();
    else delete updated.path;
    sourceOverrides[source] = updated;
    if (typeof path === 'string' && path.trim()) rootStatCache.delete(resolve(path.trim()));
    await discover();
  }

  return { start, stop, discover, pollOnce, knownFiles, skippedFiles, diagnostics, connectivity, configureSource };
}
