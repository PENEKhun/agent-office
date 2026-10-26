import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, appendFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTail } from '../src/lib/tail.js';

const directories = [];

test.after(async () => {
  await Promise.all(directories.map((directory) => rm(directory, { recursive: true, force: true })));
});

async function makeLog(contents) {
  const directory = await mkdtemp(join(tmpdir(), 'agent-office-tail-'));
  directories.push(directory);
  const filePath = join(directory, 'session.jsonl');
  await writeFile(filePath, contents);
  return filePath;
}

test('holds incomplete lines, normalizes CRLF, and reads appended lines', async () => {
  const filePath = await makeLog('one\r\ntwo');
  const tail = createTail();
  assert.deepEqual(await tail.readNewLines(filePath), ['one']);
  await appendFile(filePath, '\r\nthree\n');
  assert.deepEqual(await tail.readNewLines(filePath), ['two', 'three']);
});

test('restarts from the beginning after truncation', async () => {
  const filePath = await makeLog('long line\n');
  const tail = createTail();
  assert.deepEqual(await tail.readNewLines(filePath), ['long line']);
  await writeFile(filePath, 'x\n');
  assert.deepEqual(await tail.readNewLines(filePath), ['x']);
});

test('decodes a UTF-8 character split across read chunks', async () => {
  const bytes = Buffer.concat([Buffer.alloc(65535, 0x61), Buffer.from('한글\n')]);
  const filePath = await makeLog(bytes);
  const tail = createTail();
  const [line] = await tail.readNewLines(filePath);
  assert.equal(line.endsWith('한글'), true);
});

test('restores only the requested number of completed lines', async () => {
  const filePath = await makeLog('old\nkeep-1\nkeep-2\npartial');
  const tail = createTail();
  assert.deepEqual(await tail.readInitialLines(filePath, 2), ['keep-1', 'keep-2']);
  await appendFile(filePath, '-done\n');
  assert.deepEqual(await tail.readNewLines(filePath), ['partial-done']);
});

test('reads only the final MiB and discards a truncated first line', async () => {
  const contents = Buffer.concat([
    Buffer.alloc(1024 * 1024 + 100, 0x61),
    Buffer.from('\nkeep-1\nkeep-2\n')
  ]);
  const filePath = await makeLog(contents);
  const tail = createTail();
  assert.deepEqual(await tail.readInitialLines(filePath, 10), ['keep-1', 'keep-2']);
});

test('continues discarding a truncated line until its newline arrives', async () => {
  const filePath = await makeLog(Buffer.alloc(1024 * 1024 + 100, 0x61));
  const tail = createTail();
  assert.deepEqual(await tail.readInitialLines(filePath, 10), []);
  await appendFile(filePath, 'still-the-same-line\nnext-line\n');
  assert.deepEqual(await tail.readNewLines(filePath), ['next-line']);
});
