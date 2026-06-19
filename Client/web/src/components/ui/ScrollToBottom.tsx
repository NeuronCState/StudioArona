import { useState, useEffect, useCallback, useRef } from "react";
import { ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface ScrollToBottomProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  threshold?: number;
}

export function ScrollToBottom({
  containerRef,
  threshold = 300,
}: ScrollToBottomProps) {
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const checkScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    setVisible(distance > threshold);
  }, [containerRef, threshold]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Debounced scroll handler
    const handleScroll = () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(checkScroll, 100);
    };

    el.addEventListener("scroll", handleScroll, { passive: true });

    // Initial check
    checkScroll();

    return () => {
      el.removeEventListener("scroll", handleScroll);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [checkScroll]);

  const scrollToBottom = () => {
    containerRef.current?.scrollTo({
      top: containerRef.current.scrollHeight,
      behavior: "smooth",
    });
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          onClick={scrollToBottom}
          className="absolute bottom-20 right-4 z-20 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface-raised text-text-secondary shadow-md hover:text-accent"
          initial={{ opacity: 0, scale: 0.8, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: 10 }}
          transition={{ duration: 0.2 }}
          aria-label="回到底部"
        >
          <ChevronDown size={18} />
        </motion.button>
      )}
    </AnimatePresence>
  );
}
