import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { motion as m } from '@/lib/motion';

/**
 * FocusToggle — 收回指示条
 *
 * 位置: 固定在主分界线中点, 朝右突出
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
  if (!visible) return null;

  return (
    <motion.button
      type="button"
      onClick={onToggle}
      aria-label={open ? '收起专注侧栏' : '展开专注侧栏'}
      aria-expanded={open}
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -8 }}
      transition={{ duration: m.duration.fast / 1000, ease: m.easing.out }}
      whileHover={{ width: 12 }}
      whileTap={{ scale: 0.92 }}
      className="focus-toggle"
    >
      <motion.span
        className="focus-toggle-icon"
        animate={{ x: open ? 1 : -1 }}
        transition={{ duration: 0.2 }}
      >
        {open ? <ChevronLeft size={10} /> : <ChevronRight size={10} />}
      </motion.span>
    </motion.button>
  );
}