import { createContext, useContext, useEffect, useId, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useAuth } from '../../lib/auth';
import { ADMIN_PIN_LENGTH, normalizePin, verifyAdminPin } from '../../lib/adminPin';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Notice } from './AdminUi';

interface AdminSessionValue {
  lock: () => void;
}

const AdminSessionContext = createContext<AdminSessionValue | null>(null);

export function useAdminSession(): AdminSessionValue {
  const ctx = useContext(AdminSessionContext);
  if (!ctx) throw new Error('useAdminSession must be used inside <PinGate>.');
  return ctx;
}

/**
 * Cosmetic PIN gate. The unlock is held in memory only and bound to one signed-in account, so it
 * is lost on lock, sign-out, page reload, or an account change. It never grants data access.
 */
export function PinGate({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [unlockedUid, setUnlockedUid] = useState<string | null>(null);

  useEffect(() => {
    if (uid === null) setUnlockedUid(null);
  }, [uid]);

  const unlocked = uid !== null && unlockedUid === uid;
  const session = useMemo(() => ({ lock: () => setUnlockedUid(null) }), []);

  if (!unlocked || uid === null) {
    return <PinForm onUnlock={() => setUnlockedUid(uid)} />;
  }
  return <AdminSessionContext.Provider value={session}>{children}</AdminSessionContext.Provider>;
}

type Phase = 'idle' | 'incomplete' | 'wrong' | 'checking';

function PinForm({ onUnlock }: { onUnlock: () => void }) {
  const [pin, setPin] = useState('');
  const [show, setShow] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const inputId = useId();
  const helpId = useId();
  const errorId = useId();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (phase === 'checking') return;
    if (pin.length !== ADMIN_PIN_LENGTH) {
      setPhase('incomplete');
      return;
    }
    setPhase('checking');
    const ok = await verifyAdminPin(pin);
    if (ok) {
      setPin('');
      onUnlock();
      return;
    }
    setPin('');
    setPhase('wrong');
  }

  const message =
    phase === 'incomplete'
      ? `Enter all ${ADMIN_PIN_LENGTH} digits of the PIN.`
      : phase === 'wrong'
        ? 'That PIN is not correct. Try again.'
        : null;

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-5 py-16 sm:px-8">
      <Card tone="violet" rotate="left">
        <p className="text-sm font-bold tracking-widest uppercase">Restricted area</p>
        <h1 className="mt-2 font-display text-3xl leading-tight font-bold">Admin access</h1>
        <p className="mt-2 text-sm text-ink-soft">Enter the PIN to open the dashboard. Your account must also hold admin permission.</p>

        <form onSubmit={onSubmit} noValidate className="mt-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor={inputId} className="font-semibold">PIN</label>
            <div className="flex gap-2">
              <input
                id={inputId}
                type={show ? 'text' : 'password'}
                inputMode="numeric"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={ADMIN_PIN_LENGTH}
                value={pin}
                onChange={(e) => {
                  setPin(normalizePin(e.target.value));
                  setPhase('idle');
                }}
                aria-invalid={phase === 'wrong' || phase === 'incomplete'}
                aria-describedby={`${helpId} ${errorId}`}
                className="min-h-12 w-full min-w-0 rounded-2xl border-2 border-ink bg-paper px-4 py-3 tracking-[0.4em] focus-visible:outline-violet"
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                aria-pressed={show}
                aria-controls={inputId}
                className="min-h-12 shrink-0 rounded-2xl border-2 border-ink bg-paper px-4 font-semibold focus-visible:outline-violet"
              >
                {show ? 'Hide' : 'Show'}
              </button>
            </div>
            <p id={helpId} className="text-xs text-ink-soft">Digits only, {ADMIN_PIN_LENGTH} characters.</p>
          </div>

          <div id={errorId} aria-live="polite">
            {message && <Notice kind="error">{message}</Notice>}
          </div>

          <div>
            <Button type="submit" disabled={phase === 'checking'} aria-busy={phase === 'checking'}>
              {phase === 'checking' ? 'Checking…' : 'Unlock'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
