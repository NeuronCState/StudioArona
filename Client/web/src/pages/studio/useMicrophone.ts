import { useState, useRef, useCallback, useEffect } from 'react';

export function useMicrophone() {
  const [volume, setVolume] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number>(0);

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    ctxRef.current?.close();
    ctxRef.current = null;
    analyserRef.current = null;
    setIsActive(false);
    setVolume(0);
  }, []);

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const ctx = new AudioContext();
      ctxRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.7;
      analyserRef.current = analyser;
      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);
      setIsActive(true);

      const data = new Uint8Array(analyser.frequencyBinCount);
      const loop = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        setVolume(Math.min(avg / 128, 1));
        rafRef.current = requestAnimationFrame(loop);
      };
      loop();
    } catch {
      // Mic permission denied — simulate volume for demo
      setIsActive(true);
      const loop = () => {
        setVolume(0.1 + Math.random() * 0.4);
        rafRef.current = requestAnimationFrame(loop);
      };
      loop();
    }
  }, []);

  useEffect(() => () => stop(), [stop]);

  return { volume, isActive, start, stop };
}
