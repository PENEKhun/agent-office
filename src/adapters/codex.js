import { homedir } from 'node:os';
import { basename, join, relative, sep } from 'node:path';
import { detectGitAction, isSearchCommand } from '../lib/git-detect.js';
import { redactCommand, redactFilePath, redactMcpName } from '../lib/redact.js';
import { validateEvent } from '../core/events.js';
import { wslHomes } from '../lib/windows-roots.js';

const SHELLS = new Set([
  'bash', 'sh', 'zsh', 'powershell', 'powershell.exe', 'pwsh', 'pwsh.exe', 'cmd', 'cmd.exe'
]);
const SHELL_FLAGS = new Set(['-c', '-lc', '-command', '/c']);
const IGNORED_ROW_TYPES = new Set([
  'response_item', 'token_count', 'token_usage_record', 'turn_context', 'world_state', 'compacted'
]);
const IGNORED_EVENT_TYPES = new Set(['token_count', 'thread_settings_applied', 'turn_aborted']);

function sessionsRoot() {
  return join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'sessions');
}

function defaultRoots() {
  return [sessionsRoot(), ...wslHomes().map((home) => join(home, '.codex', 'sessions'))];
}

function normalizeProject(value) {
  if (typeof value !== 'string' || !/^(?:[A-Za-z]:[\\/]|\\\\[^\\]+\\[^\\]+)/.test(value)) {
    return null;
  }
  return value.replaceAll('\\', '/').replace(/^([A-Z]):/, (_, drive) => `${drive.toLowerCase()}:`);
}

function eventTimestamp(value, fallback) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback();
}

function numericTimestamp(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function commandParts(command) {
  if (typeof command === 'string') {
    return [command];
  }
  return Array.isArray(command) ? command.filter((part) => typeof part === 'string') : [];
}

function commandText(command) {
  return commandParts(command).join(' ');
}

function scriptText(command) {
  const parts = commandParts(command);
  const shell = parts[0]?.replaceAll('\\', '/').split('/').at(-1)?.toLowerCase();
  const flag = parts[1]?.toLowerCase();
  if (SHELLS.has(shell) && SHELL_FLAGS.has(flag) && parts.length > 2) {
    return parts.slice(2).join(' ');
  }
  return commandText(command);
}

function commandDetail(command) {
  const value = redactCommand(scriptText(command));
  return value && /[\\/]/.test(value) ? redactFilePath(value) : value;
}

function isSearchExecution(command) {
  return isSearchCommand(scriptText(command));
}

function makeEvent(session, kind, ts, values = {}) {
  const result = {
    v: 1,
    source: 'codex',
    sessionId: session.sessionId,
    agentId: session.sessionId,
    parentAgentId: null,
    project: session.project,
    title: null,
    kind,
    tool: null,
    room: null,
    detail: null,
    exitCode: null,
    git: null,
    ts,
    startedAt: null,
    endedAt: null,
    live: true,
    ...values
  };
  return validateEvent(result) ? result : null;
}

function parseCompletedItem(session, item, payload, ts) {
  if (!item || typeof item.type !== 'string') {
    session.unknownCount += 1;
    return [];
  }
  const completedAt = numericTimestamp(payload.completed_at_ms) ?? ts;
  const startedAt = numericTimestamp(payload.started_at_ms);

  if (item.type === 'CommandExecution') {
    const command = scriptText(item.command);
    const room = isSearchExecution(item.command) ? 'library' : 'server';
    const detail = commandDetail(item.command);
    const tool = 'CommandExecution';
    const start = makeEvent(session, 'tool_start', startedAt ?? ts, {
      tool, room, detail, startedAt: startedAt ?? ts
    });
    const end = makeEvent(session, 'tool_end', completedAt, {
      tool,
      room,
      detail,
      exitCode: typeof item.exit_code === 'number' && Number.isFinite(item.exit_code) ? item.exit_code : null,
      startedAt,
      endedAt: completedAt
    });
    const events = [start, end].filter(Boolean);
    if (item.exit_code === 0 && command) {
      const action = detectGitAction(command);
      if (action) {
        const git = makeEvent(session, 'git', completedAt, {
          tool,
          room,
          detail,
          exitCode: 0,
          git: { action },
          startedAt,
          endedAt: completedAt
        });
        if (git) {
          events.push(git);
        }
      }
    }
    return events;
  }

  if (item.type === 'FileChange') {
    const changes = Array.isArray(item.changes) ? item.changes : [];
    return changes.map((change) => {
      const filePath = typeof change === 'string'
        ? change
        : change?.path ?? change?.file_path ?? change?.filePath;
      return makeEvent(session, 'tool_end', completedAt, {
        tool: 'FileChange',
        room: 'dev',
        detail: redactFilePath(filePath),
        endedAt: completedAt
      });
    }).filter(Boolean);
  }

  if (item.type === 'McpToolCall') {
    const server = typeof item.server === 'string' ? item.server : null;
    const name = typeof item.tool === 'string' ? item.tool : null;
    const label = server && name ? redactMcpName(`${server}/${name}`) : 'MCP';
    return [makeEvent(session, 'tool_end', completedAt, {
      tool: label,
      room: 'search',
      detail: label,
      endedAt: completedAt
    })].filter(Boolean);
  }

  if (item.type === 'Extension') {
    return [makeEvent(session, 'tool_end', completedAt, {
      tool: 'Extension',
      room: 'search',
      detail: 'Extension',
      endedAt: completedAt
    })].filter(Boolean);
  }

  if (item.type === 'Reasoning') {
    return [makeEvent(session, 'thinking', completedAt, { detail: '고민 중' })].filter(Boolean);
  }

  if (item.type === 'AgentMessage') {
    return [makeEvent(session, 'message', completedAt)].filter(Boolean);
  }

  session.unknownCount += 1;
  return [];
}

/** Codex rollout JSONL 어댑터 생성 */
export function createCodexAdapter({ roots = defaultRoots, now = Date.now } = {}) {
  function createSession(filePath) {
    const filename = basename(filePath, '.jsonl');
    const sessionId = filename.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)?.[0] ?? filename;
    return {
      sessionId,
      project: null,
      ignoredCount: 0,
      unknownCount: 0
    };
  }

  function primeSession(session, firstLine) {
    if (typeof firstLine !== 'string') {
      return;
    }
    try {
      const row = JSON.parse(firstLine);
      if (row?.type === 'session_meta' && row.payload && typeof row.payload === 'object') {
        session.project = normalizeProject(row.payload.cwd);
      }
    } catch {
      session.unknownCount += 1;
    }
  }

  function parseLine(session, line) {
    try {
      const row = JSON.parse(line);
      if (!row || typeof row !== 'object' || typeof row.type !== 'string') {
        session.unknownCount += 1;
        return [];
      }
      const payload = row.payload && typeof row.payload === 'object' ? row.payload : {};
      const ts = eventTimestamp(row.timestamp, now);

      if (IGNORED_ROW_TYPES.has(row.type) || IGNORED_EVENT_TYPES.has(payload.type)) {
        session.ignoredCount += 1;
        return [];
      }

      if (row.type === 'session_meta') {
        session.project = normalizeProject(payload.cwd);
        const start = makeEvent(session, 'session_start', ts);
        return start ? [start] : [];
      }

      if (row.type !== 'event_msg' || typeof payload.type !== 'string') {
        session.unknownCount += 1;
        return [];
      }

      if (payload.type === 'task_started') {
        const start = makeEvent(session, 'turn_start', ts);
        return start ? [start] : [];
      }
      if (payload.type === 'task_complete') {
        const end = makeEvent(session, 'turn_end', ts);
        return end ? [end] : [];
      }
      if (payload.type === 'item_completed') {
        return parseCompletedItem(session, payload.item, payload, ts);
      }

      session.unknownCount += 1;
      return [];
    } catch {
      session.unknownCount += 1;
      return [];
    }
  }

  return {
    id: 'codex',
    roots,
    match(filePath, configuredRoot = null) {
      if (!filePath.endsWith('.jsonl') || !basename(filePath).startsWith('rollout-')) {
        return false;
      }
      return [configuredRoot, ...roots()].filter(Boolean).some((root) => {
        const relativePath = relative(root, filePath);
        return relativePath !== '' && relativePath !== '..' && !relativePath.startsWith(`..${sep}`);
      });
    },
    createSession,
    primeSession,
    parseLine
  };
}

export default createCodexAdapter();
