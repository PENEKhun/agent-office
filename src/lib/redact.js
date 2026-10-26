import { basename } from 'node:path';

/** 파일 경로에서 화면에 허용된 파일명만 추출 */
export function redactFilePath(filePath) {
  if (typeof filePath !== 'string' || !filePath) {
    return null;
  }
  return basename(filePath.replaceAll('\\', '/')).slice(0, 40);
}

/** 셸 명령에서 첫 토큰만 추출 */
export function redactCommand(command) {
  if (typeof command !== 'string') {
    return null;
  }
  const token = command.trim().match(/^(?:"([^"]+)"|'([^']+)'|(\S+))/);
  return token?.[1] ?? token?.[2] ?? token?.[3] ?? null;
}

/** MCP 도구 이름을 서버/도구 라벨로 축약 */
export function redactMcpName(name) {
  if (typeof name !== 'string') {
    return null;
  }
  const parts = name.replace(/^mcp__/, '').split('__');
  return parts.length > 1 ? `${parts[0]}/${parts.slice(1).join('_')}`.slice(0, 40) : name.slice(0, 40);
}
