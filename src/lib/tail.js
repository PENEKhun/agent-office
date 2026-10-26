import { open, stat } from 'node:fs/promises';

const INITIAL_READ_BYTES = 1024 * 1024;

function splitCompleteLines(buffer) {
  const lines = [];
  let start = 0;

  for (let index = buffer.indexOf(0x0a); index !== -1; index = buffer.indexOf(0x0a, start)) {
    let line = buffer.subarray(start, index);
    if (line.at(-1) === 0x0d) {
      line = line.subarray(0, -1);
    }
    if (line.length > 0) {
      lines.push(line.toString('utf8'));
    }
    start = index + 1;
  }

  return { lines, remainder: buffer.subarray(start) };
}

/** 파일별 바이트 오프셋을 기억하며 완성된 줄만 읽기 */
export function createTail({ openFile = open, statFile = stat } = {}) {
  const files = new Map();

  async function readInitialLines(filePath, limit = 500) {
    const info = await statFile(filePath);
    const offset = Math.max(0, info.size - INITIAL_READ_BYTES);
    const readLength = info.size - offset;
    let contents = Buffer.alloc(readLength);
    let bytesRead = 0;
    if (readLength > 0) {
      const handle = await openFile(filePath, 'r');
      try {
        ({ bytesRead } = await handle.read(contents, 0, readLength, offset));
      } finally {
        await handle.close();
      }
    }
    contents = contents.subarray(0, bytesRead);
    let discardPartial = offset > 0;
    if (discardPartial) {
      const firstNewline = contents.indexOf(0x0a);
      if (firstNewline === -1) {
        files.set(filePath, { offset: info.size, pending: Buffer.alloc(0), discardPartial: true });
        return [];
      }
      contents = contents.subarray(firstNewline + 1);
      discardPartial = false;
    }
    const { lines, remainder } = splitCompleteLines(contents);
    files.set(filePath, { offset: offset + bytesRead, pending: remainder, discardPartial });
    return lines.slice(-limit);
  }

  async function readNewLines(filePath) {
    const fileInfo = await statFile(filePath);
    let state = files.get(filePath);
    if (!state) {
      state = { offset: 0, pending: Buffer.alloc(0) };
      files.set(filePath, state);
    }
    if (fileInfo.size < state.offset) {
      state.offset = 0;
      state.pending = Buffer.alloc(0);
      state.discardPartial = false;
    }

    if (fileInfo.size === state.offset) {
      return [];
    }

    const handle = await openFile(filePath, 'r');
    const chunks = [];
    let position = state.offset;
    try {
      while (position < fileInfo.size) {
        const chunk = Buffer.alloc(Math.min(64 * 1024, fileInfo.size - position));
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
    let combined = Buffer.concat([state.pending, ...chunks]);
    if (state.discardPartial) {
      const firstNewline = combined.indexOf(0x0a);
      if (firstNewline === -1) {
        state.pending = Buffer.alloc(0);
        return [];
      }
      combined = combined.subarray(firstNewline + 1);
      state.discardPartial = false;
    }
    const { lines, remainder } = splitCompleteLines(combined);
    state.pending = remainder;
    return lines;
  }

  return { readInitialLines, readNewLines };
}
