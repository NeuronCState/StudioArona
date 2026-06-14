import { useEffect, useRef } from 'react';
import Stats from 'stats.js';

/**
 * Dev-only FPS + memory HUD overlay.
 * Only renders when `import.meta.env.DEV` is true.
 * Displays: FPS, frame time (ms), and JS heap size (MB).
 */
export function PerfHud(): JSX.Element | null {
  if (!import.meta.env.DEV) return null;

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stats = new Stats();
    stats.showPanel(1); // 0=fps, 1=ms/frame, 2=mb (memory)
    stats.dom.style.position = 'absolute';
    stats.dom.style.left = 'auto';
    stats.dom.style.right = '8px';
    stats.dom.style.bottom = '8px';
    stats.dom.style.top = 'auto';

    if (containerRef.current) {
      containerRef.current.appendChild(stats.dom);
    }

    let stopped = false;

    const loop = () => {
      if (stopped) return;
      stats.begin();
      stats.end();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);

    return () => {
      stopped = true;
      stats.dom.remove();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="pointer-events-none fixed bottom-0 right-0 z-[9999]"
      aria-hidden="true"
    />
  );
}
