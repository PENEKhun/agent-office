import { homedir } from 'node:os';
import { basename, join, relative, sep } from 'node:path';
import { validateEvent } from '../core/events.js';
import { toolRoom } from './claude-code.js';

// Cowork(클라우드에서 도는 Claude)는 PC에 로그를 남기지 않는다.
// 대신 세션이 직접 상태 한 줄씩을 인박스 파일에 적고, 이 어댑터가 그 줄을 읽는다.
// 한 줄 형식: {"v":1,"ts":<ms>,"kind":"turn_start","tool":"Bash"}
// 받는 값은 kind, tool, ts뿐이다. 프롬프트나 명령 원문이 들어올 자리가 없다.

const KINDS = new Set(['session_start', 'session_end', 'turn_start', 'turn_end', 'thinking', 'tool_start', 'tool_end', 'message']);
const TOOL_NAME = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
const SESSION_FILE = /^[A-Za-z0-9_-]{1,64}\.jsonl$/;

export function inboxRoot(env = process.env) {
  if (env.AGENT_OFFICE_INBOX) return env.AGENT_OFFICE_INBOX;
  if (env.LOCALAPPDATA) return join(env.LOCALAPPDATA, 'AgentOffice', 'inbox');
  return join(homedir(), '.agent-office', 'inbox');
}

// mcp__서버__도구 같은 이름은 서버 이름이 드러나지 않게 mcp로 줄인다
function safeTool(value) {
  if (typeof value !== 'string') return null;
  if (value.startsWith('mcp__')) return 'mcp';
  return TOOL_NAME.test(value) ? value : null;
}

function roomFor(kind, tool) {
  if (kind === 'session_start' || kind === 'session_end') return 'elevator';
  if (kind === 'thinking') return 'meeting';
  if (!tool) return null;
  if (tool === 'mcp') return 'search';
  return toolRoom(tool, '');
}

export function createCoworkAdapter({ roots = () => [inboxRoot()], now = Date.now } = {}) {
  function createSession(filePath) {
    const sessionId = `cowork-${basename(filePath, '.jsonl')}`;
    return { sessionId, project: null, ignoredCount: 0, unknownCount: 0 };
  }

  function parseLine(session, line) {
    try {
      const row = JSON.parse(line);
      if (!row || typeof row !== 'object' || row.v !== 1 || !KINDS.has(row.kind)) {
        session.unknownCount += 1;
        return [];
      }
      const ts = typeof row.ts === 'number' && Number.isFinite(row.ts) ? row.ts : now();
      const tool = row.kind.startsWith('tool_') ? safeTool(row.tool) : null;
      const event = {
        v: 1,
        source: 'cowork',
        sessionId: session.sessionId,
        agentId: session.sessionId,
        parentAgentId: null,
        project: session.project,
        title: null,
        kind: row.kind,
        tool,
        room: roomFor(row.kind, tool),
        detail: null,
        exitCode: null,
        git: null,
        ts,
        startedAt: row.kind === 'tool_start' ? ts : null,
        endedAt: row.kind === 'tool_end' ? ts : null,
        live: true
      };
      if (!validateEvent(event)) {
        session.unknownCount += 1;
        return [];
      }
      return [event];
    } catch {
      session.unknownCount += 1;
      return [];
    }
  }

  return {
    id: 'cowork',
    roots,
    readNewFilesFromStart: true,
    match(filePath, configuredRoot = null) {
      if (!SESSION_FILE.test(basename(filePath))) return false;
      return [configuredRoot, ...roots()].filter(Boolean).some((root) => {
        const relativePath = relative(root, filePath);
        return relativePath !== '' && relativePath !== '..' && !relativePath.startsWith(`..${sep}`) && !relativePath.includes(sep);
      });
    },
    createSession,
    parseLine
  };
}

export default createCoworkAdapter();
