import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createServer } from '../src/server/http.js';

test('state endpoint, debug page, and SSE snapshot expose live office state', async (context) => {
  const events = new EventEmitter();
  const server = createServer({ demo: null, eventBus: events, lighting: 'day', clockSpeed: 3,
    diagnostics: () => ({ eventsBySource: { codex: 4 }, ignoredCountBySource: { codex: 1 },
      unknownCountBySource: { codex: 1 } }),
    stateOptions: { now: () => 1000 } });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const event = {
    v: 1, source: 'codex', sessionId: 's', agentId: 's', parentAgentId: null,
    project: 'C:/work/demo', title: 'Private session', kind: 'session_start', tool: null, room: null,
    detail: 'Private detail', exitCode: null, git: null, ts: 1000, startedAt: null, endedAt: null, live: true
  };
  events.emit('event', event, { restored: true });
  const response = await fetch(`${base}/api/state`);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).floors[0].agents[0].status, 'arriving');
  assert.match(await fetch(`${base}/pip-controller.js`).then((result) => result.text()), /installPipController/);
  const widget = await fetch(`${base}/widget`);
  assert.equal(widget.status, 200);
  const widgetHtml = await widget.text();
  assert.match(widgetHtml, /id="pip-office"/);
  assert.match(widgetHtml, /id="settings-close"/);
  assert.match(widgetHtml, /role="dialog" aria-modal="false"/);
  assert.match(widgetHtml, /id="widget-settings-title"/);
  assert.doesNotMatch(widgetHtml, /id="settings-view"|id="settings-opacity"/);
  assert.doesNotMatch(widgetHtml, /id="connection-back"/);
  const widgetView = await fetch(`${base}/widget-view.js`).then((result) => result.text());
  for (const button of ['widget-mode-button', 'widget-theme-button', 'widget-rotate-button', 'widget-opacity-button', 'widget-pin-button', 'widget-settings-button', 'widget-close-button']) {
    assert.ok(widgetView.includes(button), `missing toolbar button ${button}`);
  }
  assert.match(widgetView, /toolbarLabelsVisible/);
  assert.match(widgetView, /user-select:none/);
  assert.match(await fetch(`${base}/mini-render.js`).then((result) => result.text()), /renderMini/);
  assert.match(await fetch(`${base}/office-activity.js`).then((result) => result.text()), /activityOf/);
  assert.match(await fetch(`${base}/design-activity.html`).then((result) => result.text()), /drawActor/);
  const settings = await fetch(`${base}/api/settings`).then((result) => result.json());
  assert.deepEqual(settings, { lighting: 'day', clockSpeed: 3, presentationMode: false });
  assert.deepEqual(await fetch(`${base}/api/diagnostics`).then((result) => result.json()), {
    eventsBySource: { codex: 4 }, ignoredCountBySource: { codex: 1 }, unknownCountBySource: { codex: 1 }
  });
  const diagnosticsWrongMethod = await fetch(`${base}/api/diagnostics`, { method: 'POST' });
  assert.equal(diagnosticsWrongMethod.status, 405);
  assert.equal(diagnosticsWrongMethod.headers.get('allow'), 'GET');
  const wrongMethod = await fetch(`${base}/api/presentation`);
  assert.equal(wrongMethod.status, 405);
  const invalidMode = await fetch(`${base}/api/presentation`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ presentationMode: 'yes' })
  });
  assert.equal(invalidMode.status, 400);
  const enabled = await fetch(`${base}/api/presentation`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ presentationMode: true })
  });
  assert.deepEqual(await enabled.json(), { presentationMode: true });
  const privateState = await fetch(`${base}/api/state`).then((result) => result.json());
  assert.equal(privateState.floors[0].name, 'Project A');
  assert.equal(privateState.floors[0].agents[0].title, '작업 중');
  assert.equal(privateState.activity[0].detail, null);
  const debug = await fetch(`${base}/debug`);
  assert.match(await debug.text(), /빈 서브에이전트 슬롯/);
  const index = await fetch(base);
  const indexHtml = await index.text();
  assert.match(indexHtml, /id="map-host"/);
  assert.match(indexHtml, /id="presentation-toggle"/);
  const mini = await fetch(`${base}/mini`);
  assert.match(mini.headers.get('content-type'), /text\/html/);
  assert.match(await mini.text(), /mini\.js/);
  assert.equal((await fetch(`${base}/mini.js`)).status, 200);
  const pixi = await fetch(`${base}/vendor/pixi.min.js`);
  assert.equal(pixi.status, 200);
  assert.match(pixi.headers.get('content-type'), /javascript/);
  for (const moduleName of ['office-art.js', 'glyphs.js', 'agent-appearance.js', 'arrival-policy.js', 'lighting.js', 'office-effects.js', 'floor-plan.js', 'labels.js', 'office-panels.js', 'idle-behavior.js', 'label-policy.js', 'label-visuals.js', 'delivery-queue.js', 'widget-view.js', 'widget-settings.js', 'widget-opacity.js']) {
    const module = await fetch(`${base}/${moduleName}`);
    assert.equal(module.status, 200);
    assert.match(module.headers.get('content-type'), /javascript/);
  }
  for (const themeModule of ['restaurant.js', 'restaurant-furniture-library.js', 'restaurant-furniture-kitchen.js', 'restaurant-furniture-front.js']) {
    assert.equal((await fetch(`${base}/themes/${themeModule}`)).status, 200);
  }
  const preview = await fetch(`${base}/design-preview.html`);
  assert.equal(preview.status, 200);
  assert.match(await preview.text(), /office-art\.js/);
  const personality = await fetch(`${base}/personality.json`);
  assert.equal(personality.status, 200);
  assert.equal((await personality.json()).codex.idleSpots.coffee, 3);
  for (const icon of ['anthropic', 'openai', 'googlegemini']) {
    const asset = await fetch(`${base}/assets/icons/${icon}.svg`);
    assert.equal(asset.status, 200);
    assert.match(await asset.text(), /<svg/);
  }

  const stream = await fetch(`${base}/events`);
  const reader = stream.body.getReader();
  const firstChunk = new TextDecoder().decode((await reader.read()).value);
  assert.match(firstChunk, /event: snapshot/);
  await reader.cancel();
});

test('connection check reports source availability and accepts a selected local folder', async (context) => {
  let selection;
  let reset;
  const server = createServer({
    demo: null,
    connectivity: () => ({ sources: {
      'claude-code': { folder: true, recent: false, lastEventAt: null },
      'claude-desktop': { folder: true, recent: true, lastEventAt: 1_797_000_000_000 },
      codex: { folder: false, recent: false, lastEventAt: null }
    } }),
    configureSource: async (source, path) => { selection = { source, path }; },
    resetSource: async (source) => { reset = source; }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.deepEqual(await fetch(`${base}/api/connectivity`).then((response) => response.json()), {
    sources: {
      'claude-code': { folder: true, recent: false, lastEventAt: null },
      'claude-desktop': { folder: true, recent: true, lastEventAt: 1_797_000_000_000 },
      codex: { folder: false, recent: false, lastEventAt: null }
    }
  });
  const suggestion = await fetch(`${base}/api/sources`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: 'codex', path: 'C:/Users/test/.codex', suggest: true })
  });
  assert.deepEqual(await suggestion.json(), { suggestion: 'C:/Users/test/.codex/sessions' });
  assert.equal(selection, undefined);
  const response = await fetch(`${base}/api/sources`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: 'codex', path: 'C:/Users/test/.codex/sessions' })
  });
  assert.equal(response.status, 200);
  assert.deepEqual(selection, { source: 'codex', path: 'C:/Users/test/.codex/sessions' });
  const resetResponse = await fetch(`${base}/api/sources`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: 'codex', reset: true })
  });
  assert.equal(resetResponse.status, 200);
  assert.equal(reset, 'codex');
});
