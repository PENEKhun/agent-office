import { execFileSync } from 'node:child_process';

function decodeOutput(value) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value ?? '');
  return buffer.includes(0) ? buffer.toString('utf16le').replaceAll('\0', '') : buffer.toString('utf8');
}

let cachedHomes;

/** Windows에서 설치된 WSL 배포판의 홈 디렉터리를 UNC 경로로 찾는다. */
export function wslHomes({ platform = process.platform, run = execFileSync } = {}) {
  if (platform !== 'win32') return [];
  if (run === execFileSync && cachedHomes) return cachedHomes;
  try {
    const distributions = decodeOutput(run('wsl.exe', ['-l', '-q'], { timeout: 1200 }))
      .split(/\r?\n/u).map((value) => value.trim()).filter(Boolean);
    const homes = distributions.flatMap((distribution) => {
      try {
        const home = decodeOutput(run('wsl.exe', ['-d', distribution, '--', 'sh', '-lc', 'printf %s "$HOME"'], { timeout: 1200 })).trim();
        if (!/^\/home\/[A-Za-z0-9._-]+$/u.test(home)) return [];
        return [`\\\\wsl.localhost\\${distribution}${home.replaceAll('/', '\\')}`];
      } catch {
        return [];
      }
    });
    if (run === execFileSync) cachedHomes = homes;
    return homes;
  } catch {
    if (run === execFileSync) cachedHomes = [];
    return [];
  }
}
