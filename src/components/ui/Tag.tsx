import type { ReactNode } from 'react';

type Tone = 'lime' | 'pink' | 'violet' | 'paper';

const tones: Record<Tone, string> = {
  lime: 'bg-lime',
  pink: 'bg-pink-soft',
  violet: 'bg-violet-soft',
  paper: 'bg-paper',
};

export function Tag({ tone = 'paper', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full border-2 border-ink px-3 py-1 text-xs font-bold tracking-wide uppercase ${tones[tone]}`}>
      {children}
    </span>
  );
}
