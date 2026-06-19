import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { motion as m } from "@/lib/motion";
import { useReducedMotion } from "@/hooks/useReducedMotion";

/**
 * FocusToggle — 收回指示条
 *
 * 位置: 固定在侧边栏右面, 垂直居中
 * 尺寸: 8px 宽 × 屏幕 30% 高 (上下各 35% 边距)
 * 视觉: 跟 StudioSidebar 颜色稍重一点的细条 + 中间 `<<` / `>>` 图标
 *
 * 行为:
 *  - focus mode 时显示
 *  - 点击 → toggleFocusSidebar
 *  - z-index: 高于 4 磁贴, 低于 AgentPanel
 */
export interface FocusToggleProps {
  visible: boolean;
  open: boolean;
  onToggle: () => void;
}

export function FocusToggle({ visible, open, onToggle }: FocusToggleProps) {
  const reducedMotion = useReducedMotion();

  return (
    <AnimatePresence initial={false}>
      {visible && (
        <motion.div
          key="focus-toggle"
          className="focus-toggle-wrapper"
          initial={reducedMotion ? false : { opacity: 0, x: -8, y: "-50%" }}
          animate={{ opacity: 1, x: 0, y: "-50%" }}
          exit={{ opacity: 0, x: -8, y: "-50%" }}
          transition={{
            duration: reducedMotion ? 0 : m.duration.fast / 1000,
            ease: m.easing.out,
          }}
        >
          <motion.button
            type="button"
            onClick={onToggle}
            aria-label={open ? "收起专注侧栏" : "展开专注侧栏"}
            aria-expanded={open}
            whileHover={reducedMotion ? undefined : { width: 12 }}
            whileTap={reducedMotion ? undefined : { scale: 0.92 }}
            className="focus-toggle"
          >
            <motion.span
              className="focus-toggle-icon"
              animate={{ x: reducedMotion ? 0 : open ? 1 : -1 }}
              transition={{ duration: reducedMotion ? 0 : 0.2 }}
              aria-hidden="true"
            >
              {open ? <ChevronLeft size={10} /> : <ChevronRight size={10} />}
            </motion.span>
          </motion.button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
