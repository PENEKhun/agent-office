/** 셸 명령에서 성공 가능한 Git 연출 종류 확인 */
export function detectGitAction(command) {
  if (typeof command !== 'string') {
    return null;
  }
  const normalizedCommand = command.replace(/\s+(?:-C|-c|--git-dir|--work-tree)\s+(?:"[^"]*"|'[^']*'|\S+)/g, '');
  if (/\b(glab\s+mr\s+create|gh\s+pr\s+create)\b/i.test(normalizedCommand)) {
    return 'mr';
  }
  if (/\bgit\b(?:\s+-\S+)*\s+commit\b/i.test(normalizedCommand)) {
    return 'commit';
  }
  if (/\bgit\b(?:\s+-\S+)*\s+push\b/i.test(normalizedCommand)) {
    return 'push';
  }
  return null;
}

/** 검색 계열 셸 명령인지 확인 */
export function isSearchCommand(command) {
  return typeof command === 'string' && /^(rg|grep|findstr|Select-String)(?:\s|$)/i.test(command.trim());
}
