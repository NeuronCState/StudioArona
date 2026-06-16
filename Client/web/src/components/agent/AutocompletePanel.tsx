/**
 * AutocompletePanel — `/` 命令面板 (SonettoHere 风格)
 *
 * 借鉴 SonettoHere AutocompletePanel.vue:
 * - Teleport 到 body, 浮在输入框上方
 * - items 列表, 上下箭头切换, 回车选中
 * - 模糊匹配 (含高亮)
 * - 视觉风格延续: stone/amber
 */
import { AnimatePresence, motion } from 'framer-motion';
import { Sparkles, Command, Search } from 'lucide-react';
import { useEffect, useRef } from 'react';

export interface AutocompleteItem {
  id: string;
  name: string;
  description: string;
  icon?: 'sparkles' | 'command' | 'search';
  /** 选中时插入到输入框的文字 (通常 '/name ') */
  insertText?: string;
}

interface AutocompletePanelProps {
  items: AutocompleteItem[];
  visible: boolean;
  /** 锚点位置 (相对视口) */
  position: { x: number; y: number };
  filterText: string;
  activeIndex: number;
  onSelect: (item: AutocompleteItem) => void;
  onActiveIndexChange: (idx: number) => void;
  onClose: () => void;
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded bg-amber-100 px-0.5 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

const ICON_MAP = {
  sparkles: Sparkles,
  command: Command,
  search: Search,
};

export function AutocompletePanel({
  items,
  visible,
  position,
  filterText,
  activeIndex,
  onSelect,
  onActiveIndexChange,
  onClose,
}: AutocompletePanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Click-outside 关闭
  useEffect(() => {
    if (!visible) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [visible, onClose]);

  if (!visible) return null;

  // 位置: 默认在锚点上方, 顶部超出视口时改下方
  const PANEL_MAX_HEIGHT = 240;
  const top = position.y - PANEL_MAX_HEIGHT - 8;
  const finalTop = top < 8 ? position.y + 24 : top;

  return (
    <>
      {/* 背景遮罩 (点击关闭) */}
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        aria-hidden="true"
      />
      <AnimatePresence>
        <motion.div
          ref={panelRef}
          initial={{ opacity: 0, y: 4, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 4, scale: 0.98 }}
          transition={{ duration: 0.12 }}
          className="fixed z-50 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-stone-200 bg-white shadow-xl dark:border-stone-700 dark:bg-stone-900"
          style={{ left: Math.max(8, Math.min(position.x, window.innerWidth - 340)), top: finalTop }}
        >
          <div className="max-h-60 overflow-y-auto p-1">
            {items.length === 0 ? (
              <div className="px-3 py-2 text-xs text-stone-500">无匹配</div>
            ) : (
              items.map((item, i) => {
                const Icon = item.icon ? ICON_MAP[item.icon] : Sparkles;
                return (
                  <button
                    key={item.id}
                    onClick={() => onSelect(item)}
                    onMouseEnter={() => onActiveIndexChange(i)}
                    className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors ${
                      i === activeIndex
                        ? 'bg-amber-50 text-amber-900 dark:bg-amber-900/30 dark:text-amber-100'
                        : 'text-stone-700 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800'
                    }`}
                  >
                    <Icon size={12} className="shrink-0" />
                    <span className="font-medium">
                      {highlightMatch(item.name, filterText)}
                    </span>
                    <span className="ml-auto truncate text-[10px] text-stone-400">
                      {item.description}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    </>
  );
}
