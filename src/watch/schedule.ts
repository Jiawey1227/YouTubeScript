export interface ScheduleOptions {
  startHour?: number;
  endHour?: number;
  maxJitterMs?: number;
  minWatchMs?: number;
  maxWatchMs?: number;
  minRestMs?: number;
  maxRestMs?: number;
  random?: () => number;
}

export const DEFAULT_START_HOUR = 8;
export const DEFAULT_END_HOUR = 23;
export const DEFAULT_MAX_JITTER_MS = 5 * 60 * 1000;
export const DEFAULT_MIN_WATCH_MS = 10 * 60 * 1000;
export const DEFAULT_MAX_WATCH_MS = 25 * 60 * 1000;
export const DEFAULT_MIN_REST_MS = 3 * 60 * 1000;
export const DEFAULT_MAX_REST_MS = 8 * 60 * 1000;

export function isWithinActiveHours(
  nowMs: number,
  startHour = DEFAULT_START_HOUR,
  endHour = DEFAULT_END_HOUR,
): boolean {
  const hour = new Date(nowMs).getHours();
  return hour >= startHour && hour < endHour;
}

export function nextActiveStart(
  nowMs: number,
  options: ScheduleOptions = {},
): number {
  const startHour = options.startHour ?? DEFAULT_START_HOUR;
  const maxJitterMs = options.maxJitterMs ?? DEFAULT_MAX_JITTER_MS;
  const random = options.random ?? Math.random;

  const current = new Date(nowMs);
  const dayOffset = current.getHours() < startHour ? 0 : 1;
  const target = new Date(
    current.getFullYear(),
    current.getMonth(),
    current.getDate() + dayOffset,
    startHour,
    0,
    0,
    0,
  );
  const jitter = maxJitterMs > 0 ? Math.floor(random() * maxJitterMs) : 0;
  return target.getTime() + jitter;
}

function randomBetween(min: number, max: number, random: () => number): number {
  if (max <= min) return min;
  return min + Math.floor(random() * (max - min));
}

export type WatchPhase = 'watching' | 'resting' | 'sleeping';

export function createWatchLifecycle(options: ScheduleOptions = {}) {
  const startHour = options.startHour ?? DEFAULT_START_HOUR;
  const endHour = options.endHour ?? DEFAULT_END_HOUR;
  const minWatchMs = options.minWatchMs ?? DEFAULT_MIN_WATCH_MS;
  const maxWatchMs = options.maxWatchMs ?? DEFAULT_MAX_WATCH_MS;
  const minRestMs = options.minRestMs ?? DEFAULT_MIN_REST_MS;
  const maxRestMs = options.maxRestMs ?? DEFAULT_MAX_REST_MS;
  const random = options.random ?? Math.random;
  const pendingRescanMs = 2000;

  let phase: WatchPhase = 'sleeping';
  let phaseUntil = 0;
  let dirtyEvent = false;
  let lastPendingScan = 0;

  const enterWatching = (nowMs: number) => {
    phase = 'watching';
    phaseUntil = nowMs + randomBetween(minWatchMs, maxWatchMs, random);
    dirtyEvent = true;
  };

  const enterResting = (nowMs: number) => {
    phase = 'resting';
    phaseUntil = nowMs + randomBetween(minRestMs, maxRestMs, random);
    dirtyEvent = false;
  };

  const enterSleeping = (nowMs: number) => {
    phase = 'sleeping';
    phaseUntil = nextActiveStart(nowMs, options);
    dirtyEvent = false;
  };

  return {
    init(nowMs: number) {
      if (isWithinActiveHours(nowMs, startHour, endHour)) {
        enterWatching(nowMs);
      } else {
        enterSleeping(nowMs);
      }
    },
    phase(): WatchPhase {
      return phase;
    },
    phaseUntil(): number {
      return phaseUntil;
    },
    notifyEvent() {
      if (phase === 'watching') dirtyEvent = true;
    },
    tick(
      nowMs: number,
      hasPending: boolean,
    ): { phase: WatchPhase; changed: boolean } {
      const prev = phase;
      const active = isWithinActiveHours(nowMs, startHour, endHour);

      if (!active) {
        if (phase !== 'sleeping') enterSleeping(nowMs);
        return { phase, changed: phase !== prev };
      }

      if (phase === 'sleeping') {
        if (nowMs >= phaseUntil) enterWatching(nowMs);
      } else if (phase === 'watching') {
        if (nowMs >= phaseUntil && !hasPending) enterResting(nowMs);
      } else if (phase === 'resting') {
        if (nowMs >= phaseUntil) enterWatching(nowMs);
      }

      return { phase, changed: phase !== prev };
    },
    shouldScan(nowMs: number, hasPending: boolean): boolean {
      if (phase !== 'watching') return false;
      if (dirtyEvent) {
        dirtyEvent = false;
        lastPendingScan = nowMs;
        return true;
      }
      if (hasPending && nowMs - lastPendingScan >= pendingRescanMs) {
        lastPendingScan = nowMs;
        return true;
      }
      return false;
    },
  };
}
