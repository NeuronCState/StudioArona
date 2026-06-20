/**
 * 单元素淡入 — 支持两种触发模式：
 *
 * 1. 默认 (入场触发): <FadeIn delay={0.1}><H1 /></FadeIn>
 *    页面 mount 时自动播放 (适合首屏 hero / 大块内容)
 *
 * 2. 滚动触发 (Framer Motion 12 whileInView):
 *    <FadeIn whileInView viewportMargin="-60px"><Card /></FadeIn>
 *    元素滚动入视口时播放 (适合长列表、延迟渲染内容)
 */
import { motion } from "framer-motion";
import { fadeIn, scrollFadeIn } from "../../lib/motion";
import type { ReactNode } from "react";

export function FadeIn({
  children,
  delay = 0,
  className,
  whileInView: scroll,
  viewportMargin,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  /** 启用滚动触发 (Framer Motion 12 whileInView) */
  whileInView?: boolean;
  /** 视口 margin (CSS 值), 默认 "-60px" */
  viewportMargin?: string;
}) {
  if (scroll) {
    return (
      <motion.div
        className={className}
        variants={scrollFadeIn}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: viewportMargin ?? "-60px" }}
        transition={{ delay }}
      >
        {children}
      </motion.div>
    );
  }

  return (
    <motion.div className={className} {...fadeIn(delay)}>
      {children}
    </motion.div>
  );
}
