import test from 'node:test';
import assert from 'node:assert/strict';
import { wslHomes } from '../src/lib/windows-roots.js';
import {
  antigravityRoots, claudeCodeRoots, claudeDesktopRoot, claudeRoots, codexRoots,
  coworkInboxRoot, isNetworkPath, isPathInside, normalizeProjectPath, opencodeDatabasePath
} from '../src/lib/platform-roots.js';

const home = '/home/example';

test('OS-specific agent roots use injected home directories and environment values', () => {
  assert.deepEqual(claudeCodeRoots({ platform: 'linux', home, env: { CLAUDE_CONFIG_DIR: '/config/claude' } }), ['/config/claude/projects']);
  assert.equal(claudeDesktopRoot({ platform: 'darwin', home, env: {} }),
    '/home/example/Library/Application Support/Claude/local-agent-mode-sessions');
  assert.equal(claudeDesktopRoot({ platform: 'linux', home, env: {} }),
    '/home/example/.config/Claude/local-agent-mode-sessions');
  assert.deepEqual(claudeRoots({ platform: 'linux', home, env: {} }), [
    '/home/example/.claude/projects', '/home/example/.config/Claude/local-agent-mode-sessions'
  ]);
  assert.deepEqual(codexRoots({ platform: 'linux', home, env: { CODEX_HOME: '/custom/codex' } }), ['/custom/codex/sessions']);
  assert.deepEqual(antigravityRoots({ platform: 'darwin', home }), ['/home/example/.gemini/antigravity/brain']);
  assert.equal(opencodeDatabasePath({ platform: 'linux', home, env: {} }), '/home/example/.local/share/opencode/opencode.db');
  assert.equal(opencodeDatabasePath({ platform: 'linux', home, env: { XDG_DATA_HOME: '/data' } }), '/data/opencode/opencode.db');
  assert.equal(coworkInboxRoot({ platform: 'darwin', home, env: {} }),
    '/home/example/Library/Application Support/AgentOffice/inbox');
  assert.equal(coworkInboxRoot({ platform: 'linux', home, env: { XDG_DATA_HOME: '/data' } }), '/data/agent-office/inbox');
  assert.equal(coworkInboxRoot({ platform: 'linux', home, env: { AGENT_OFFICE_INBOX: '/custom/inbox' } }), '/custom/inbox');
});

test('Windows defaults honor roaming and local app data and keep WSL lookup Windows-only', () => {
  assert.deepEqual(wslHomes({ platform: 'linux', run: () => { throw new Error('must not run'); } }), []);
  assert.deepEqual(wslHomes({ platform: 'darwin', run: () => { throw new Error('must not run'); } }), []);
  let wslCalls = 0;
  const findWslHomes = () => { wslCalls += 1; return ['\\\\wsl.localhost\\Distro\\home\\example']; };
  const env = { APPDATA: 'C:\\Users\\example\\AppData\\Roaming', LOCALAPPDATA: 'C:\\Users\\example\\AppData\\Local' };
  assert.deepEqual(claudeRoots({ platform: 'win32', home: 'C:\\Users\\example', env, findWslHomes }), [
    'C:\\Users\\example\\.claude\\projects',
    '\\\\wsl.localhost\\Distro\\home\\example\\.claude\\projects',
    'C:\\Users\\example\\AppData\\Roaming\\Claude\\local-agent-mode-sessions'
  ]);
  assert.deepEqual(coworkInboxRoot({ platform: 'win32', home: 'C:\\Users\\example', env }),
    'C:\\Users\\example\\AppData\\Local\\AgentOffice\\inbox');
  assert.deepEqual(antigravityRoots({ platform: 'win32', home: 'C:\\Users\\example', findWslHomes }), [
    'C:\\Users\\example\\.gemini\\antigravity\\brain',
    '\\\\wsl.localhost\\Distro\\home\\example\\.gemini\\antigravity\\brain'
  ]);
  assert.deepEqual(codexRoots({ platform: 'win32', home: 'C:\\Users\\example', env: { CODEX_HOME: 'D:\\Codex' }, findWslHomes }), [
    'D:\\Codex\\sessions', '\\\\wsl.localhost\\Distro\\home\\example\\.codex\\sessions'
  ]);
  assert.equal(wslCalls, 3);
  claudeRoots({ platform: 'darwin', home, env: {}, findWslHomes });
  codexRoots({ platform: 'linux', home, env: {}, findWslHomes });
  antigravityRoots({ platform: 'darwin', home, findWslHomes });
  assert.equal(wslCalls, 3);
});

test('path interpretation accepts POSIX, drive, and UNC paths without confusing local paths for network paths', () => {
  assert.equal(normalizeProjectPath('/home/example/project'), '/home/example/project');
  assert.equal(normalizeProjectPath('C:\\Work\\Project'), 'c:/Work/Project');
  assert.equal(normalizeProjectPath('\\\\server\\share\\project'), '//server/share/project');
  assert.equal(normalizeProjectPath('relative/project'), null);
  assert.equal(isPathInside('/home/example', '/home/example/project/file.jsonl', 'linux'), true);
  assert.equal(isPathInside('/home/example', '/home/elsewhere/file.jsonl', 'linux'), false);
  assert.equal(isPathInside('C:\\logs', 'C:\\logs\\rollout-a.jsonl', 'win32'), true);
  assert.equal(isPathInside('C:\\logs', 'C:\\other\\rollout-a.jsonl', 'win32'), false);
  assert.equal(isNetworkPath('\\\\server\\share'), true);
  assert.equal(isNetworkPath('//server/share'), true);
  assert.equal(isNetworkPath('/home/example'), false);
  assert.equal(isNetworkPath('C:\\logs'), false);
});
