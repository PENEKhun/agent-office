/** 한 번에 한 배송만 이동시키고 완료된 이벤트의 재생을 막는 큐 */
export function createDeliveryQueue({ completedIds = [], historyLimit = 100 } = {}) {
  const completed = new Set(completedIds.map(String));
  const pending = [];
  const queued = new Set();
  let active = null;

  return {
    enqueue(item) {
      const id = String(item.id);
      if (completed.has(id) || queued.has(id) || active?.id === id || active) return false;
      pending.push({ ...item, id });
      queued.add(id);
      return true;
    },
    startNext() {
      if (active || pending.length === 0) return null;
      active = pending.shift();
      queued.delete(active.id);
      return active;
    },
    finish(id) {
      if (!active || active.id !== String(id)) return false;
      completed.add(active.id);
      active = null;
      while (completed.size > historyLimit) completed.delete(completed.values().next().value);
      return true;
    },
    get active() { return active; },
    get pendingCount() { return pending.length; },
    completedIds() { return [...completed]; }
  };
}
