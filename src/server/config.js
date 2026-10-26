/** 출처 설정에 지정 경로를 더함 */
export function addSourcePath(sourceConfig, path) {
  return { ...sourceConfig, path };
}

/** 지정 경로와 출처 강제값만 제거 */
export function resetSourcePath(sourceConfig) {
  const updated = { ...sourceConfig };
  delete updated.path;
  delete updated.forceSource;
  return updated;
}

/** 잘못된 상위 폴더 입력에 알맞은 하위 폴더 제안 */
export function suggestSourcePath(source, path) {
  const normalized = path.trim().replace(/[\\/]+$/, '');
  const leaf = normalized.split(/[\\/]/).at(-1)?.toLowerCase();
  const child = source.startsWith('claude-') && leaf === '.claude' ? 'projects'
    : source === 'codex' && leaf === '.codex' ? 'sessions'
      : source === 'antigravity' && leaf === '.gemini' ? 'antigravity/brain'
        : source === 'antigravity' && leaf === 'antigravity' ? 'brain' : null;
  if (!child) return null;
  const separator = normalized.includes('\\') ? '\\' : '/';
  return `${normalized}${separator}${child.replace(/[\\/]/g, separator)}`;
}

/** 기존 수면 설정을 전체 비활동 퇴근 시간으로 옮긴다. */
export function normalizeConfig(config) {
  const normalized = { ...config };
  const migrated = Object.hasOwn(normalized, 'sleepAfterSec');

  if (migrated) {
    const idleAfterSec = Number.isFinite(normalized.idleAfterSec) ? normalized.idleAfterSec : 60;
    const sleepAfterSec = Number.isFinite(normalized.sleepAfterSec) ? normalized.sleepAfterSec : 300;
    normalized.goneAfterSec = idleAfterSec + sleepAfterSec;
    delete normalized.sleepAfterSec;
  }

  normalized.idleAfterSec ??= 60;
  normalized.goneAfterSec ??= 360;
  return { config: normalized, migrated };
}
