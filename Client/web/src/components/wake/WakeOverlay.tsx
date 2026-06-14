import { motion, AnimatePresence } from 'framer-motion';
import { useSessionStore } from '@/stores/session';

export function WakeOverlay() {
  const wakeState = useSessionStore((s) => s.wakeState);

  return (
    <AnimatePresence>
      {wakeState === 'waking' && (
        <motion.div
          key="wake-overlay"
          className="fixed inset-0 z-40 flex items-center justify-center bg-surface"
          initial={{ rotate: 90, scale: 0.8, opacity: 0 }}
          animate={{ rotate: 0, scale: 1, opacity: 1 }}
          exit={{ rotate: -90, scale: 0.8, opacity: 0 }}
          transition={{ duration: 1.2, ease: [0.34, 1.56, 0.64, 1] }}
        >
          <div className="flex flex-col items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent">
              <span className="text-2xl font-bold text-white">J</span>
            </div>
            <p className="text-sm text-text-secondary animate-pulse">正在唤醒...</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
