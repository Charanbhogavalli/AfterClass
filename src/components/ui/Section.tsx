import type { ReactNode } from 'react';

export function Section({
  id,
  eyebrow,
  title,
  children,
}: {
  id: string;
  eyebrow?: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="mx-auto w-full max-w-6xl scroll-mt-24 px-5 py-16 sm:px-8 sm:py-20">
      {eyebrow && <p className="mb-3 text-sm font-bold tracking-widest text-violet uppercase">{eyebrow}</p>}
      <h2 id={`${id}-title`} className="font-display text-3xl leading-tight sm:text-5xl">
        {title}
      </h2>
      <div className="mt-8">{children}</div>
    </section>
  );
}
