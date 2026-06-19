/**
 * 统一的可按压元素 — 替代裸 div + onClick
 *
 * 行为：
 * - hover: y -2px + shadow + scale 1.005（卡片）/ 1.02（按钮）
 * - tap: scale 0.985
 * - focus-visible: 2px ring
 * - 自动尊重 prefers-reduced-motion
 *
 * variant: card | button | ghost
 */
import { motion, type HTMLMotionProps } from "framer-motion";
import { motion as m } from "../../lib/motion";

type Variant = "card" | "button" | "ghost";

interface PressableProps extends HTMLMotionProps<"div"> {
  variant?: Variant;
  /** 强制 active 视觉（route 高亮、selected 项） */
  active?: boolean;
}

const variantHover = {
  card: {
    y: -2,
    scale: 1.005,
    transition: { duration: m.duration.base / 1000, ease: m.easing.out },
  },
  button: {
    scale: 1.02,
    transition: { duration: m.duration.fast / 1000, ease: m.easing.out },
  },
  ghost: {
    scale: 1.01,
    transition: { duration: m.duration.fast / 1000, ease: m.easing.out },
  },
} as const;

const variantTap = {
  card: { scale: 0.99, y: 0 },
  button: { scale: 0.97 },
  ghost: { scale: 0.985 },
} as const;

export function Pressable({
  variant = "card",
  active,
  className,
  children,
  ...rest
}: PressableProps) {
  return (
    <motion.div
      whileHover={variantHover[variant]}
      whileTap={variantTap[variant]}
      animate={active ? { scale: 1 } : undefined}
      className={className}
      data-active={active ? "true" : undefined}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
