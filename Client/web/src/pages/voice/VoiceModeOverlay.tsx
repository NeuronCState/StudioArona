import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, X } from 'lucide-react';
import { VoiceOrb } from './VoiceOrb';

type OrbState = 'idle' | 'listening' | 'thinking' | 'speaking';

interface VoiceModeOverlayProps {
  onClose: () => void;
}

export function VoiceModeOverlay({ onClose }: VoiceModeOverlayProps) {
  const [orbState, setOrbState] = useState<OrbState>('idle');
  const [userText, setUserText] = useState('');
  const [aiText, setAiText] = useState('');
  const [paused, setPaused] = useState(false);
  const [micDenied, setMicDenied] = useState(false);
  const [offline, setOffline] = useState(false);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Simulated voice flow: idle → listening → thinking → speaking → idle
  const simulateFlow = useCallback(() => {
    if (paused) return;

    setOrbState('listening');
    setUserText('');

    // Simulate ASR: append user text
    const userWords = '今天系统运行状态怎么样？';
    let userIdx = 0;
    const userInterval = setInterval(() => {
      if (userIdx < userWords.length) {
        setUserText(userWords.slice(0, userIdx + 1));
        userIdx++;
      } else {
        clearInterval(userInterval);
        setOrbState('thinking');

        setTimeout(() => {
          setOrbState('speaking');
          const aiWords = '系统运行正常，CPU 使用率 23%，内存使用 45%，GPU 温度 58°C，所有服务健康。';
          let aiIdx = 0;
          const aiInterval = setInterval(() => {
            if (aiIdx < aiWords.length) {
              setAiText(aiWords.slice(0, aiIdx + 1));
              aiIdx++;
            } else {
              clearInterval(aiInterval);
              setTimeout(() => {
                setOrbState('idle');
                setUserText('');
              }, 2000);
            }
          }, 60);
        }, 1500);
      }
    }, 80);
  }, [paused]);

  // Initialize audio context
  const initMic = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      setMicDenied(false);
      setOffline(false);

      // Start voice flow after mic is ready
      simulateFlow();
    } catch {
      setMicDenied(true);
    }
  }, [simulateFlow]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      audioCtxRef.current?.close();
    };
  }, []);

  // Toggle pause
  const handleTogglePause = () => {
    setPaused((p) => !p);
  };

  // Long press to close
  const handlePointerDown = () => {
    longPressRef.current = setTimeout(() => onClose(), 800);
  };
  const handlePointerUp = () => {
    if (longPressRef.current) clearTimeout(longPressRef.current);
  };

  // Keyboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === ' ') { e.preventDefault(); handleTogglePause(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-b from-[#0F0E0D] to-[#080808]"
      onClick={handleTogglePause}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
    >
      {/* Close button */}
      <button
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        className="absolute right-4 top-4 rounded-full p-2 text-white/40 hover:bg-white/10 hover:text-white/80 transition-colors"
        aria-label="退出语音模式"
      >
        <X size={20} />
      </button>

      {/* User subtitle (top) */}
      <div className="absolute top-[15%] left-0 right-0 px-8 text-center">
        <AnimatePresence mode="wait">
          {userText && (
            <motion.p
              key={userText}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="font-serif text-lg text-white/80"
            >
              {userText}
              {orbState === 'listening' && (
                <span className="ml-0.5 inline-block h-4 w-0.5 animate-cursor-blink bg-[var(--color-accent)]" />
              )}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {/* Voice orb (center) */}
      <div className="flex flex-col items-center gap-4">
        <VoiceOrb
          state={orbState}
          analyserNode={paused ? null : analyserRef.current}
          size={220}
        />

        {/* Status label */}
        <p className="text-xs text-white/30">
          {paused ? '已暂停' : orbState === 'idle' ? '轻触开始' : orbState === 'listening' ? '正在聆听...' : orbState === 'thinking' ? '思考中...' : '回复中...'}
        </p>
      </div>

      {/* AI subtitle (bottom) */}
      <div className="absolute bottom-[15%] left-0 right-0 px-8 text-center">
        <AnimatePresence mode="wait">
          {aiText && (
            <motion.p
              key={aiText}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="font-serif text-base text-white/60"
            >
              {aiText}
              {orbState === 'speaking' && (
                <span className="ml-0.5 inline-block h-4 w-0.5 animate-cursor-blink bg-white/50" />
              )}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {/* Mic permission dialog */}
      {micDenied && (
        <div className="absolute bottom-8 left-4 right-4 mx-auto max-w-sm rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
          <p className="text-sm text-white/80">需要麦克风权限才能使用语音模式</p>
          <button
            onClick={(e) => { e.stopPropagation(); initMic(); }}
            className="mt-3 flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/20 transition-colors"
          >
            <Mic size={14} />
            授予权限
          </button>
        </div>
      )}

      {/* Offline indicator */}
      {offline && (
        <div className="absolute bottom-4 flex items-center gap-2 rounded-full bg-white/5 px-3 py-1.5">
          <MicOff size={12} className="text-white/30" />
          <span className="text-xs text-white/30">离线</span>
        </div>
      )}

      {/* Start mic button (idle state) */}
      {orbState === 'idle' && !micDenied && (
        <button
          onClick={(e) => { e.stopPropagation(); initMic(); }}
          className="absolute bottom-8 flex items-center gap-2 rounded-full bg-white/10 px-5 py-2.5 text-sm text-white hover:bg-white/20 transition-colors"
        >
          <Mic size={16} />
          点击开始语音对话
        </button>
      )}

      {/* Hint */}
      <p className="absolute bottom-2 text-[10px] text-white/20">
        点击暂停 · 长按退出 · Esc 关闭
      </p>
    </motion.div>
  );
}
