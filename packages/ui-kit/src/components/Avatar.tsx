export interface AvatarProps {
  src?: string;
  alt: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  fallback?: string;
}

const sizeStyles: Record<string, string> = {
  sm: 'h-6 w-6 text-xs',
  md: 'h-8 w-8 text-sm',
  lg: 'h-10 w-10 text-base',
  xl: 'h-14 w-14 text-xl',
};

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function Avatar({ src, alt, size = 'md', fallback }: AvatarProps) {
  const initials = fallback ?? getInitials(alt);

  if (src) {
    return (
      <img
        src={src}
        alt={alt}
        className={`${sizeStyles[size]} shrink-0 rounded-full object-cover`}
      />
    );
  }

  return (
    <span
      role="img"
      aria-label={alt}
      className={`${sizeStyles[size]} inline-flex shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-soft)] font-medium text-[var(--color-accent)]`}
    >
      {initials}
    </span>
  );
}
