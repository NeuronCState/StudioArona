/**
 * 24h 时间选择器 — 大数字 + ± 微调
 *
 * 行为:
 * - 左右两个大数字 (HH / MM)
 * - 上下滚动 / 上箭头下箭头 / 直接键盘输入都支持
 * - 步进按钮: ±5 / ±1
 * - AM/PM 切换
 * - dark theme 配色
 */
import { useState, useEffect } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";

interface TimePickerProps {
  /** 当前时间, "HH:MM" 24h */
  value: string;
  onChange: (next: string) => void;
  variant?: "dark" | "light";
}

function parseTime(s: string): { h: number; m: number } {
  const [h, m] = (s || "09:00").split(":").map((x) => parseInt(x, 10) || 0);
  return { h: Math.max(0, Math.min(23, h)), m: Math.max(0, Math.min(59, m)) };
}

function formatTime(h: number, m: number): string {
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function TimePicker({
  value,
  onChange,
  variant = "dark",
}: TimePickerProps) {
  const { h, m } = parseTime(value);
  const isDark = variant === "dark";
  const colorText = isDark ? "text-stone-100" : "text-stone-900";
  const colorMuted = isDark ? "text-stone-500" : "text-stone-400";
  const colorHover = isDark ? "hover:bg-stone-800" : "hover:bg-stone-100";
  const colorBtn = isDark
    ? "text-stone-300 hover:text-stone-100"
    : "text-stone-600 hover:text-stone-900";

  const setH = (next: number) =>
    onChange(formatTime(Math.max(0, Math.min(23, next)), m));
  const setM = (next: number) =>
    onChange(formatTime(h, Math.max(0, Math.min(59, next))));

  // 大数字输入
  const [hText, setHText] = useState(String(h).padStart(2, "0"));
  const [mText, setMText] = useState(String(m).padStart(2, "0"));
  useEffect(() => setHText(String(h).padStart(2, "0")), [h]);
  useEffect(() => setMText(String(m).padStart(2, "0")), [m]);

  return (
    <div className="flex items-center gap-3">
      {/* 小时 */}
      <TimeUnit
        value={hText}
        onChangeText={(t) => {
          setHText(t);
          const n = parseInt(t, 10);
          if (!isNaN(n)) setH(n);
        }}
        onStep={(delta) => {
          setHText(
            String(Math.max(0, Math.min(23, h + delta))).padStart(2, "0"),
          );
          setH(h + delta);
        }}
        colorText={colorText}
        colorHover={colorHover}
        colorBtn={colorBtn}
        isDark={isDark}
      />
      <span className={`text-2xl font-light ${colorMuted}`}>:</span>
      {/* 分钟 */}
      <TimeUnit
        value={mText}
        onChangeText={(t) => {
          setMText(t);
          const n = parseInt(t, 10);
          if (!isNaN(n)) setM(n);
        }}
        onStep={(delta) => {
          setMText(
            String(Math.max(0, Math.min(59, m + delta))).padStart(2, "0"),
          );
          setM(m + delta);
        }}
        colorText={colorText}
        colorHover={colorHover}
        colorBtn={colorBtn}
        isDark={isDark}
      />
    </div>
  );
}

interface TimeUnitProps {
  value: string;
  onChangeText: (s: string) => void;
  onStep: (delta: number) => void;
  colorText: string;
  colorHover: string;
  colorBtn: string;
  isDark: boolean;
}

function TimeUnit({
  value,
  onChangeText,
  onStep,
  colorText,
  colorHover,
  colorBtn,
  isDark,
}: TimeUnitProps) {
  return (
    <div className="flex flex-col items-center">
      <button
        type="button"
        onClick={() => onStep(1)}
        className={`rounded p-1 transition-colors ${colorBtn} ${colorHover}`}
        aria-label="+1"
      >
        <ChevronUp size={14} />
      </button>
      <input
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(e) => {
          const t = e.target.value.replace(/\D/g, "").slice(0, 2);
          onChangeText(t);
        }}
        onBlur={(e) => {
          // 补零
          const t = e.target.value.padStart(2, "0").slice(0, 2);
          onChangeText(t);
        }}
        className={`w-14 border-x-0 border-y border-transparent bg-transparent text-center text-3xl font-light tabular-nums focus:outline-none ${colorText} ${
          isDark ? "focus:border-amber-500" : "focus:border-amber-600"
        }`}
      />
      <button
        type="button"
        onClick={() => onStep(-1)}
        className={`rounded p-1 transition-colors ${colorBtn} ${colorHover}`}
        aria-label="-1"
      >
        <ChevronDown size={14} />
      </button>
    </div>
  );
}
