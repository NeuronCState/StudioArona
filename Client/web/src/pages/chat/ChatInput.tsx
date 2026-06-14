import { useState, useRef, useCallback } from 'react';
import { Mic, Send, Square, Paperclip, Command } from 'lucide-react';

interface ChatInputProps {
  onSend: (content: string) => void;
  isStreaming: boolean;
  onStop: () => void;
}

const COMMANDS = [
  { id: 'rss', label: '添加 RSS', description: '订阅一个新的 RSS 源' },
  { id: 'schedule', label: '添加日程', description: '创建一个新的日程安排' },
  { id: 'vm', label: '创建虚拟机', description: '创建一个新的虚拟机' },
  { id: 'status', label: '系统状态', description: '查看当前系统运行状态' },
  { id: 'memory', label: '查看记忆', description: '查看与我相关的记忆' },
];

export function ChatInput({ onSend, isStreaming, onStop }: ChatInputProps) {
  const [value, setValue] = useState('');
  const [showCommands, setShowCommands] = useState(false);
  const [commandFilter, setCommandFilter] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [selectedCmd, setSelectedCmd] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const filteredCommands = COMMANDS.filter((c) =>
    c.label.toLowerCase().includes(commandFilter.toLowerCase()),
  );

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || isStreaming) return;
    onSend(trimmed);
    setValue('');
    setShowCommands(false);
    inputRef.current?.focus();
  }, [value, isStreaming, onSend]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    setValue(v);

    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;

    // Command palette: detect /
    if (v.startsWith('/')) {
      setShowCommands(true);
      setCommandFilter(v.slice(1));
      setSelectedCmd(0);
    } else {
      setShowCommands(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showCommands) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedCmd((p) => (p + 1) % filteredCommands.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedCmd((p) => (p - 1 + filteredCommands.length) % filteredCommands.length);
        return;
      }
      if (e.key === 'Enter' && filteredCommands[selectedCmd]) {
        e.preventDefault();
        setValue(`/${filteredCommands[selectedCmd].id} `);
        setShowCommands(false);
        inputRef.current?.focus();
        return;
      }
      if (e.key === 'Escape') {
        setShowCommands(false);
        return;
      }
    }

    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  return (
    <div className="relative">
      {/* Command palette */}
      {showCommands && filteredCommands.length > 0 && (
        <div className="absolute bottom-full left-0 right-0 mb-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-1 shadow-[var(--shadow-2)]">
          {filteredCommands.map((cmd, i) => (
            <button
              key={cmd.id}
              type="button"
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                i === selectedCmd
                  ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
                  : 'text-[var(--color-text-primary)] hover:bg-[var(--color-bg)]'
              }`}
              onClick={() => {
                setValue(`/${cmd.id} `);
                setShowCommands(false);
                inputRef.current?.focus();
              }}
            >
              <Command size={14} className="shrink-0 text-[var(--color-text-muted)]" />
              <div>
                <p className="font-medium">{cmd.label}</p>
                <p className="text-xs text-[var(--color-text-muted)]">{cmd.description}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Drag overlay */}
      {dragOver && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl border-2 border-dashed border-[var(--color-accent)] bg-[var(--color-accent-soft)]/50"
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
          }}
        >
          <p className="text-sm font-medium text-[var(--color-accent)]">拖放文件到此处</p>
        </div>
      )}

      {/* Input bar with floating premium card feel */}
      <div className="flex items-end gap-2.5 bg-white border border-[var(--color-border-subtle)] p-2.5 rounded-2xl shadow-[var(--shadow-2)] hover:shadow-[var(--shadow-3)] transition-shadow duration-300">
        {/* Attachment */}
        <button
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--color-border-subtle)] text-[var(--color-text-muted)] bg-[var(--color-bg)] transition-all hover:bg-[var(--color-border-subtle)] hover:text-[var(--color-text-secondary)] active:scale-95"
          aria-label="附件"
          title="添加附件"
        >
          <Paperclip size={18} />
        </button>

        {/* Textarea */}
        <div className="relative flex-1">
          <textarea
            ref={inputRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="输入消息... (⌘+Enter 发送, / 调起快捷指令)"
            rows={1}
            className="w-full resize-none border-0 bg-transparent px-2 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus-visible:outline-none transition-colors min-h-[40px] max-h-[200px]"
            aria-label="消息输入"
            onDragEnter={() => setDragOver(true)}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false);
            }}
          />
        </div>

        {/* Mic */}
        <button
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--color-border-subtle)] text-[var(--color-text-muted)] bg-[var(--color-bg)] transition-all hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-accent)] active:scale-95"
          aria-label="语音输入"
          title="语音输入"
        >
          <Mic size={18} />
        </button>

        {/* Send / Stop */}
        {isStreaming ? (
          <button
            onClick={onStop}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-error)] text-white transition-all hover:opacity-90 active:scale-95"
            aria-label="停止生成"
            title="停止生成"
          >
            <Square size={16} />
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!value.trim()}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-accent)] text-white transition-all hover:bg-[var(--color-accent-hover)] active:scale-95 disabled:opacity-30 disabled:scale-100 disabled:pointer-events-none"
            aria-label="发送消息"
            title="发送"
          >
            <Send size={16} />
          </button>
        )}
      </div>

      {/* Bottom hints */}
      <p className="mt-2 text-center text-[10px] text-[var(--color-text-muted)]">
        ⌘+Enter 发送 · / 命令面板 · 支持拖放文件
      </p>
    </div>
  );
}
