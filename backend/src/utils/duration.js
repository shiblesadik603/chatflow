const UNIT_MS = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };

// Converts durations like "15m" or "30d" (the same strings jsonwebtoken's
// `expiresIn` accepts) into milliseconds, for things like cookie maxAge.
export const msFromDuration = (duration) => {
  const match = /^(\d+)(s|m|h|d)$/.exec(duration);
  if (!match) {
    throw new Error(`Unsupported duration format: "${duration}". Use e.g. "15m" or "7d".`);
  }
  return Number(match[1]) * UNIT_MS[match[2]];
};
