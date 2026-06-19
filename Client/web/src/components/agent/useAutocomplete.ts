/**
 * useAutocomplete — `/` 命令面板 hook
 *
 * 检测 textarea 输入 `/` 触发, 上箭头/下箭头切换, 回车选中, Esc 关闭.
 * 候选列表从父组件传入 (skills + native commands + MCP tool 等).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { AutocompleteItem } from "./AutocompletePanel";

export function useAutocomplete(
  text: string,
  allItems: AutocompleteItem[],
  onInsert: (insertText: string) => void,
) {
  const [open, setOpen] = useState(false);
  const [filterText, setFilterText] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // 监听 text 变化: 检测 `/xxx` 模式
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // 找最后一个 `/` 在光标前
    const cursorPos = textarea.selectionStart ?? text.length;
    const beforeCursor = text.slice(0, cursorPos);
    const match = beforeCursor.match(/\/([^\s/]*)$/);

    if (match) {
      setOpen(true);
      setFilterText(match[1]);
      setActiveIndex(0);
      // 算位置: textarea + 光标像素
      // 简化: 用 textarea 的 getBoundingClientRect
      const rect = textarea.getBoundingClientRect();
      setPosition({ x: rect.left, y: rect.top });
    } else {
      setOpen(false);
      setFilterText("");
    }
  }, [text]);

  // 过滤 items
  const filtered = allItems.filter((item) => {
    if (!filterText) return true;
    return item.name.toLowerCase().includes(filterText.toLowerCase());
  });

  // 处理键盘事件 (返回 true 表示已处理, 调用方应 preventDefault)
  const handleKey = useCallback(
    (e: { key: string; preventDefault: () => void }): boolean => {
      if (!open || filtered.length === 0) return false;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % filtered.length);
        return true;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + filtered.length) % filtered.length);
        return true;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const item = filtered[activeIndex];
        if (item) {
          onInsert(item.insertText ?? `/${item.name} `);
          setOpen(false);
        }
        return true;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        return true;
      }
      return false;
    },
    [open, filtered, activeIndex, onInsert],
  );

  const close = useCallback(() => setOpen(false), []);

  return {
    open,
    filtered,
    activeIndex,
    setActiveIndex,
    handleKey,
    close,
    position,
    textareaRef,
  };
}
