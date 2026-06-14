import { DURATION, EASING, bezierCSS } from './tokens';

/**
 * FLIP morph: smoothly animate `to` from the position/size of `from`.
 *
 * Usage (called by A in data-transition scenarios):
 *   const skeleton = document.getElementById('card-skeleton')!;
 *   const loaded   = document.getElementById('card-loaded')!;
 *   flipMorph(skeleton, loaded);
 *
 * Returns the WAAPI Animation object so callers can await `.finished`.
 */
export function flipMorph(from: HTMLElement, to: HTMLElement): Animation {
  const f = from.getBoundingClientRect();
  const t = to.getBoundingClientRect();

  const dx = f.left - t.left;
  const dy = f.top - t.top;
  const sx = f.width / t.width;
  const sy = f.height / t.height;

  return to.animate(
    [
      {
        transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`,
      },
      {
        transform: 'translate(0, 0) scale(1, 1)',
      },
    ],
    {
      duration: DURATION.base,
      easing: bezierCSS(EASING.out),
      fill: 'both',
    },
  );
}

/**
 * Convenience: call flipMorph then hide `from` when the animation finishes.
 */
export async function flipReplace(from: HTMLElement, to: HTMLElement): Promise<void> {
  const anim = flipMorph(from, to);
  await anim.finished;
  from.style.display = 'none';
}
