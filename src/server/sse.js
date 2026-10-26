/** SSE 클라이언트에 이벤트 전송 */
export function sendSse(response, eventName, data) {
  response.write(`event: ${eventName}\n`);
  response.write(`data: ${JSON.stringify(data)}\n\n`);
}

/** 이벤트 스트림 헤더 설정 */
export function beginSse(response, {
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
  pingIntervalMs = 15000
} = {}) {
  response.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Content-Type-Options': 'nosniff'
  });
  response.flushHeaders();
  response.write(': connected\n\n');

  const timer = setIntervalFn(() => response.write(': ping\n\n'), pingIntervalMs);
  response.on('close', () => clearIntervalFn(timer));
  return timer;
}
