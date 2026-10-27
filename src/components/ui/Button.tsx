import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost';

const variants: Record<Variant, string> = {
  primary: 'bg-lime text-ink shadow-lift hover:-translate-x-px hover:-translate-y-px hover:shadow-card',
  secondary: 'bg-paper text-ink shadow-lift hover:-translate-x-px hover:-translate-y-px hover:shadow-card',
  ghost: 'bg-transparent text-ink hover:bg-sand',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children: ReactNode;
}

export function Button({ variant = 'primary', className = '', children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-full border-2 border-ink px-6 py-3 font-semibold transition-[transform,box-shadow] duration-150 focus-visible:outline-violet disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none ${variants[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
