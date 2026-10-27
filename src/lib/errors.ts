/** Maps Firebase and rule errors to a safe, human message. Raw error text is never shown to students. */
export function friendlyError(err: unknown, fallback: string): string {
  const code = (err as { code?: string } | null)?.code ?? '';
  if (code === 'permission-denied') return 'This action is not allowed right now. It may be closed, or your account may not have access.';
  if (code === 'unavailable' || code === 'deadline-exceeded') return 'You appear to be offline. Check your connection and try again.';
  return fallback;
}

/**
 * Development-only diagnostics. Logs the Firebase error code and message for one named stage.
 * Never logs user IDs, emails, tokens or document contents. Production builds print nothing.
 */
export function logDevError(stage: string, err: unknown): void {
  if (!import.meta.env.DEV) return;
  const code = (err as { code?: string } | null)?.code ?? 'unknown';
  const message = (err as { message?: string } | null)?.message ?? String(err);
  console.error(`[AfterClass] ${stage} failed: code=${code} message=${message}`);
}
