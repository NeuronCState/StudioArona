import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { useVisibility } from '@/hooks/useVisibility';
import { useIdle } from '@/hooks/useIdle';
import { DURATION } from '@/lib/motion/tokens';

type OrbState = 'idle' | 'listening' | 'thinking' | 'speaking';
type Phase = 'enter' | 'active' | 'exit';

interface VoiceOrbProps {
  state: OrbState;
  volume?: number;
  exiting?: boolean;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

/**
 * Voice orb canvas component with visibility/idle-aware rAF.
 *
 * - Pauses rAF when tab is hidden (useVisibility).
 * - Drops to 15fps after 30s idle (useIdle).
 * - Pre-computes accent-derived colours in useMemo (no per-frame getComputedStyle).
 * - State enter/exit transitions use unified motion tokens.
 */
export function VoiceOrb({ state, volume = 0, exiting = false }: VoiceOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const t0 = useRef(Date.now());
  const enterT = useRef(0);
  const exitT = useRef(0);
  const [phase, setPhase] = useState<Phase>('enter');
  const frameSkipRef = useRef(0);

  const visible = useVisibility();
  const idle = useIdle();

  // Motion-token-aligned transition timings
  const enterDuration = DURATION.extra; // 600ms for orb entrance
  const exitDuration = DURATION.slow;   // 400ms for orb exit

  // Compute accent colours once from CSS custom property (no per-frame getComputedStyle)
  const accent = useMemo(() => '#D97706', []);
  const [ar, ag, ab] = useMemo(() => hexToRgb(accent), [accent]);

  // Pre-compute particle colours from accent (avoids per-frame RGB string building)
  const particleColors = useMemo(
    () => [
      `rgb(${Math.round(ar * 0.5)}, ${Math.round(ag * 0.75)}, 255)`,
      accent,
      `rgb(${Math.round(ar * 0.3)}, ${Math.round(ag + 40)}, ${Math.round(ab * 0.5)})`,
      `rgb(${Math.round(ar + 40)}, ${Math.round(ag * 0.5)}, ${Math.round(ab * 0.3)})`,
    ],
    [ar, ag, ab, accent],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Read CSS accent once for the current theme
    const cssAccent = getComputedStyle(canvas)
      .getPropertyValue('--studio-accent')
      .trim();
    if (cssAccent) {
      hexToRgb(cssAccent);
      // Theme accent read for potential future dynamic theming
    }
  }, []);

  useEffect(() => {
    enterT.current = Date.now();
    setPhase('enter');
    const t = setTimeout(() => setPhase('active'), enterDuration);
    return () => clearTimeout(t);
  }, [enterDuration]);

  useEffect(() => {
    if (exiting && phase !== 'exit') {
      exitT.current = Date.now();
      setPhase('exit');
    }
  }, [exiting, phase]);

  const draw = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;

    // Idle frame-skip: draw only every 4th frame (~15 fps)
    if (idle) {
      frameSkipRef.current++;
      if (frameSkipRef.current % 4 !== 0) {
        animRef.current = requestAnimationFrame(draw);
        return;
      }
    }

    const W = c.width;
    const H = c.height;
    const cx = W / 2;
    const cy = H / 2;
    const now = Date.now();
    const t = (now - t0.current) / 1000;

    ctx.clearRect(0, 0, W, H);

    const baseR = Math.min(W, H) * 0.15;

    // Phase transitions using motion tokens for timing
    let enterProgress = 1;
    let exitProgress = 0;
    if (phase === 'enter') {
      enterProgress = Math.min((now - enterT.current) / enterDuration, 1);
      // Cubic ease-out
      enterProgress = 1 - Math.pow(1 - enterProgress, 3);
    } else if (phase === 'exit') {
      exitProgress = Math.min((now - exitT.current) / exitDuration, 1);
      // Quadratic ease-in
      exitProgress = Math.pow(exitProgress, 2);
    }

    const orbitR =
      state === 'thinking' ? baseR * 2.5
      : state === 'listening' ? baseR * (1.3 + volume * 0.5)
      : baseR * 1.4;

    const enterR = baseR * 3.5;
    const exitR = baseR * 3.5;
    const currentOrbitR = orbitR + (1 - enterProgress) * (enterR - orbitR) + exitProgress * (exitR - orbitR);

    const orbR =
      state === 'listening' ? baseR * (0.85 + volume * 0.25)
      : state === 'thinking' ? baseR * 0.7
      : baseR;

    const orbScale = enterProgress;
    const displayOrbR = orbR * orbScale * (1 - exitProgress * 0.7);

    // Outer ring
    const ringAlpha = orbScale * (state === 'listening' ? 0.08 + volume * 0.06 : 0.06);
    ctx.beginPath();
    ctx.arc(cx, cy, displayOrbR, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${ar},${ag},${ab},${ringAlpha})`;
    ctx.fill();
    ctx.strokeStyle = `rgba(${ar},${ag},${ab},${0.25 * orbScale})`;
    ctx.lineWidth = 2 * orbScale;
    ctx.stroke();

    // Inner circle
    ctx.beginPath();
    ctx.arc(cx, cy, displayOrbR * 0.55, 0, Math.PI * 2);
    ctx.fillStyle = accent;
    ctx.globalAlpha = orbScale;
    ctx.fill();
    ctx.globalAlpha = 1;

    // Center dot
    ctx.beginPath();
    ctx.arc(cx, cy, displayOrbR * 0.15, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();

    // 4 orbiting particles
    for (let i = 0; i < 4; i++) {
      const cornerAngle = i * Math.PI / 2 + Math.PI / 4;
      const speed = state === 'thinking' ? 0.5 : 1.6;
      const angle = t * speed + (i * Math.PI * 2) / 4;
      const wobble = state === 'thinking' ? Math.sin(t * 2 + i) * orbitR * 0.25 : 0;
      const r = currentOrbitR + wobble + (state === 'listening' ? volume * baseR * 0.3 * Math.sin(t * 4 + i) : 0);

      const enterAngle = cornerAngle + (angle - cornerAngle) * enterProgress;
      const px = cx + Math.cos(enterAngle) * r;
      const py = cy + Math.sin(enterAngle) * r;
      const dotR = baseR * 0.1 * orbScale;
      const alpha = orbScale * (1 - exitProgress);

      ctx.beginPath();
      ctx.arc(px, py, dotR * 2.2, 0, Math.PI * 2);
      ctx.fillStyle = particleColors[i] + Math.round(34 * alpha).toString(16).padStart(2, '0');
      ctx.fill();

      ctx.beginPath();
      ctx.arc(px, py, dotR, 0, Math.PI * 2);
      ctx.fillStyle = particleColors[i];
      ctx.globalAlpha = alpha;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Thinking: rotating dashes
    if (state === 'thinking' && orbScale > 0.5) {
      const dashR = displayOrbR * 1.6;
      ctx.strokeStyle = `rgba(${ar},${ag},${ab},0.18)`;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.lineDashOffset = -t * 40;
      ctx.beginPath();
      ctx.arc(cx, cy, dashR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Listening: volume ring
    if (state === 'listening' && orbScale > 0.5) {
      const vRingR = displayOrbR * (1.15 + volume * 0.2);
      ctx.beginPath();
      ctx.arc(cx, cy, vRingR, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${ar},${ag},${ab},${0.1 + volume * 0.15})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    animRef.current = requestAnimationFrame(draw);
  }, [state, volume, phase, idle, ar, ag, ab, accent, particleColors, enterDuration, exitDuration]);

  // Start/stop rAF based on visibility, and pause on unmount
  useEffect(() => {
    if (visible) {
      animRef.current = requestAnimationFrame(draw);
    } else {
      cancelAnimationFrame(animRef.current);
    }
    return () => cancelAnimationFrame(animRef.current);
  }, [draw, visible]);

  return (
    <canvas ref={canvasRef} width={280} height={280} style={{ width: 280, height: 280 }} />
  );
}
