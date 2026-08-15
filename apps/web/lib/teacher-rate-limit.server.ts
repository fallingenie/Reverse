const WINDOW_MS = 10 * 60 * 1_000;
const MAX_FAILURES = 5;

interface AttemptWindow {
  failures: number;
  resetAt: number;
}

const attempts = new Map<string, AttemptWindow>();

function currentWindow(key: string, nowMs: number): AttemptWindow {
  const stored = attempts.get(key);
  if (!stored || stored.resetAt <= nowMs) {
    const fresh = {failures: 0, resetAt: nowMs + WINDOW_MS};
    attempts.set(key, fresh);
    return fresh;
  }
  return stored;
}

export function isTeacherUnlockLimited(key: string, nowMs = Date.now()): boolean {
  return currentWindow(key, nowMs).failures >= MAX_FAILURES;
}

export function registerTeacherUnlockFailure(key: string, nowMs = Date.now()): void {
  const window = currentWindow(key, nowMs);
  window.failures += 1;
}

export function clearTeacherUnlockFailures(key: string): void {
  attempts.delete(key);
}

export function resetTeacherUnlockLimiterForTests(): void {
  attempts.clear();
}
