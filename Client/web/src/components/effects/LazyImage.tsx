import { useRef, useState, useCallback, type ImgHTMLAttributes } from 'react';
import { DURATION, EASING, bezierCSS } from '@/lib/motion/tokens';

type Status = 'pending' | 'loading' | 'loaded' | 'error';

interface LazyImageProps extends ImgHTMLAttributes<HTMLImageElement> {
  /** Low-quality placeholder: a tiny base64 or a blurred thumbnail URL */
  placeholder?: string;
  /** Threshold for IntersectionObserver (0-1), default 0.2 */
  threshold?: number;
  /** Root margin for intersection detection default "200px" */
  rootMargin?: string;
}

/**
 * Lazy image with IntersectionObserver.
 * - Shows a low-quality placeholder before entering the viewport.
 * - Loads the real image only when within `threshold` of the viewport.
 * - Fades in real image using motion tokens once loaded.
 * - Falls back to a text indicator on error.
 */
export function LazyImage({
  src,
  placeholder,
  threshold = 0.2,
  rootMargin = '200px',
  alt = '',
  className = '',
  style,
  ...imgProps
}: LazyImageProps): JSX.Element {
  const [status, setStatus] = useState<Status>('pending');
  const imgRef = useRef<HTMLImageElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const onIntersection = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          setStatus('loading');
          observerRef.current?.disconnect();
          observerRef.current = null;

          const img = new Image();
          img.onload = () => setStatus('loaded');
          img.onerror = () => setStatus('error');
          if (src) img.src = src;
        }
      }
    },
    [src],
  );

  const containerRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node || !src) return;
      observerRef.current?.disconnect();
      observerRef.current = new IntersectionObserver(onIntersection, {
        threshold,
        rootMargin,
      });
      observerRef.current.observe(node);
    },
    [src, threshold, rootMargin, onIntersection],
  );

  if (!src) {
    return (
      <div
        className={`bg-[var(--color-border-subtle)] ${className}`}
        style={style}
        aria-label={alt || 'Image placeholder'}
        role="img"
      />
    );
  }

  return (
    <div ref={containerRef} className={`relative overflow-hidden ${className}`} style={style}>
      {/* Low-quality placeholder layer */}
      {placeholder && status !== 'loaded' && (
        <img
          src={placeholder}
          alt=""
          className="absolute inset-0 h-full w-full object-cover blur-lg scale-110"
          aria-hidden="true"
        />
      )}

      {/* Solid placeholder when no LQIP */}
      {!placeholder && status !== 'loaded' && status !== 'error' && (
        <div className="absolute inset-0 h-full w-full bg-[var(--color-border-subtle)] animate-pulse" />
      )}

      {/* Real image (fades in on load) */}
      {(status === 'loading' || status === 'loaded') && (
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          {...imgProps}
          className={`h-full w-full object-cover transition-opacity ${
            status === 'loaded'
              ? 'opacity-100'
              : 'opacity-0'
          }`}
          style={{
            transitionDuration: `${DURATION.base}ms`,
            transitionTimingFunction: bezierCSS(EASING.out),
          }}
        />
      )}

      {/* Error fallback */}
      {status === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--color-border-subtle)] text-xs text-[var(--color-text-muted)]">
          {alt || 'Failed to load'}
        </div>
      )}
    </div>
  );
}
