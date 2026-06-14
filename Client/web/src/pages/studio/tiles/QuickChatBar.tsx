import { useState, useRef, useCallback } from 'react';
import { ArrowUp } from 'lucide-react';

interface QuickChatBarProps {
  onSend: (message: string) => void;
  disabled?: boolean;
}

export function QuickChatBar({ onSend, disabled }: QuickChatBarProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!value.trim() || disabled) return;
      onSend(value.trim());
      setValue('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
    },
    [value, disabled, onSend],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.metaKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 80)}px`;
  };

  const hasContent = value.trim().length > 0;

  return (
    <form onSubmit={handleSubmit} className="tile-anim-5">
      <div className="quick-chat-wrapper">
        <div className="flex items-center gap-2.5">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="What would you like to do?"
            className="quick-chat-input"
            rows={1}
          />

          <button
            type="submit"
            disabled={!hasContent || disabled}
            className={`quick-chat-send shrink-0 ${hasContent && !disabled ? 'active' : 'inactive'}`}
          >
            <span className="flex items-center gap-1">
              Send <ArrowUp size={14} />
            </span>
          </button>
        </div>
      </div>
    </form>
  );
}
