import { useRef, useEffect, useCallback } from 'react';

type OrbState = 'idle' | 'listening' | 'thinking' | 'speaking';

interface VoiceOrbProps {
  state: OrbState;
  analyserNode?: AnalyserNode | null;
  size?: number;
}

// Soft-blue Arona primary color sets
const stateColors: Record<OrbState, { primary: string; secondary: string; glow: string }> = {
  idle:    { primary: '#4A90D9', secondary: '#7AB4F0', glow: 'rgba(74,144,217,0.15)' },
  listening: { primary: '#4A90D9', secondary: '#95C5F5', glow: 'rgba(74,144,217,0.3)' },
  thinking:  { primary: '#7B61FF', secondary: '#A99BFF', glow: 'rgba(123,97,255,0.25)' },
  speaking:  { primary: '#D99970', secondary: '#F0C080', glow: 'rgba(217,153,112,0.25)' },
};

interface OrbitParticle {
  angle: number;
  speed: number;
  radius: number;
  size: number;
  opacity: number;
  phase: number;
}

export function VoiceOrb({ state, analyserNode, size = 200 }: VoiceOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const timeRef = useRef(0);
  const particlesRef = useRef<OrbitParticle[]>([]);
  const prevStateRef = useRef<OrbState>(state);

  // Initialize 120 orbiting particles for gorgeous 3D aura simulation
  useEffect(() => {
    const items: OrbitParticle[] = [];
    for (let i = 0; i < 120; i++) {
      items.push({
        angle: Math.random() * Math.PI * 2,
        speed: (Math.random() * 0.02 + 0.005) * (Math.random() > 0.5 ? 1 : -1),
        radius: Math.random() * 25 + 50, // Orbiting belt distance range
        size: Math.random() * 2 + 0.8,
        opacity: Math.random() * 0.7 + 0.2,
        phase: Math.random() * Math.PI,
      });
    }
    particlesRef.current = items;
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = size * dpr;
    const h = size * dpr;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      ctx.scale(dpr, dpr);
    }

    const centerX = size / 2;
    const centerY = size / 2;
    const baseRadius = size * 0.24;

    ctx.clearRect(0, 0, size, size);

    timeRef.current += 0.016;
    const t = timeRef.current;
    const colors = stateColors[state];

    // Frequency data
    let freqData: Uint8Array | null = null;
    let volumeRatio = 0;
    if (analyserNode) {
      const buf = new Uint8Array(analyserNode.frequencyBinCount);
      analyserNode.getByteFrequencyData(buf);
      freqData = buf;
      volumeRatio = buf.reduce((a, b) => a + b, 0) / buf.length / 255;
    }

    // Glow background
    const glowGrad = ctx.createRadialGradient(centerX, centerY, baseRadius * 0.3, centerX, centerY, baseRadius * 2.5);
    let glowAlphaMult = 1.0;
    if (state === 'listening') glowAlphaMult = 1.2 + volumeRatio * 1.5;
    else if (state === 'speaking') glowAlphaMult = 1.0 + volumeRatio * 2.0;
    else if (state === 'thinking') glowAlphaMult = 0.8 + 0.3 * Math.sin(t * 8);

    glowGrad.addColorStop(0, colors.glow.replace('0.25', (0.25 * glowAlphaMult).toString()).replace('0.3', (0.3 * glowAlphaMult).toString()).replace('0.15', (0.15 * glowAlphaMult).toString()));
    glowGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(centerX, centerY, baseRadius * 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Soft fluid breathing scale
    let scale = 1;
    if (state === 'idle') {
      scale = 0.96 + 0.04 * Math.sin(t * 2);
    } else if (state === 'listening') {
      scale = 0.95 + 0.05 * Math.sin(t * 3) + volumeRatio * 0.15;
    } else if (state === 'thinking') {
      scale = 0.97 + 0.03 * Math.sin(t * 10); // high frequency shiver
    } else if (state === 'speaking') {
      scale = 0.94 + 0.06 * Math.sin(t * 4) + volumeRatio * 0.25;
    }

    const r = baseRadius * scale;

    // Draw the 120 fluid particle paths orbiting the sphere
    const particles = particlesRef.current;
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];

      // Physics state adjustments based on AI state
      if (state === 'thinking') {
        p.angle += p.speed * 3.5; // speed up orbit
      } else if (state === 'listening') {
        p.angle += p.speed * (1 + volumeRatio * 4);
      } else if (state === 'speaking') {
        p.angle += p.speed * (1 + volumeRatio * 6);
      } else {
        p.angle += p.speed; // idle slow rotation
      }

      // Orbital distance scaling based on audio frequency mapping
      let audioPush = 0;
      if (freqData && i < freqData.length) {
        audioPush = (freqData[i] / 255) * 35;
      } else if (state === 'speaking') {
        audioPush = (0.5 + 0.5 * Math.sin(t * 10 + i)) * 12;
      }

      const currentRadius = p.radius + audioPush;

      // Calculate 3D simulated coordinate projections
      const px = centerX + Math.cos(p.angle) * currentRadius * Math.cos(t * 0.2 + p.phase * 0.1);
      const py = centerY + Math.sin(p.angle) * currentRadius;
      const sizeScale = (Math.sin(p.angle) + 2) / 2; // depth size effect
      const currentOpacity = p.opacity * sizeScale * (0.5 + 0.5 * Math.sin(t * 2 + p.phase));

      ctx.fillStyle = colors.secondary;
      ctx.globalAlpha = currentOpacity;
      ctx.beginPath();
      ctx.arc(px, py, p.size * sizeScale, 0, Math.PI * 2);
      ctx.fill();
    }

    // Reset alpha
    ctx.globalAlpha = 1.0;

    // Outer water ripples for speaking/listening
    if (state === 'speaking' || state === 'listening') {
      ctx.strokeStyle = state === 'speaking' ? 'rgba(217, 153, 112, 0.12)' : 'rgba(74, 144, 217, 0.12)';
      ctx.lineWidth = 1;

      const ripples = 3;
      for (let i = 0; i < ripples; i++) {
        const rippleScale = 1 + ((t * 0.5 + i / ripples) % 1) * 1.2;
        ctx.beginPath();
        ctx.arc(centerX, centerY, r * rippleScale, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // Main central warm-light orb
    const orbGrad = ctx.createRadialGradient(centerX - r * 0.15, centerY - r * 0.2, r * 0.05, centerX, centerY, r);
    orbGrad.addColorStop(0, colors.secondary);
    orbGrad.addColorStop(0.65, colors.primary);
    orbGrad.addColorStop(1, '#0e0d0c');
    ctx.fillStyle = orbGrad;
    ctx.beginPath();
    ctx.arc(centerX, centerY, r, 0, Math.PI * 2);
    ctx.fill();

    animRef.current = requestAnimationFrame(draw);
  }, [state, analyserNode, size]);

  useEffect(() => {
    prevStateRef.current = state;
    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className="shrink-0"
      aria-label={`语音球: ${
        state === 'idle' ? '待机' : state === 'listening' ? '聆听中' : state === 'thinking' ? '思考中' : '说话中'
      }`}
    />
  );
}
