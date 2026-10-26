import test from 'node:test';
import assert from 'node:assert/strict';
import { redactCommand, redactFilePath, redactMcpName } from '../src/lib/redact.js';
import { detectGitAction, isSearchCommand } from '../src/lib/git-detect.js';

test('redacts paths and commands to approved short labels', () => {
  assert.equal(redactFilePath('C:\\private\\src\\Sample.java'), 'Sample.java');
  assert.equal(redactCommand('git -C secret push origin main'), 'git');
  assert.equal(redactMcpName('mcp__server__tool_name'), 'server/tool_name');
  assert.equal(redactCommand(null), null);
});

test('detects git actions and search commands without retaining command text', () => {
  assert.equal(detectGitAction('git -C secret commit -m private'), 'commit');
  assert.equal(detectGitAction('git push origin main'), 'push');
  assert.equal(detectGitAction('gh pr create --title private'), 'mr');
  assert.equal(detectGitAction('npm test'), null);
  assert.equal(isSearchCommand('rg private'), true);
  assert.equal(isSearchCommand('npm run test'), false);
});
