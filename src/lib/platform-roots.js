import { homedir } from 'node:os';
import path from 'node:path';
import { wslHomes } from './windows-roots.js';

function paths(platform) {
  return platform === 'win32' ? path.win32 : path.posix;
}

function available(values) {
  return values.filter((value) => typeof value === 'string' && value.length > 0);
}

export function normalizeProjectPath(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.replaceAll('\\', '/');
  if (!normalized.startsWith('/') && !/^[A-Za-z]:\//u.test(normalized)) return null;
  return normalized.replace(/^([A-Z]):/u, (_, drive) => `${drive.toLowerCase()}:`);
}

export function isPathInside(root, target, platform = process.platform) {
  const relative = relativePath(root, target, platform);
  const separator = windowsPath(root) || windowsPath(target) || platform === 'win32' ? '\\' : '/';
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${separator}`) && !path.win32.isAbsolute(relative) && !path.posix.isAbsolute(relative);
}

function windowsPath(value) {
  return typeof value === 'string' && (/^[A-Za-z]:[\\/]/u.test(value) || /^\\\\/u.test(value));
}

export function relativePath(root, target, platform = process.platform) {
  const pathApi = platform === 'win32' || windowsPath(root) || windowsPath(target)
    ? path.win32 : path.posix;
  return pathApi.relative(root, target);
}

export function claudeCodeRoots({ platform = process.platform, home = homedir(), env = process.env, findWslHomes = wslHomes } = {}) {
  const pathApi = paths(platform);
  const configRoot = env.CLAUDE_CONFIG_DIR || pathApi.join(home, '.claude');
  const roots = [pathApi.join(configRoot, 'projects')];
  if (platform === 'win32') roots.push(...findWslHomes({ platform }).map((wslHome) => path.win32.join(wslHome, '.claude', 'projects')));
  return roots;
}

export function claudeDesktopRoot({ platform = process.platform, home = homedir(), env = process.env } = {}) {
  const pathApi = paths(platform);
  if (platform === 'win32') {
    return env.APPDATA ? pathApi.join(env.APPDATA, 'Claude', 'local-agent-mode-sessions') : null;
  }
  if (platform === 'darwin') return pathApi.join(home, 'Library', 'Application Support', 'Claude', 'local-agent-mode-sessions');
  return pathApi.join(home, '.config', 'Claude', 'local-agent-mode-sessions');
}

export function claudeRoots({ platform = process.platform, home = homedir(), env = process.env, findWslHomes = wslHomes } = {}) {
  const desktop = claudeDesktopRoot({ platform, home, env });
  return available([...claudeCodeRoots({ platform, home, env, findWslHomes }), desktop]);
}

export function codexRoots({ platform = process.platform, home = homedir(), env = process.env, findWslHomes = wslHomes } = {}) {
  const pathApi = paths(platform);
  const base = env.CODEX_HOME || pathApi.join(home, '.codex');
  const roots = [pathApi.join(base, 'sessions')];
  if (platform === 'win32') roots.push(...findWslHomes({ platform }).map((wslHome) => path.win32.join(wslHome, '.codex', 'sessions')));
  return roots;
}

export function antigravityRoot({ platform = process.platform, home = homedir() } = {}) {
  return paths(platform).join(home, '.gemini', 'antigravity');
}

export function antigravityRoots({ platform = process.platform, home = homedir(), findWslHomes = wslHomes } = {}) {
  const pathApi = paths(platform);
  const root = antigravityRoot({ platform, home });
  const roots = [pathApi.join(root, 'brain')];
  if (platform === 'win32') roots.push(...findWslHomes({ platform }).map((wslHome) => path.win32.join(wslHome, '.gemini', 'antigravity', 'brain')));
  return roots;
}

export function opencodeDatabasePath({ platform = process.platform, home = homedir(), env = process.env } = {}) {
  const pathApi = paths(platform);
  const dataHome = env.XDG_DATA_HOME?.trim() || pathApi.join(home, '.local', 'share');
  return pathApi.join(dataHome, 'opencode', 'opencode.db');
}

export function coworkInboxRoot({ platform = process.platform, home = homedir(), env = process.env } = {}) {
  const pathApi = paths(platform);
  if (env.AGENT_OFFICE_INBOX) return env.AGENT_OFFICE_INBOX;
  if (platform === 'win32') {
    return pathApi.join(env.LOCALAPPDATA || pathApi.join(home, 'AppData', 'Local'), 'AgentOffice', 'inbox');
  }
  if (platform === 'darwin') return pathApi.join(home, 'Library', 'Application Support', 'AgentOffice', 'inbox');
  return pathApi.join(env.XDG_DATA_HOME || pathApi.join(home, '.local', 'share'), 'agent-office', 'inbox');
}

export function isNetworkPath(root) {
  return typeof root === 'string' && /^(?:\\\\|\/\/)/u.test(root);
}
