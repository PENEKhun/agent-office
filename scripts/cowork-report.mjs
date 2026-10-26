#!/usr/bin/env node
// Cowork 세션이 자기 상태를 Agent Office 인박스에 한 줄 적는다.
// 사용: node scripts/cowork-report.mjs <세션이름> <kind> [도구이름]
//   kind: session_start | turn_start | thinking | tool_start | tool_end | message | turn_end | session_end
// 상태와 도구 이름만 적는다. 프롬프트나 명령 원문은 받지 않는다.
import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { inboxRoot } from '../src/adapters/cowork.js';

const KINDS = new Set(['session_start', 'session_end', 'turn_start', 'turn_end', 'thinking', 'tool_start', 'tool_end', 'message']);
const [session, kind, tool] = process.argv.slice(2);

if (!/^[A-Za-z0-9_-]{1,64}$/.test(session ?? '') || !KINDS.has(kind)) {
  console.error('사용: node scripts/cowork-report.mjs <세션이름> <kind> [도구이름]');
  process.exit(2);
}
if (tool !== undefined && !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(tool)) {
  console.error('도구 이름은 영문, 숫자, 밑줄만 쓴다.');
  process.exit(2);
}

const root = inboxRoot();
await mkdir(root, { recursive: true });
const row = { v: 1, ts: Date.now(), kind, ...(tool ? { tool } : {}) };
await appendFile(join(root, `${session}.jsonl`), `${JSON.stringify(row)}\n`, 'utf8');
