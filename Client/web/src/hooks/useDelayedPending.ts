/**
 * useDelayedPending — 延迟显示 loading 状态, 避免快速 fetch 时的 skeleton 闪烁
 *
 * 问题: 快速网络下 (50-200ms) 切页面时, skeleton 只显示一瞬间就消失,
 *   反而比没有 skeleton 更"刺眼" (人眼对快速出现/消失的内容敏感)。
 *
 * 解决: 如果 loading 在 delay ms 内就结束, 一直不显示 loading 状态;
 *   如果超过 delay ms, 立刻显示并保持。
 *
 * 用法:
 *   const { data, isPending } = useQuery(...)
 *   const loading = useDelayedPending(isPending, { delay: 300 })
 *   if (loading) return <Skeleton />
 */
import { useEffect, useState } from "react";

interface UseDelayedPendingOptions {
  /** 延迟显示时间, ms. 默认 300. */
  delay?: number;
}

export function useDelayedPending(
  isPending: boolean,
  options: UseDelayedPendingOptions = {},
): boolean {
  const { delay = 300 } = options;
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!isPending) {
      // loading 结束, 立刻隐藏
      setShow(false);
      return;
    }
    // loading 开始, delay ms 后才显示
    const t = setTimeout(() => setShow(true), delay);
    return () => clearTimeout(t);
  }, [isPending, delay]);

  return show;
}
