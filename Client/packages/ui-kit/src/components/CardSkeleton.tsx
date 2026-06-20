import { type ReactElement } from 'react';
import { Skeleton } from './Skeleton';

export interface CardSkeletonProps {
  /** Visual variant matching data shape */
  variant?: 'list' | 'grid' | 'detail' | 'stats' | 'compact';
  /** Number of skeleton rows to render (for list/grid variants) */
  count?: number;
}

const listItem = (
  <div className="flex items-center gap-3 px-1 py-3">
    <Skeleton variant="circle" width={36} height={36} />
    <div className="flex-1 space-y-2">
      <Skeleton width="60%" height={14} />
      <Skeleton width="40%" height={10} />
    </div>
  </div>
);

const gridItem = (
  <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm">
    <Skeleton width="70%" height={16} />
    <div className="mt-3 space-y-2">
      <Skeleton width="100%" height={12} />
      <Skeleton width="80%" height={12} />
    </div>
    <div className="mt-3 flex gap-2">
      <Skeleton width={50} height={20} />
      <Skeleton width={50} height={20} />
    </div>
  </div>
);

const detailSkeleton = (
  <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
    <Skeleton width="80%" height={24} />
    <div className="mt-4 flex gap-4">
      <Skeleton width={80} height={14} />
      <Skeleton width={100} height={14} />
    </div>
    <div className="mt-6 space-y-3">
      <Skeleton width="100%" height={14} />
      <Skeleton width="95%" height={14} />
      <Skeleton width="88%" height={14} />
      <Skeleton width="60%" height={14} />
    </div>
  </div>
);

const statsSkeleton = (
  <div className="flex flex-wrap items-center justify-center gap-8">
    {[1, 2, 3, 4].map((i) => (
      <div key={i} className="flex flex-col items-center gap-2">
        <Skeleton variant="circle" width={80} height={80} />
        <Skeleton width={40} height={12} />
      </div>
    ))}
  </div>
);

const compactSkeleton = (
  <div className="flex items-center gap-2">
    <Skeleton variant="circle" width={24} height={24} />
    <div className="flex-1 space-y-1">
      <Skeleton width="50%" height={12} />
      <Skeleton width="30%" height={10} />
    </div>
  </div>
);

const variantMap: Record<NonNullable<CardSkeletonProps['variant']>, ReactElement> = {
  list: listItem,
  grid: gridItem,
  detail: detailSkeleton,
  stats: statsSkeleton,
  compact: compactSkeleton,
};

export function CardSkeleton({ variant = 'grid', count = 3 }: CardSkeletonProps) {
  const item = variantMap[variant];

  return (
    <div
      role="status"
      aria-label="Loading"
      className="animate-pulse"
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i}>{item}</div>
      ))}
    </div>
  );
}
