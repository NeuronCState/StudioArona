export interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeStyles: Record<string, string> = {
  sm: 'h-3 w-3 gap-1',
  md: 'h-4 w-4 gap-1.5',
  lg: 'h-6 w-6 gap-2',
};

const dotStyles: Record<string, string> = {
  sm: 'h-1 w-1',
  md: 'h-1.5 w-1.5',
  lg: 'h-2 w-2',
};

export function Spinner({ size = 'md', className = '' }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-flex items-center ${sizeStyles[size]} ${className}`}
    >
      <span
        className={`${dotStyles[size]} animate-breathe rounded-full bg-[var(--color-accent)]`}
      />
      <span
        className={`${dotStyles[size]} animate-breathe rounded-full bg-[var(--color-accent)]`}
        style={{ animationDelay: '0.2s' }}
      />
      <span
        className={`${dotStyles[size]} animate-breathe rounded-full bg-[var(--color-accent)]`}
        style={{ animationDelay: '0.4s' }}
      />
    </span>
  );
}
