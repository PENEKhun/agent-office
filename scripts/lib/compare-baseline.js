const MAX_BASELINE_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function baselineWarning({ metadata, currentCommit, theme, now, dimensionsMatch = true, isAncestor = () => false }) {
  const baselineCommit = metadata?.commit ?? null;
  const createdAt = Date.parse(metadata?.createdAt ?? '');
  const ageMs = Number.isFinite(createdAt) ? Math.max(0, now - createdAt) : Infinity;
  const reasons = [];
  if (!metadata) reasons.push('기준 메타데이터 없음');
  else {
    if (!baselineCommit || !Number.isFinite(createdAt)) reasons.push('기준 메타데이터 불완전');
    if (theme && metadata.theme !== theme) reasons.push('기준 테마 불일치');
    if (ageMs > MAX_BASELINE_AGE_MS) reasons.push('기준 생성 후 7일 초과');
    if (baselineCommit && currentCommit && baselineCommit !== currentCommit && !isAncestor(baselineCommit, currentCommit)) {
      reasons.push('기준 커밋이 현재 커밋의 조상이 아님');
    }
  }
  if (!dimensionsMatch) reasons.push('기준 이미지 크기 불일치');
  if (!reasons.length) return null;
  return {
    warning: reasons.join(' / '),
    baselineCommit,
    currentCommit: currentCommit ?? null
  };
}
