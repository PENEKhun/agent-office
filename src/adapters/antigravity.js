import { readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { detectGitAction, isSearchCommand } from '../lib/git-detect.js';
import { redactCommand, redactFilePath, redactMcpName } from '../lib/redact.js';
import { validateEvent } from '../core/events.js';
import { wslHomes } from '../lib/windows-roots.js';

const DATABASE_INTERVAL_MS = 10000;
const SKIPPED_BRAIN_DIRS = new Set(['scratch', '.user_uploaded', '.tempmediaStorage']);
const IGNORED_ROW_TYPES = new Set(['SYSTEM_MESSAGE', 'CHECKPOINT', 'ERROR_MESSAGE']);

function normalizeProject(value) {
  if (typeof value !== 'string' || !/^(?:[A-Za-z]:[\\/]|\\\\[^\\]+\\[^\\]+)/.test(value)) {
    return null;
  }
  return value.replaceAll('\\', '/').replace(/^([A-Z]):/, (_, drive) => `${drive.toLowerCase()}:`);
}

function workspaceProject(value) {
  if (typeof value !== 'string' || !value) {
    return null;
  }
  let uris;
  try {
    const parsed = JSON.parse(value);
    uris = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    uris = [value];
  }

  for (const uri of uris) {
    if (typeof uri !== 'string') {
      continue;
    }
    try {
      const path = uri.startsWith('file:') ? fileURLToPath(new URL(uri)) : uri;
      const normalized = normalizeProject(path);
      if (normalized) {
        return normalized;
      }
    } catch {
      // 잘못된 URI는 다음 workspace 항목을 확인
    }
  }
  return null;
}

function timestamp(value, now) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return now();
}

function toolDetail(name, args) {
  if (name === 'call_mcp_tool') {
    const server = args.ServerName ?? args.serverName ?? args.server_name;
    const tool = args.ToolName ?? args.toolName ?? args.tool_name;
    return server && tool ? redactMcpName(`mcp__${server}__${tool}`) : 'call_mcp_tool';
  }
  if (name === 'run_command') {
    return redactCommand(args.CommandLine ?? args.command ?? args.command_line);
  }
  if (['read_file', 'view_file', 'write_to_file', 'edit_file', 'replace_file_content'].includes(name)) {
    return redactFilePath(args.Path ?? args.path ?? args.AbsolutePath ?? args.absolute_path ?? args.TargetFile ?? args.target_file);
  }
  return name.slice(0, 40);
}

function toolRoom(name, args) {
  if (name === 'read_file' || name === 'view_file') {
    return 'library';
  }
  if (name === 'run_command') {
    const command = args.CommandLine ?? args.command ?? args.command_line;
    return isSearchCommand(command) ? 'library' : 'server';
  }
  if (name === 'write_to_file' || name === 'edit_file' || name === 'replace_file_content') {
    const filePath = args.TargetFile ?? args.target_file ?? args.Path ?? args.path;
    return typeof filePath === 'string' && basename(filePath).toLowerCase() === 'task.md' ? 'meeting' : 'dev';
  }
  if (name === 'search_web' || name === 'call_mcp_tool' || name.startsWith('mcp_')) {
    return 'search';
  }
  if (name === 'invoke_subagent') {
    return null;
  }
  return 'desk';
}

/** Antigravity 로그와 세션 메타데이터 어댑터 생성 */
export function createAntigravityAdapter({
  home = homedir(),
  now = Date.now,
  databaseFactory = (path) => new DatabaseSync(path, { readOnly: true }),
  readDirectory = readdir
} = {}) {
  const root = join(home, '.gemini', 'antigravity');
  const brainRoot = join(root, 'brain');
  const brainRoots = [brainRoot, ...wslHomes().map((wslHome) => join(wslHome, '.gemini', 'antigravity', 'brain'))];
  const databasePath = join(root, 'conversation_summaries.db');
  const presencePath = join(root, 'presence');
  const metadata = new Map();
  let lastDatabaseReadAt = null;
  let presence = new Map();

  function createSession(filePath, configuredRoot = null) {
    const matchedRoot = [configuredRoot, ...brainRoots].filter(Boolean).find((candidate) => {
      const relativePath = relative(candidate, filePath);
      return relativePath !== '..' && !relativePath.startsWith(`..${sep}`);
    });
    const relativePath = relative(matchedRoot ?? brainRoot, filePath);
    const relativeSession = relativePath.split(sep)[0];
    const sessionId = relativeSession && relativeSession !== '..'
      ? relativeSession : basename(dirname(dirname(dirname(filePath))));
    return {
      sessionId,
      agentId: sessionId,
      project: metadata.get(sessionId)?.project ?? null,
      queue: [],
      started: false,
      ignoredCount: 0,
      unknownCount: 0
    };
  }

  function event(session, kind, ts, values = {}) {
    const result = {
      v: 1,
      source: 'antigravity',
      sessionId: session.sessionId,
      agentId: session.agentId,
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

  function parseLine(session, line) {
    try {
      const row = JSON.parse(line);
      const info = metadata.get(session.sessionId);
      if (info) {
        session.project = info.project;
      }
      if (!row || typeof row !== 'object' || typeof row.type !== 'string') {
        session.unknownCount += 1;
        return [];
      }
      const ts = timestamp(row.created_at, now);
      let events = [];

      if (row.type === 'USER_INPUT') {
        const startEvent = event(session, 'turn_start', ts);
        session.queue.length = 0;
        events = startEvent ? [startEvent] : [];
      } else if (row.type === 'PLANNER_RESPONSE') {
        if (Array.isArray(row.tool_calls) && row.tool_calls.length > 0) {
          for (const call of row.tool_calls) {
            const name = typeof call?.name === 'string' ? call.name : 'unknown';
            const args = call?.args && typeof call.args === 'object' ? call.args : {};
            const kind = name === 'invoke_subagent' ? 'spawn' : 'tool_start';
            const room = kind === 'spawn' ? null : toolRoom(name, args);
            const detail = toolDetail(name, args);
            const command = name === 'run_command'
              ? args.CommandLine ?? args.command ?? args.command_line
              : null;
            const item = { name, kind, room, detail, command };
            session.queue.push(item);
            const startEvent = event(session, kind, ts, {
              tool: name,
              room,
              detail,
              startedAt: ts
            });
            if (startEvent) {
              events.push(startEvent);
            }
          }
        } else if (typeof row.thinking === 'string' && row.thinking.length > 0 &&
          !(typeof row.content === 'string' && row.content.length > 0)) {
          const thinkingEvent = event(session, 'thinking', ts, { detail: '고민 중' });
          events = thinkingEvent ? [thinkingEvent] : [];
        } else if (typeof row.content === 'string' && row.content.length > 0) {
          const messageEvent = event(session, 'message', ts);
          const endEvent = event(session, 'turn_end', ts);
          events = [messageEvent, endEvent].filter(Boolean);
        } else {
          session.unknownCount += 1;
        }
      } else if (row.type === 'GENERIC') {
        const pending = session.queue.shift();
        if (!pending) {
          session.unknownCount += 1;
          return [];
        }
        const match = typeof row.content === 'string' ? row.content.match(/^Command exited with code (\d+)/) : null;
        const endEvent = event(session, pending.kind === 'spawn' ? 'despawn' : 'tool_end', ts, {
          tool: pending.name,
          room: pending.room,
          detail: pending.detail,
          exitCode: match ? Number(match[1]) : null,
          endedAt: ts
        });
        events = endEvent ? [endEvent] : [];
        if (pending.kind !== 'spawn' && match && Number(match[1]) === 0) {
          const action = detectGitAction(pending.command);
          if (action) {
            const gitEvent = event(session, 'git', ts, {
              tool: pending.name,
              room: pending.room,
              detail: pending.detail,
              exitCode: 0,
              git: { action },
              startedAt: null,
              endedAt: ts
            });
            if (gitEvent) events.push(gitEvent);
          }
        }
      } else {
        if (IGNORED_ROW_TYPES.has(row.type)) session.ignoredCount += 1;
        else session.unknownCount += 1;
        return [];
      }

      if (events.length > 0 && !session.started) {
        session.started = true;
        const startEvent = event(session, 'session_start', ts);
        if (startEvent) {
          events.unshift(startEvent);
        }
      }
      return events;
    } catch {
      session.unknownCount += 1;
      return [];
    }
  }

  function refreshMetadata() {
    const at = now();
    if (lastDatabaseReadAt !== null && at - lastDatabaseReadAt < DATABASE_INTERVAL_MS) {
      return;
    }
    lastDatabaseReadAt = at;
    let database;
    try {
      database = databaseFactory(databasePath);
      const rows = database.prepare(
        'SELECT conversation_id, workspace_uris, status FROM conversation_summaries'
      ).all();
      for (const row of rows) {
        if (typeof row.conversation_id === 'string') {
          metadata.set(row.conversation_id, {
            project: workspaceProject(row.workspace_uris),
            status: row.status ?? null
          });
        }
      }
    } catch {
      // DB 누락·잠금·스키마 차이는 다음 주기에 재확인
    } finally {
      database?.close();
    }
  }

  async function poll() {
    refreshMetadata();
    let entries = [];
    try {
      entries = await readDirectory(presencePath, { withFileTypes: true });
    } catch {
      return [];
    }

    const at = now();
    const current = new Map();
    const events = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.lock')) {
        continue;
      }
      const sessionId = entry.name.slice(0, -5);
      const info = metadata.get(sessionId);
      const session = { sessionId, agentId: sessionId, project: info?.project ?? null };
      current.set(sessionId, session);
    }

    for (const [sessionId, session] of presence) {
      if (!current.has(sessionId)) {
        const endEvent = event(session, 'session_end', at);
        if (endEvent) {
          events.push(endEvent);
        }
      }
    }
    presence = current;
    return events;
  }

  return {
    id: 'antigravity',
    roots: () => brainRoots,
    match(filePath, configuredRoot = null) {
      const roots = configuredRoot ? [configuredRoot, ...brainRoots] : brainRoots;
      const relativePath = roots.map((candidate) => relative(candidate, filePath))
        .find((candidate) => candidate !== '..' && !candidate.startsWith(`..${sep}`));
      if (!relativePath) return false;
      const parts = relativePath.split(sep);
      return basename(filePath) === 'transcript.jsonl' && parts.length >= 4 &&
        parts.at(-3) === '.system_generated' && parts.at(-2) === 'logs';
    },
    // 대화 폴더마다 steps·messages·tasks 아래 하위 폴더가 수백 개라 transcript가 있는 logs로만 내려간다
    descend(dirPath) {
      const name = basename(dirPath);
      const parent = basename(dirname(dirPath));
      if (parent === '.system_generated') return name === 'logs';
      if (parent === 'logs' && basename(dirname(dirname(dirPath))) === '.system_generated') return false;
      return !SKIPPED_BRAIN_DIRS.has(name);
    },
    createSession,
    parseLine,
    poll
  };
}

export default createAntigravityAdapter();
