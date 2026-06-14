/**
 * 月历 — 手动选日期
 *
 * 行为：
 * - 6 行 × 7 列网格（首行补上月尾 + 本月 + 下月开头）
 * - 点 < > 翻月份
 * - 点日期: 选中
 * - 今天: 圆点标记
 * - 跨月日期: 淡色显示
 * - 当前选中: amber 高亮
 * - 国际化: locale (默认 zh-CN)
 *
 * 配色: dark theme (用于 Schedule sheet)
 * 如果用在浅色页面, 传 variant="light"
 */
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { motion as m } from '../../lib/motion';

export interface CalendarValue {
  /** 本地日期, 00:00:00, ISO 字符串 */
  iso: string;
}

interface CalendarProps {
  value?: string | null;
  onChange: (iso: string) => void;
  /** 月份初值, 默认今天 */
  initialMonth?: Date;
  variant?: 'dark' | 'light';
}

const WEEKDAYS_ZH = ['日', '一', '二', '三', '四', '五', '六'];
const WEEKDAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function buildMonthGrid(year: number, monthIdx: number): Date[] {
  // monthIdx: 0-11
  const first = new Date(year, monthIdx, 1);
  const dayOfWeek = first.getDay(); // 0 = Sunday
  // Start from the Sunday on/before the first
  const start = new Date(first);
  start.setDate(first.getDate() - dayOfWeek);

  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    cells.push(d);
  }
  return cells;
}

function formatMonth(d: Date, locale = 'zh-CN'): string {
  return d.toLocaleDateString(locale, { year: 'numeric', month: 'long' });
}

function toLocalIsoDate(d: Date): string {
  // YYYY-MM-DD (本地时区, 不含时间)
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

export function Calendar({
  value,
  onChange,
  initialMonth,
  variant = 'dark',
}: CalendarProps) {
  const today = useMemo(() => startOfDay(new Date()), []);
  const selected = useMemo(() => (value ? startOfDay(new Date(value)) : null), [value]);

  const [view, setView] = useState(() => {
    if (initialMonth) return new Date(initialMonth);
    return selected ?? today;
  });

  const cells = useMemo(
    () => buildMonthGrid(view.getFullYear(), view.getMonth()),
    [view.getFullYear(), view.getMonth()],
  );

  const isDark = variant === 'dark';
  const weekdays = isDark ? WEEKDAYS_ZH : WEEKDAYS_EN;

  const colorText = isDark ? 'text-stone-100' : 'text-stone-900';
  const colorMuted = isDark ? 'text-stone-500' : 'text-stone-400';
  const colorHover = isDark ? 'hover:bg-stone-800' : 'hover:bg-stone-100';
  const colorToday = isDark ? 'text-amber-400' : 'text-amber-600';
  const colorSelected = isDark
    ? 'bg-amber-500 text-stone-900 shadow-lg shadow-amber-500/30'
    : 'bg-amber-500 text-white shadow-lg shadow-amber-500/30';
  const colorSelectedHover = isDark ? 'hover:bg-amber-400' : 'hover:bg-amber-600';

  return (
    <div className={`w-full select-none ${isDark ? '' : ''}`}>
      {/* 头部: 月份切换 */}
      <div className="mb-4 flex items-center justify-between">
        <motion.button
          type="button"
          onClick={() => {
            const d = new Date(view);
            d.setMonth(d.getMonth() - 1);
            setView(d);
          }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          transition={{ duration: m.duration.fast / 1000, ease: m.easing.out }}
          className={`rounded-md p-1.5 ${colorHover} ${colorMuted}`}
          aria-label="上个月"
        >
          <ChevronLeft size={16} />
        </motion.button>

        <div className={`text-sm font-semibold ${colorText}`}>{formatMonth(view)}</div>

        <motion.button
          type="button"
          onClick={() => {
            const d = new Date(view);
            d.setMonth(d.getMonth() + 1);
            setView(d);
          }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          transition={{ duration: m.duration.fast / 1000, ease: m.easing.out }}
          className={`rounded-md p-1.5 ${colorHover} ${colorMuted}`}
          aria-label="下个月"
        >
          <ChevronRight size={16} />
        </motion.button>
      </div>

      {/* 星期表头 */}
      <div className={`mb-2 grid grid-cols-7 text-center text-[10px] font-medium uppercase tracking-wider ${colorMuted}`}>
        {weekdays.map((w) => (
          <div key={w} className="py-1">
            {w}
          </div>
        ))}
      </div>

      {/* 日期网格 */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          const inMonth = d.getMonth() === view.getMonth();
          const isToday = sameDay(d, today);
          const isSelected = selected ? sameDay(d, selected) : false;

          return (
            <motion.button
              type="button"
              key={i}
              onClick={() => onChange(toLocalIsoDate(d))}
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.92 }}
              transition={{ duration: m.duration.fast / 1000, ease: m.easing.out }}
              className={[
                'relative flex h-10 items-center justify-center rounded-lg text-sm transition-colors',
                isSelected
                  ? `${colorSelected} font-semibold ${colorSelectedHover}`
                  : [
                      inMonth ? colorText : colorMuted,
                      isToday && !isSelected ? `${colorToday} font-semibold` : '',
                      !isSelected ? colorHover : '',
                    ]
                      .filter(Boolean)
                      .join(' '),
              ].join(' ')}
            >
              {d.getDate()}
              {isToday && !isSelected && (
                <span
                  className={`absolute bottom-1.5 h-1 w-1 rounded-full ${isDark ? 'bg-amber-400' : 'bg-amber-500'}`}
                />
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
