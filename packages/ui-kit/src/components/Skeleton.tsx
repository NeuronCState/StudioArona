export interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circle' | 'rect';
  width?: string | number;
  height?: string | number;
}

export function Skeleton({ className = '', variant = 'text', width, height }: SkeletonProps) {
  const baseStyles = 'animate-pulse rounded-md bg-[var(--color-border)]';

  const variantStyles: Record<string, string> = {
    text: 'h-4 w-full',
    circle: 'rounded-full',
    rect: 'rounded-lg',
  };

  return (
    <div
      aria-hidden="true"
      className={`${baseStyles} ${variantStyles[variant]} ${className}`}
      style={{ width, height }}
    />
  );
}
