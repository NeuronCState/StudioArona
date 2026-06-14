/**
 * 列表容器 — 子项按 stagger 顺序进入
 *
 * 用法：
 *   <StaggerList>
 *     {items.map(i => <StaggerItem key={i.id}><Card /></StaggerItem>)}
 *   </StaggerList>
 *
 * staggerKey: 'list' (40ms) | 'page' (80ms)
 */
import { motion } from 'framer-motion'
import { listContainer, listItem, motion as m } from '../../lib/motion'
import type { ReactNode } from 'react'

interface StaggerListProps {
  children: ReactNode
  staggerKey?: keyof typeof m.stagger
  className?: string
  as?: 'div' | 'ul' | 'ol'
}

export function StaggerList({ children, staggerKey = 'list', className, as = 'div' }: StaggerListProps) {
  const MotionTag = motion[as]
  return (
    <MotionTag
      className={className}
      variants={listContainer(staggerKey)}
      initial="hidden"
      animate="show"
    >
      {children}
    </MotionTag>
  )
}

export function StaggerItem({
  children,
  className,
  as = 'div',
}: {
  children: ReactNode
  className?: string
  as?: 'div' | 'li'
}) {
  const MotionTag = motion[as]
  return (
    <MotionTag className={className} variants={listItem}>
      {children}
    </MotionTag>
  )
}
