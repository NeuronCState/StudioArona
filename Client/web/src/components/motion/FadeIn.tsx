/**
 * 单元素淡入 — 按 delay 排序进
 *
 * 用法：<FadeIn delay={0.1}><H1 /></FadeIn>
 * 适合页面级 hero / 大块内容
 */
import { motion } from 'framer-motion'
import { fadeIn } from '../../lib/motion'
import type { ReactNode } from 'react'

export function FadeIn({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode
  delay?: number
  className?: string
}) {
  return (
    <motion.div className={className} {...fadeIn(delay)}>
      {children}
    </motion.div>
  )
}
