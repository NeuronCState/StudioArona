/**
 * Motion design tokens — 全站统一动效规范
 *
 * 三个核心原则：
 * 1. 时长档位 5 档（instant / fast / base / slow / scenic）
 * 2. easing 统一为 3 种（out / inout / spring）
 * 3. 列表/页面元素用 stagger，自动按索引算 delay
 *
 * 改这里 = 改全站。duration 单位 ms，easing 是 cubic-bezier 字符串。
 */
export const motion = {
  duration: {
    instant: 75, // 0.075s — hover/focus 微反馈
    fast: 150, // 0.15s — toggle/checkbox/ripple
    base: 240, // 0.24s — modal slide, dropdown, card hover
    slow: 400, // 0.4s — 页面切换, drawer
    scenic: 600, // 0.6s — loading skeleton, hero, large cards
  },
  easing: {
    out: [0.16, 1, 0.3, 1] as const, // 收尾快，spring-like
    inout: [0.65, 0, 0.35, 1] as const, // 整体进出场
    spring: [0.34, 1.56, 0.64, 1] as const, // bounce 一点（少量用）
  },
  stagger: {
    list: 0.04, // 列表项 40ms 间隔
    page: 0.08, // 页面元素 80ms 间隔
  },
} as const;

/** 转成 framer-motion transition 对象 */
export const t = {
  instant: {
    duration: motion.duration.instant / 1000,
    ease: motion.easing.out,
  },
  fast: { duration: motion.duration.fast / 1000, ease: motion.easing.out },
  base: { duration: motion.duration.base / 1000, ease: motion.easing.out },
  slow: { duration: motion.duration.slow / 1000, ease: motion.easing.out },
  spring: { duration: motion.duration.base / 1000, ease: motion.easing.spring },
} as const;

/** 列表容器 variants — 子项 stagger */
export const listContainer = (
  staggerKey: keyof typeof motion.stagger = "list",
) => ({
  hidden: { opacity: 1 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: motion.stagger[staggerKey],
      delayChildren: 0.05,
    },
  },
});

/** 列表子项 variants — y 8→0 + opacity */
export const listItem = {
  hidden: { opacity: 0, y: 8 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      duration: motion.duration.base / 1000,
      ease: motion.easing.out,
    },
  },
};

/** 单元素淡入 */
export const fadeIn = (delay = 0) => ({
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: {
    duration: motion.duration.base / 1000,
    ease: motion.easing.out,
    delay,
  },
});

/**
 * Scroll-triggered variants for whileInView usage (Framer Motion 12).
 *
 * Usage:
 *   <motion.div variants={scrollFadeIn} initial="hidden" whileInView="visible"
 *     viewport={{ once: true, margin: "-60px" }} />
 *
 *   <motion.ul variants={scrollStaggerContainer} initial="hidden" whileInView="show">
 *     {items.map(i => <motion.li variants={scrollStaggerItem} key={i.id}>{i}</motion.li>)}
 *   </motion.ul>
 */
export const scrollFadeIn = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: motion.duration.base / 1000,
      ease: motion.easing.out,
    },
  },
};

export const scrollStaggerContainer = {
  hidden: { opacity: 1 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: motion.stagger.list,
      delayChildren: 0.05,
    },
  },
};

export const scrollStaggerItem = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      duration: motion.duration.base / 1000,
      ease: motion.easing.out,
    },
  },
};
