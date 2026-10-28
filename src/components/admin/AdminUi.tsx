import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Button } from '../ui/Button';
import { Tag } from '../ui/Tag';

type Tone = 'paper' | 'lime' | 'pink' | 'violet';

const STATUS_TONE: Record<string, Tone> = {
  draft: 'pink',
  published: 'lime',
  closed: 'paper',
  submitted: 'violet',
  planned: 'lime',
  done: 'paper',
  declined: 'pink',
};

export function StatusTag({ status }: { status: string }) {
  return <Tag tone={STATUS_TONE[status] ?? 'paper'}>{status}</Tag>;
}

export function Notice({ kind, children }: { kind: 'ok' | 'error'; children: ReactNode }) {
  return (
    <p
      role={kind === 'error' ? 'alert' : 'status'}
      className={`rounded-2xl border-2 border-ink px-4 py-3 font-semibold ${kind === 'error' ? 'bg-pink-soft' : 'bg-lime'}`}
    >
      {children}
    </p>
  );
}

export function formatDate(ms: number | null): string {
  if (ms === null) return 'Not recorded';
  return new Date(ms).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

/**
 * Serialises actions. A second click while a write is in flight is ignored, so one
 * user gesture cannot send the same transition or save twice.
 */
export function useBusyGuard() {
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  const run = useCallback(async (task: () => Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await task();
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, []);

  return { busy, run };
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-5">
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="w-full max-w-md rounded-card border-2 border-ink bg-paper p-6 shadow-card">
        <h2 id={titleId} className="font-display text-2xl font-bold">{title}</h2>
        <p className="mt-2 text-ink-soft">{body}</p>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <Button variant="secondary" onClick={onCancel} disabled={busy} autoFocus>Cancel</Button>
          <Button onClick={onConfirm} disabled={busy} aria-busy={busy}>{busy ? 'Working…' : confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}
