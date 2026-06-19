import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSessionStore } from "@/stores/session";

export function LeaveCountdown() {
  const wakeState = useSessionStore((s) => s.wakeState);
  const setWakeState = useSessionStore((s) => s.setWakeState);
  const [count, setCount] = useState(5);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (wakeState !== "leaving" || dismissed) return;

    setCount(5);
    const timer = setInterval(() => {
      setCount((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setWakeState("idle");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [wakeState, dismissed, setWakeState]);

  const handleKeep = () => {
    setDismissed(true);
    setWakeState("active");
  };

  if (wakeState !== "leaving" || dismissed) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center bg-surface/80 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          className="card flex flex-col items-center gap-4 p-8"
          initial={{ scale: 0.9 }}
          animate={{ scale: 1 }}
        >
          <div className="text-4xl font-bold font-mono text-accent">
            {count}
          </div>
          <p className="text-sm text-text-secondary">无人，即将清空对话</p>
          <button onClick={handleKeep} className="btn-primary">
            我还在，保留
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
