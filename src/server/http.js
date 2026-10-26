import { createServer as createHttpServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { beginSse, sendSse } from './sse.js';
import { createState } from '../core/state.js';
import { suggestSourcePath } from './config.js';

const PUBLIC_FILES = new Map([
  ['/','index.html'],
  ['/mini','mini.html'],
  ['/widget','widget.html'],
  ['/widget-view.js','widget-view.js'],
  ['/widget-settings.js','widget-settings.js'],
    ['/widget-opacity.js','widget-opacity.js'],
  ['/mini.js','mini.js'],
  ['/mini-render.js','mini-render.js'],
  ['/pip-controller.js','pip-controller.js'],
  ['/debug','debug.html'],
  ['/office.js','office.js'],
  ['/glyphs.js','glyphs.js'],
  ['/themes/index.js','themes/index.js'],
  ['/themes/office.js','themes/office.js'],
  ['/themes/space.js','themes/space.js'],
  ['/themes/restaurant.js','themes/restaurant.js'],
  ['/themes/restaurant-furniture-library.js','themes/restaurant-furniture-library.js'],
  ['/themes/restaurant-furniture-kitchen.js','themes/restaurant-furniture-kitchen.js'],
  ['/themes/restaurant-furniture-front.js','themes/restaurant-furniture-front.js'],
  ['/themes/space-furniture-command.js','themes/space-furniture-command.js'],
  ['/themes/space-furniture-systems.js','themes/space-furniture-systems.js'],
  ['/themes/space-furniture-observatory.js','themes/space-furniture-observatory.js'],
  ['/themes/space-walls.js','themes/space-walls.js'],
  ['/office-art-primitives.js','office-art-primitives.js'],
  ['/office-art-shapes.js','office-art-shapes.js'],
  ['/office-art-walls.js','office-art-walls.js'],
  ['/office-art.js','office-art.js'],
  ['/office-activity.js','office-activity.js'],
  ['/agent-appearance.js','agent-appearance.js'],
  ['/arrival-policy.js','arrival-policy.js'],
  ['/lighting.js','lighting.js'],
  ['/office-effects.js','office-effects.js'],
  ['/floor-plan.js','floor-plan.js'],
  ['/labels.js','labels.js'],
  ['/office-panels.js','office-panels.js'],
  ['/idle-behavior.js','idle-behavior.js'],
  ['/label-policy.js','label-policy.js'],
  ['/card-placement.js','card-placement.js'],
  ['/label-visuals.js','label-visuals.js'],
  ['/movement-queue.js','movement-queue.js'],
  ['/delivery-queue.js','delivery-queue.js'],
  ['/design-preview.html','design-preview.html'],
  ['/design-activity.html','design-activity.html'],
  ['/vendor/pixi.min.js','vendor/pixi.min.js'],
  ['/assets/icons/anthropic.svg','assets/icons/anthropic.svg'],
  ['/assets/icons/openai.svg','assets/icons/openai.svg'],
  ['/assets/icons/googlegemini.svg','assets/icons/googlegemini.svg'],
  ['/assets/icons/opencode.svg','assets/icons/opencode.svg']
]);

function contentType(pathname) {
  if (pathname.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (pathname.endsWith('.svg')) return 'image/svg+xml';
  return 'text/html; charset=utf-8';
}

function isLoopback(request) {
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress);
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1024) throw new Error('Request body is too large.');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

/** 데모 이벤트를 제공하는 HTTP 서버 생성 */
export function createServer({
  demo,
  eventBus = null,
  state = null,
  presentationMode = false,
  lighting = 'auto',
  clockSpeed = 1,
  diagnostics = () => ({}),
  connectivity = () => ({}),
  configureSource = async () => {},
  resetSource = async () => {},
  stateOptions = {},
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
  tickIntervalMs = 1000
}) {
  const officeState = state ?? createState(stateOptions);
  const clients = new Set();
  let stopDemo = null;
  let currentPresentationMode = presentationMode;
  const currentSnapshot = () => officeState.snapshot({ presentationMode: currentPresentationMode });
  const publish = (event, metadata = {}) => {
    officeState.apply(event);
    if (metadata?.restored) return;
    const delta = currentSnapshot();
    for (const client of clients) {
      sendSse(client, 'delta', delta);
    }
  };

  if (demo) {
    stopDemo = demo.subscribe(publish);
  }
  if (eventBus) {
    eventBus.on('event', publish);
  }
  const stateTimer = setIntervalFn(() => {
    const delta = officeState.tick?.({ presentationMode: currentPresentationMode });
    if (!delta) return;
    for (const client of clients) sendSse(client, 'delta', delta);
  }, tickIntervalMs);

  const server = createHttpServer((request, response) => {
    const pathname = new URL(request.url, 'http://127.0.0.1').pathname;

    if (pathname === '/events') {
      if (!demo && !eventBus) {
        response.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Demo stream is disabled. Start with --demo.\n');
        return;
      }

      beginSse(response);
      const removeClient = () => clients.delete(response);
      clients.add(response);
      sendSse(response, 'snapshot', currentSnapshot());
      response.on('close', removeClient);
      return;
    }

    if (pathname === '/api/state') {
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify(currentSnapshot()));
      return;
    }

    if (pathname === '/api/settings') {
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({ lighting, clockSpeed, presentationMode: currentPresentationMode }));
      return;
    }

    if (pathname === '/api/diagnostics') {
      if (request.method !== 'GET') {
        response.writeHead(405, { Allow: 'GET', 'Content-Type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify({ error: 'Method not allowed.' }));
        return;
      }
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify(diagnostics()));
      return;
    }

    if (pathname === '/api/connectivity') {
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify(connectivity()));
      return;
    }

    if (pathname === '/api/sources') {
      if (request.method !== 'POST' || !isLoopback(request)) {
        response.writeHead(request.method === 'POST' ? 403 : 405, { Allow: 'POST', 'Content-Type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify({ error: 'Loopback POST requests only.' }));
        return;
      }
      readJsonBody(request).then(async (body) => {
        const allowed = ['claude-code', 'claude-desktop', 'codex', 'antigravity', 'opencode'];
        if (!allowed.includes(body?.source)) {
          response.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          response.end(JSON.stringify({ error: 'A supported source is required.' }));
          return;
        }
        if (body.reset === true) {
          await resetSource(body.source);
          response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          response.end(JSON.stringify({ ok: true }));
          return;
        }
        if (typeof body.path !== 'string' || !body.path.trim()) {
          response.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          response.end(JSON.stringify({ error: 'A folder path is required.' }));
          return;
        }
        const path = body.path.trim();
        if (body.suggest === true) {
          response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          response.end(JSON.stringify({ suggestion: suggestSourcePath(body.source, path) }));
          return;
        }
        await configureSource(body.source, path);
        response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify({ ok: true }));
      }).catch(() => {
        response.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify({ error: 'Invalid source configuration.' }));
      });
      return;
    }

    if (pathname === '/api/presentation') {
      if (request.method !== 'POST') {
        response.writeHead(405, { Allow: 'POST', 'Content-Type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify({ error: 'Method not allowed.' }));
        return;
      }
      if (!isLoopback(request)) {
        response.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify({ error: 'Loopback requests only.' }));
        return;
      }
      readJsonBody(request).then((body) => {
        if (typeof body?.presentationMode !== 'boolean') {
          response.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          response.end(JSON.stringify({ error: 'presentationMode must be a boolean.' }));
          return;
        }
        currentPresentationMode = body.presentationMode;
        const snapshot = currentSnapshot();
        for (const client of clients) sendSse(client, 'snapshot', snapshot);
        response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        response.end(JSON.stringify({ presentationMode: currentPresentationMode }));
      }).catch((error) => {
        const status = error instanceof SyntaxError ? 400 : error.message === 'Request body is too large.' ? 413 : 400;
        response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify({ error: status === 413 ? 'Request body is too large.' : 'Invalid JSON body.' }));
      });
      return;
    }

    if (pathname === '/personality.json') {
      readFile(new URL('../core/personality.json', import.meta.url), 'utf8').then((contents) => {
        response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' });
        response.end(contents);
      }).catch(() => {
        response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Not found\n');
      });
      return;
    }

    if (pathname === '/debug') {
      readFile(new URL('../../public/debug.html', import.meta.url), 'utf8').then((html) => {
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        response.end(html);
      }).catch(() => {
        response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Debug page not found\n');
      });
      return;
    }

    const publicFile = PUBLIC_FILES.get(pathname);
    if (publicFile) {
      const isBinary = publicFile.endsWith('.png');
      readFile(new URL(`../../public/${publicFile}`, import.meta.url), isBinary ? undefined : 'utf8').then((contents) => {
        response.writeHead(200, { 'Content-Type': contentType(pathname), 'Cache-Control': 'no-cache' });
        response.end(contents);
      }).catch(() => {
        response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Not found\n');
      });
      return;
    }

    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found\n');
  });

  server.on('close', () => {
    clearIntervalFn(stateTimer);
    stopDemo?.();
    eventBus?.off('event', publish);
  });
  return server;
}
