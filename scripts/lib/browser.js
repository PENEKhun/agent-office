import { existsSync } from 'node:fs';
import { join } from 'node:path';

export function findBrowser(env = process.env) {
  const explicit = env.EDGE_PATH || env.AGENT_OFFICE_BROWSER;
  if (explicit) {
    if (existsSync(explicit)) return explicit;
    throw new Error(`지정한 브라우저 경로를 찾지 못했습니다: ${explicit}`);
  }

  const chromeCandidates = [
    env.ProgramFiles && join(env.ProgramFiles, 'Google/Chrome/Application/chrome.exe'),
    env['ProgramFiles(x86)'] && join(env['ProgramFiles(x86)'], 'Google/Chrome/Application/chrome.exe'),
    env.LOCALAPPDATA && join(env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'),
    process.platform === 'darwin' && '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    process.platform !== 'win32' && process.platform !== 'darwin' && '/usr/bin/chromium',
    process.platform !== 'win32' && process.platform !== 'darwin' && '/usr/bin/google-chrome'
  ].filter(Boolean);
  const chrome = chromeCandidates.find(existsSync);
  if (chrome) return chrome;

  const edgeCandidates = [
    env.ProgramFiles && join(env.ProgramFiles, 'Microsoft/Edge/Application/msedge.exe'),
    env['ProgramFiles(x86)'] && join(env['ProgramFiles(x86)'], 'Microsoft/Edge/Application/msedge.exe'),
    env.LOCALAPPDATA && join(env.LOCALAPPDATA, 'Microsoft/Edge/Application/msedge.exe')
  ].filter(Boolean);
  return edgeCandidates.find(existsSync) ?? null;
}
