import type { ReactNode } from 'react';

type Tone = 'paper' | 'lime' | 'pink' | 'violet';

const tones: Record<Tone, string> = {
  paper: 'bg-paper',
  lime: 'bg-lime',
  pink: 'bg-pink-soft',
  violet: 'bg-violet-soft',
};

export function Card({
  tone = 'paper',
  rotate = 'none',
  className = '',
  children,
}: {
  tone?: Tone;
  rotate?: 'none' | 'left' | 'right';
  className?: string;
  children: ReactNode;
}) {
  const turn = rotate === 'left' ? '-rotate-1' : rotate === 'right' ? 'rotate-1' : '';
  return (
    <div className={`rounded-card border-2 border-ink p-6 shadow-card ${tones[tone]} ${turn} ${className}`}>
      {children}
    </div>
  );
}
