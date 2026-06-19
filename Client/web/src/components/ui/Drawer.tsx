/**
 * 通用 Drawer 组件 — 通过 React Portal 渲染到 document.body
 *
 * 解决 ancestor transform/filter 创建 fixed containing block 的问题。
 * Portal 之后, 抽屉不受任何祖先元素的 transform/filter 影响, 永远是 100vw/100vh。
 *
 * 两种方向 + 两种 top 形态：
 * - from='top' variant='card': 顶部居中小卡片（带圆角）
 * - from='top' variant='sheet': 整页深色 sheet, 从 header 下方覆盖整页
 * - from='right': 右侧滑出 100vh 高, 自定义宽度
 *
 * 自动：
 * - 背景遮罩 fade
 * - 抽屉本体 spring
 * - Esc 关闭 + body 滚动锁
 * - 点击遮罩关闭
 */
import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { motion as m } from "../../lib/motion";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  from?: "top" | "right";
  /** top 才有效: card = 顶部小卡片, sheet = 整页深色 sheet 覆盖 */
  variant?: "card" | "sheet";
  title?: string;
  /** right drawer 用 */
  width?: string;
  children: ReactNode;
}

const topCardVariants = {
  hidden: { y: "-100%", opacity: 0 },
  show: { y: 0, opacity: 1 },
  exit: { y: "-100%", opacity: 0 },
};

const topSheetVariants = {
  hidden: { y: "-100%", opacity: 0 },
  show: { y: 0, opacity: 1 },
  exit: { y: "-100%", opacity: 0 },
};

const rightVariants = {
  hidden: { x: "100%", opacity: 0 },
  show: { x: 0, opacity: 1 },
  exit: { x: "100%", opacity: 0 },
};

const overlayVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1 },
  exit: { opacity: 0 },
};

export function Drawer({
  open,
  onClose,
  from = "top",
  variant = "card",
  title,
  width = "480px",
  children,
}: DrawerProps) {
  // Esc 关闭
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // body 滚动锁
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (typeof document === "undefined") return null;

  const isTop = from === "top";
  const isSheet = isTop && variant === "sheet";
  const panelVariants = isTop
    ? isSheet
      ? topSheetVariants
      : topCardVariants
    : rightVariants;

  const content = (
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-[100]"
          style={{ pointerEvents: "auto" }}
          role="dialog"
          aria-modal="true"
        >
          {/* 背景遮罩 — sheet 模式更深 */}
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            variants={overlayVariants}
            initial="hidden"
            animate="show"
            exit="exit"
            transition={{
              duration: m.duration.base / 1000,
              ease: m.easing.out,
            }}
            onClick={onClose}
          />

          {/* 抽屉本体 */}
          <motion.div
            className={
              isTop
                ? isSheet
                  ? // sheet 模式: 全宽, 从 top 开始, 高度填满, 整页深色背景
                    "absolute left-0 top-0 h-full w-full"
                  : // card 模式: 居中圆角小卡
                    "absolute left-1/2 top-0 -translate-x-1/2 w-full max-w-3xl px-4 pt-4"
                : // right 模式: 右侧整页高
                  "absolute right-0 top-0 h-full w-full overflow-y-auto bg-[var(--color-surface)] shadow-2xl"
            }
            style={isTop ? undefined : { width, maxWidth: "100vw" }}
            variants={panelVariants}
            initial="hidden"
            animate="show"
            exit="exit"
            transition={{
              type: "spring",
              stiffness: 380,
              damping: 38,
              mass: 0.9,
            }}
          >
            <div
              className={
                isSheet
                  ? // sheet: 整页深色背景, 无圆角
                    "h-full bg-stone-900 text-stone-100"
                  : isTop
                    ? "rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl"
                    : "h-full"
              }
            >
              {/* header */}
              <div
                className={
                  isSheet
                    ? // sheet header: 深色背景上的浅色文字
                      "flex items-center justify-between border-b border-stone-700/60 px-6 py-4"
                    : "flex items-center justify-between border-b border-[var(--color-border)] px-5 py-3"
                }
              >
                <h3
                  className={
                    isSheet
                      ? "text-base font-semibold text-stone-100"
                      : "text-sm font-semibold text-[var(--color-text-primary)]"
                  }
                >
                  {title}
                </h3>
                <button
                  onClick={onClose}
                  className={
                    isSheet
                      ? "rounded-md p-1.5 text-stone-400 hover:bg-stone-800 hover:text-stone-100"
                      : "rounded-md p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg)] hover:text-[var(--color-text-primary)]"
                  }
                  aria-label="关闭"
                >
                  <X size={isSheet ? 18 : 16} />
                </button>
              </div>

              {/* 内容 */}
              <div className={isSheet ? "p-6" : isTop ? "p-5" : "p-6"}>
                {children}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  return createPortal(content, document.body);
}
