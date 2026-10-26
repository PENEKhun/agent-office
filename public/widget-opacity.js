export const DIM_TIMING = Object.freeze({
  idleDelayMs: 10_000,
  automaticTransitionMs: 500,
  pinTransitionMs: 300,
  pinFactor: 0.7,
  automaticFactor: 0.4,
  minimumFactor: 0.25
});

export function createWidgetDimState() {
  return {
    inactiveSince: null,
    busy: false,
    pinned: false,
    targetFactor: 1,
    factor: 1,
    transition: null
  };
}

export function advanceWidgetDim(state, agents, settings, now) {
  const busy = agents.some((agent) => agent.status === 'working' || agent.status === 'thinking');
  const inactiveSince = busy ? null : state.inactiveSince ?? now;
  const autoDimmed = settings.autoDim === true && !busy &&
    now - inactiveSince >= (settings.idleDelayMs ?? DIM_TIMING.idleDelayMs) &&
    !(settings.hovered === true && settings.pinned !== true);
  const pinFactor = settings.pinned === true ? (settings.pinFactor ?? DIM_TIMING.pinFactor) : 1;
  const autoFactor = autoDimmed ? (settings.automaticFactor ?? DIM_TIMING.automaticFactor) : 1;
  const minimumFactor = settings.minimumFactor ?? DIM_TIMING.minimumFactor;
  const targetFactor = Math.max(minimumFactor, pinFactor * autoFactor);
  const targetChanged = targetFactor !== state.targetFactor;
  const pinChanged = (settings.pinned === true) !== state.pinned;
  const transition = targetChanged
    ? {
        from: state.factor,
        to: targetFactor,
        startedAt: now,
        durationMs: pinChanged
          ? (settings.pinTransitionMs ?? DIM_TIMING.pinTransitionMs)
          : (settings.transitionMs ?? DIM_TIMING.automaticTransitionMs)
      }
    : state.transition;
  const progress = transition === null
    ? 1
    : Math.min(1, Math.max(0, (now - transition.startedAt) / transition.durationMs));
  const factor = transition === null
    ? targetFactor
    : transition.from + (transition.to - transition.from) * progress;
  return {
    inactiveSince,
    busy,
    pinned: settings.pinned === true,
    targetFactor,
    factor: Number(factor.toFixed(4)),
    transition: progress >= 1 ? null : transition
  };
}
