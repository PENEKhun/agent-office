import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { EventEmitter } from 'node:events';
import { createServer } from './src/server/http.js';
import { createDemo, parseClockSpeed } from './src/server/demo.js';
import { loadAdapters } from './src/adapters/index.js';
import { createScanner } from './src/lib/scanner.js';
import { addSourcePath, normalizeConfig, resetSourcePath } from './src/server/config.js';

const CONFIG_PATH = process.env.AGENT_OFFICE_CONFIG || fileURLToPath(new URL('./config.json', import.meta.url));
const DEFAULT_CONFIG_PATH = new URL('./config.example.json', import.meta.url);
const isDemo = process.argv.includes('--demo');
const isCrowd = process.argv.includes('--crowd');
const clockSpeed = isDemo ? parseClockSpeed(process.argv) : 1;

async function loadConfig() {
  let savedConfig = false;
  let value;
  try {
    value = JSON.parse(await readFile(CONFIG_PATH, 'utf8'));
    savedConfig = true;
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }

  if (!savedConfig) value = JSON.parse(await readFile(DEFAULT_CONFIG_PATH, 'utf8'));
  const result = normalizeConfig(value);
  if (savedConfig && result.migrated) {
    await writeFile(CONFIG_PATH, JSON.stringify(result.config, null, 2));
  }
  return result.config;
}

const config = await loadConfig();
const eventBus = new EventEmitter();
let scanner = null;
const eventsBySource = {};
const lastEventAtBySource = {};
const server = createServer({
  demo: isDemo ? createDemo({ crowd: isCrowd, clockSpeed }) : null,
  eventBus,
  presentationMode: config.presentationMode === true,
  lighting: config.lighting === 'day' ? 'day' : 'auto',
  clockSpeed,
  diagnostics: () => ({
    eventsBySource,
    ...(scanner?.diagnostics() ?? {
      watchedFilesBySource: {}, ignoredCountBySource: {}, unknownCountBySource: {}
    })
  }),
  connectivity: () => {
    const scanned = scanner?.connectivity() ?? {};
    const watched = scanner?.diagnostics().watchedFilesBySource ?? {};
    const sources = Object.fromEntries(['claude-code', 'claude-desktop', 'codex', 'antigravity'].map((source) => {
      const rootSource = source === 'claude-desktop' ? 'claude-code' : source;
      const folder = scanned[rootSource]?.folder ?? false;
      const recent = (watched[source] ?? 0) > 0;
      return [source, { folder, recent, lastEventAt: lastEventAtBySource[source] ?? null }];
    }));
    return { sources };
  },
  configureSource: async (source, path) => {
    config.sources ??= {};
    const adapterId = source === 'claude-desktop' ? 'claude-code' : source;
    config.sources[adapterId] = addSourcePath(config.sources[adapterId] ?? {}, path);
    await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));
    await scanner?.configureSource(adapterId, path, config.sources[adapterId]);
  },
  resetSource: async (source) => {
    config.sources ??= {};
    const adapterId = source === 'claude-desktop' ? 'claude-code' : source;
    config.sources[adapterId] = resetSourcePath(config.sources[adapterId] ?? {});
    await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));
    await scanner?.configureSource(adapterId, null, config.sources[adapterId]);
  },
  stateOptions: {
    idleAfterSec: config.idleAfterSec / clockSpeed,
    goneAfterSec: config.goneAfterSec / clockSpeed
  }
});
const port = Number(process.env.AGENT_OFFICE_PORT) || Number(config.port) || 4777;

if (!isDemo) {
  scanner = createScanner({
    adapters: await loadAdapters(),
    sources: config.sources,
    onEvent: (event, metadata) => {
      eventsBySource[event.source] = (eventsBySource[event.source] ?? 0) + 1;
      if (Number.isFinite(event.ts)) lastEventAtBySource[event.source] = Math.max(lastEventAtBySource[event.source] ?? 0, event.ts);
      eventBus.emit('event', event, metadata);
    }
  });
  await scanner.start();
  server.on('close', () => scanner.stop());
}

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`Agent Office listening on http://127.0.0.1:${port}\n`);
});
