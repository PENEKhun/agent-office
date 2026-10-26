/** 출근 뒤 방 위치 이벤트가 없는 에이전트의 책상 이동 여부 */
export function shouldMoveToDesk({ hadRoomEvent, arrivalFallbackDone, status, arrivalAt }, now) {
  return !hadRoomEvent && !arrivalFallbackDone && !['leaving', 'gone'].includes(status) && now - arrivalAt >= 3000;
}
