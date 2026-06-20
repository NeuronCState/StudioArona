/**
 * 列表容器 — 子项按 stagger 顺序进入。支持两种触发模式：
 *
 * 1. 默认 (入场触发):
 *    <StaggerList>
 *      {items.map(i => <StaggerItem key={i.id}><Card /></StaggerItem>)}
 *    </StaggerList>
 *    页面 mount 时自动播放 stagger (适合首屏列表)
 *
 * 2. 滚动触发 (Framer Motion 12 whileInView):
 *    <StaggerList whileInView viewportMargin="-80px">
 *      {items.map(i => <StaggerItem key={i.id}><Card /></StaggerItem>)}
 *    </StaggerList>
 *    列表滚动入视口时才开始 stagger (适合长列表、延迟渲染内容)
 *
 * staggerKey: 'list' (40ms) | 'page' (80ms)
 */
import { motion } from "framer-motion";
import {
  listContainer,
  listItem,
  scrollStaggerContainer,
  scrollStaggerItem,
} from "../../lib/motion";
import type { ReactNode } from "react";

interface StaggerListProps {
  children: ReactNode;
  staggerKey?: "list" | "page";
  className?: string;
  as?: "div" | "ul" | "ol";
  /** 启用滚动触发 (Framer Motion 12 whileInView) */
  whileInView?: boolean;
  /** 视口 margin (CSS 值), 默认 "-80px" */
  viewportMargin?: string;
}

export function StaggerList({
  children,
  staggerKey = "list",
  className,
  as = "div",
  whileInView: scroll,
  viewportMargin,
}: StaggerListProps) {
  const MotionTag = motion[as];

  if (scroll) {
    return (
      <MotionTag
        className={className}
        variants={scrollStaggerContainer}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: viewportMargin ?? "-80px" }}
      >
        {children}
      </MotionTag>
    );
  }

  return (
    <MotionTag
      className={className}
      variants={listContainer(staggerKey)}
      initial="hidden"
      animate="show"
    >
      {children}
    </MotionTag>
  );
}

export function StaggerItem({
  children,
  className,
  as = "div",
  whileInView: scroll,
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "li";
  /** 配合父级 StaggerList whileInView 使用 */
  whileInView?: boolean;
}) {
  const MotionTag = motion[as];
  return (
    <MotionTag
      className={className}
      variants={scroll ? scrollStaggerItem : listItem}
    >
      {children}
    </MotionTag>
  );
}
