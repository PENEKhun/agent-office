import { basename, dirname, extname, join, relative, sep } from 'node:path';
import { homedir } from 'node:os';
import { detectGitAction, isSearchCommand } from '../lib/git-detect.js';
import { redactCommand, redactFilePath, redactMcpName } from '../lib/redact.js';
import { validateEvent } from '../core/events.js';
import { wslHomes } from '../lib/windows-roots.js';

const SKIPPED_DESKTOP_DIRS = new Set(['outputs', 'uploads', 'uploads-tmp']);
const FILE_TOOLS = new Set(['Read', 'Grep', 'Glob', 'LS', 'NotebookRead']);
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

function normalizeProject(project) {
  if (typeof project !== 'string' || !/^(?:[A-Za-z]:[\\/]|\\\\[^\\]+\\[^\\]+)/.test(project)) {
    return null;
  }
  return project.replaceAll('\\', '/').replace(/^([A-Z]):/, (_, drive) => `${drive.toLowerCase()}:`);
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

export function toolRoom(tool, command) {
  if (FILE_TOOLS.has(tool)) {
    return 'library';
  }
  if (EDIT_TOOLS.has(tool)) {
    return 'dev';
  }
  if (tool === 'Bash' || tool === 'BashOutput') {
    return isSearchCommand(command) ? 'library' : 'server';
  }
  if (/^(WebSearch|WebFetch)$/.test(tool) || tool.startsWith('mcp__')) {
    return 'search';
  }
  if (/^(TodoWrite|ExitPlanMode)$/.test(tool)) {
    return 'meeting';
  }
  return 'desk';
}

function toolDetail(tool, input) {
  if (FILE_TOOLS.has(tool) || EDIT_TOOLS.has(tool)) {
    return redactFilePath(input?.file_path ?? input?.path ?? input?.notebook_path);
  }
  if (tool === 'Bash' || tool === 'BashOutput') {
    return redactCommand(input?.command);
  }
  if (tool.startsWith('mcp__')) {
    return redactMcpName(tool);
  }
  return tool.slice(0, 40);
}

function projectRoot() {
  return join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), 'projects');
}

function defaultRoots() {
  return [projectRoot(), ...(process.env.APPDATA ? [join(process.env.APPDATA, 'Claude', 'local-agent-mode-sessions')] : []),
    ...wslHomes().map((home) => join(home, '.claude', 'projects'))];
}

/** Claude Code 계열 JSONL 어댑터 생성 */
export function createClaudeCodeAdapter({
  now = Date.now,
  roots = defaultRoots,
  desktopRoot = () => process.env.APPDATA ? join(process.env.APPDATA, 'Claude', 'local-agent-mode-sessions') : null
} = {}) {
  function createSession(filePath, _root = null, sourceConfig = {}) {
    const fileAgentId = basename(filePath, extname(filePath));
    const isSubagentFile = filePath.split(/[\\/]/).includes('subagents');
    const sessionId = fileAgentId;
    return {
      sessionId,
      fileAgentId,
      agentId: fileAgentId,
      parentAgentId: null,
      project: null,
      source: sourceConfig.forceSource ?? (isDesktopSession(filePath) ? 'claude-desktop' : 'claude-code'),
      forceSource: sourceConfig.forceSource ?? null,
      started: false,
      isSidechain: isSubagentFile,
      isSubagentFile,
      toolCalls: new Map(),
      ignoredCount: 0,
      unknownCount: 0
    };
  }

  function isDesktopSession(filePath) {
    const root = desktopRoot();
    if (!root) {
      return false;
    }
    const relativePath = relative(root, filePath);
    return relativePath !== '' && relativePath !== '..' && !relativePath.startsWith(`..${sep}`);
  }

  function makeEvent(session, kind, ts, values = {}) {
    const sidechain = session.isSidechain;
    const event = {
      v: 1,
      source: session.source,
      sessionId: session.sessionId,
      agentId: session.agentId,
      parentAgentId: sidechain ? session.sessionId : session.parentAgentId,
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
    return validateEvent(event) ? event : null;
  }

  function parseLine(session, line) {
    try {
      const row = JSON.parse(line);
      if (!row || !['user', 'assistant'].includes(row.type) || !row.message || !Array.isArray(row.message.content)) {
        session.unknownCount += 1;
        return [];
      }

      if (session.forceSource !== null) {
        session.source = session.forceSource;
      } else if (Object.hasOwn(row, 'entrypoint')) {
        session.source = row.entrypoint === 'claude-desktop' ? 'claude-desktop' : 'claude-code';
      }

      if (typeof row.sessionId === 'string' && row.sessionId) {
        session.sessionId = row.sessionId;
      }
      if (typeof row.cwd === 'string') {
        session.project = normalizeProject(row.cwd);
      }
      session.isSidechain = session.isSubagentFile || row.isSidechain === true ||
        (typeof row.agentId === 'string' && row.agentId !== session.sessionId);
      if (session.isSidechain) {
        session.agentId = typeof row.agentId === 'string' && row.agentId ? row.agentId : session.fileAgentId;
      } else {
        session.agentId = typeof row.agentId === 'string' && row.agentId ? row.agentId : session.sessionId;
      }
      session.parentAgentId = session.isSidechain
        ? (typeof row.parentAgentId === 'string' ? row.parentAgentId : session.sessionId)
        : null;
      const ts = timestamp(row.timestamp, now);
      const events = [];

      if (!session.started) {
        session.started = true;
        const startEvent = makeEvent(session, 'session_start', ts);
        if (startEvent) {
          events.push(startEvent);
        }
      }

      for (const block of row.message.content) {
        if (block?.type === 'tool_use') {
          const name = typeof block.name === 'string' ? block.name : 'unknown';
          const input = block.input && typeof block.input === 'object' ? block.input : {};
          const command = name === 'Bash' && typeof input.command === 'string' ? input.command : null;
          const kind = name === 'Task' || name === 'Agent' ? 'spawn' : 'tool_start';
          const detail = toolDetail(name, input);
          const event = makeEvent(session, kind, ts, {
            tool: name,
            room: kind === 'spawn' ? 'elevator' : toolRoom(name, command),
            detail,
            startedAt: ts
          });
          if (event) {
            events.push(event);
          }
          if (typeof block.id === 'string') {
            session.toolCalls.set(block.id, { name, kind, command, room: event?.room ?? null, detail });
          }
          continue;
        }

        if (block?.type === 'tool_result') {
          const pending = session.toolCalls.get(block.tool_use_id);
          const isError = block.is_error === true;
          const exitCode = isError ? 1 : 0;
          const event = makeEvent(session, pending?.kind === 'spawn' ? 'despawn' : 'tool_end', ts, {
            tool: pending?.name ?? 'unknown',
            room: pending?.room ?? null,
            detail: pending?.detail ?? null,
            exitCode,
            endedAt: ts
          });
          if (event) {
            events.push(event);
          }
          if (pending?.command && !isError) {
            const action = detectGitAction(pending.command);
            if (action) {
              const gitEvent = makeEvent(session, 'git', ts, {
                tool: pending.name,
                room: 'server',
                detail: redactCommand(pending.command),
                exitCode: 0,
                git: { action },
                startedAt: ts,
                endedAt: ts
              });
              if (gitEvent) {
                events.push(gitEvent);
              }
            }
          }
          session.toolCalls.delete(block.tool_use_id);
          continue;
        }

        if (block?.type === 'thinking') {
          const event = makeEvent(session, 'thinking', ts, { detail: '고민 중' });
          if (event) {
            events.push(event);
          }
          continue;
        }

        if (block?.type === 'text') {
          const kind = row.type === 'user' ? 'turn_start' : 'message';
          const event = makeEvent(session, kind, ts);
          if (event) {
            events.push(event);
          }
          continue;
        }
        session.unknownCount += 1;
      }

      return events;
    } catch {
      session.unknownCount += 1;
      return [];
    }
  }

  return {
    id: 'claude-code',
    roots,
    match(filePath, configuredRoot = null) {
      if (!filePath.endsWith('.jsonl')) {
        return false;
      }
      return [configuredRoot, ...roots()].filter(Boolean).some((root) => {
        const relativePath = relative(root, filePath);
        return relativePath !== '' && !relativePath.startsWith(`..${sep}`) && relativePath !== '..';
      });
    },
    // Desktop 세션 폴더의 업로드·산출물과 .claude 아래 스킬·플러그인에는 세션 로그가 없다
    descend(dirPath) {
      if (!isDesktopSession(dirPath)) return true;
      const name = basename(dirPath);
      if (SKIPPED_DESKTOP_DIRS.has(name)) return false;
      return basename(dirname(dirPath)) !== '.claude' || name === 'projects';
    },
    createSession,
    parseLine
  };
}

export default createClaudeCodeAdapter();
