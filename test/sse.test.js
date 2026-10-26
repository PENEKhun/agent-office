import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { beginSse } from '../src/server/sse.js';

test('sends immediate connection comment and clears the injected ping timer on close', () => {
  const response = new EventEmitter();
  const writes = [];
  const calls = [];
  let statusCode;
  let headers;
  const timer = Symbol('timer');
  response.writeHead = (status, responseHeaders) => {
    statusCode = status;
    headers = responseHeaders;
    calls.push(['writeHead']);
  };
  response.flushHeaders = () => calls.push(['flushHeaders']);
  response.write = (chunk) => writes.push(chunk);
  const cleanup = [];

  beginSse(response, {
    setIntervalFn(callback, delay) {
      cleanup.push(callback);
      assert.equal(delay, 15000);
      return timer;
    },
    clearIntervalFn(value) {
      assert.equal(value, timer);
      calls.push(['clearInterval']);
    }
  });

  assert.deepEqual(calls[0], ['writeHead']);
  assert.equal(statusCode, 200);
  assert.equal(headers['Content-Type'], 'text/event-stream; charset=utf-8');
  assert.deepEqual(calls[1], ['flushHeaders']);
  assert.deepEqual(writes, [': connected\n\n']);
  cleanup[0]();
  assert.deepEqual(writes, [': connected\n\n', ': ping\n\n']);
  response.emit('close');
  assert.deepEqual(calls.at(-1), ['clearInterval']);
});
