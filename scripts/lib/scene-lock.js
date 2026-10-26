import { closeSync, existsSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';

export function acquireSceneLock(path, pid = process.pid, isAlive = (value) => {
  try { process.kill(value, 0); return true; } catch (error) { return error.code === 'EPERM'; }
}) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const descriptor = openSync(path, 'wx');
      writeFileSync(descriptor, `${pid}\n`);
      closeSync(descriptor);
      return () => { if (existsSync(path) && Number(readFileSync(path, 'utf8').trim()) === pid) unlinkSync(path); };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const owner = Number(readFileSync(path, 'utf8').trim());
      if (Number.isInteger(owner) && owner > 0 && isAlive(owner)) return null;
      unlinkSync(path);
    }
  }
  return null;
}

export function sceneLockOwnedBy(path, pid) {
  try { return Number(readFileSync(path, 'utf8').trim()) === pid; } catch { return false; }
}
