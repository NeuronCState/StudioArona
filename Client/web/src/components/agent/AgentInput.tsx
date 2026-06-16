import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { Paperclip, FolderInput, ArrowUp, Square } from 'lucide-react';
import { motion } from 'framer-motion';
import { Spinner } from '@javis/ui-kit';
import { motion as m } from '@/lib/motion';
import type { AgentAttachment } from './useAgentChat';
import { AgentAttachmentChip } from './AgentAttachment';

interface AgentInputProps {
  attachments: AgentAttachment[];
  isStreaming: boolean;
  onSend: (text: string, attachments: AgentAttachment[]) => Promise<void>;
  onCancel: () => void;
  onAddAttachments: (items: AgentAttachment[]) => void;
  onRemoveAttachment: (id: string) => void;
  disabled?: boolean;
}

let _attId = 0;
const nextAttachmentId = () => `att-${Date.now().toString(36)}-${(_attId++).toString(36)}`;

const MAX_TEXTAREA_HEIGHT = 160;

export function AgentInput({
  attachments,
  isStreaming,
  onSend,
  onCancel,
  onAddAttachments,
  onRemoveAttachment,
  disabled,
}: AgentInputProps) {
  const [value, setValue] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Reset textarea height whenever content changes.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
  }, [value]);

  const buildAttachments = useCallback((files: FileList | File[], kind: 'file' | 'folder') => {
    const items: AgentAttachment[] = [];
    for (const f of Array.from(files)) {
      items.push({
        id: nextAttachmentId(),
        name: f.name,
        uri: '',
        size: f.size,
        mimeType: f.type || 'application/octet-stream',
        kind,
        file: f,
      });
    }
    return items;
  }, []);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;
      onAddAttachments(buildAttachments(files, 'file'));
    },
    [buildAttachments, onAddAttachments],
  );

  const handleFolder = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const items: AgentAttachment[] = Array.from(files).map((f) => ({
        id: nextAttachmentId(),
        name: f.name,
        uri: '',
        size: f.size,
        mimeType: f.type || 'application/octet-stream',
        kind: 'folder' as const,
        file: f,
      }));
      onAddAttachments(items);
    },
    [onAddAttachments],
  );

  const handleSubmit = useCallback(
    async (e?: FormEvent) => {
      e?.preventDefault();
      if (disabled || isStreaming) return;
      const text = value.trim();
      if (!text && attachments.length === 0) return;
      setValue('');
      await onSend(text, attachments);
    },
    [attachments, disabled, isStreaming, onSend, value],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        void handleSubmit();
      }
    },
    [handleSubmit],
  );

  // Drag & drop on the whole input region.
  const handleDragOver = useCallback((e: DragEvent<HTMLFormElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLFormElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLFormElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      if (!e.dataTransfer.files || e.dataTransfer.files.length === 0) return;
      onAddAttachments(buildAttachments(e.dataTransfer.files, 'file'));
    },
    [buildAttachments, onAddAttachments],
  );

  // Paste images / files directly into the textarea.
  const handlePaste = useCallback(
    (e: ClipboardEvent<HTMLTextAreaElement>) => {
      if (!e.clipboardData?.files || e.clipboardData.files.length === 0) return;
      e.preventDefault();
      onAddAttachments(buildAttachments(e.clipboardData.files, 'file'));
    },
    [buildAttachments, onAddAttachments],
  );

  const hasContent = value.trim().length > 0 || attachments.length > 0;

  return (
    <motion.form
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: m.duration.base / 1000, ease: m.easing.out, delay: 0.05 }}
      onSubmit={handleSubmit}
      className={`relative border-t border-[var(--color-border)] bg-[var(--color-surface)] px-3 pb-3 pt-2 transition-colors ${
        dragOver ? 'ring-2 ring-inset ring-[var(--color-accent)]/40 bg-[var(--color-accent-soft)]/30' : ''
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {attachments.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5 px-1">
          {attachments.map((a) => (
            <AgentAttachmentChip key={a.id} attachment={a} onRemove={onRemoveAttachment} />
          ))}
        </div>
      )}

      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        placeholder={isStreaming ? '生成中…' : '问问阿洛娜, 或拖文件进来'}
        disabled={disabled}
        rows={1}
        aria-label="Message input"
        className="block w-full resize-none rounded-md bg-transparent px-2 py-2 text-sm leading-relaxed text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none disabled:opacity-50"
        style={{ maxHeight: MAX_TEXTAREA_HEIGHT }}
      />

      <div className="flex items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-0.5">
          <IconBtn
            label="Attach files"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
          >
            <Paperclip size={16} aria-hidden="true" />
          </IconBtn>
          <IconBtn
            label="Attach folder"
            onClick={() => folderInputRef.current?.click()}
            disabled={disabled}
          >
            <FolderInput size={16} aria-hidden="true" />
          </IconBtn>
          {isStreaming && (
            <span className="ml-1 inline-flex items-center gap-1.5 text-[11px] text-[var(--color-text-muted)]">
              <Spinner size="sm" />
              <span>生成中</span>
            </span>
          )}
        </div>

        <button
          type={isStreaming ? 'button' : 'submit'}
          onClick={isStreaming ? onCancel : undefined}
          disabled={!isStreaming && !hasContent}
          aria-label={isStreaming ? 'Stop generating' : 'Send message'}
          className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 disabled:cursor-not-allowed ${
            isStreaming
              ? 'bg-[var(--color-error)]/10 text-[var(--color-error)] hover:bg-[var(--color-error)]/20'
              : hasContent && !disabled
                ? 'bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)]'
                : 'bg-[var(--color-bg)] text-[var(--color-text-muted)]'
          }`}
        >
          {isStreaming ? (
            <Square size={14} aria-hidden="true" />
          ) : (
            <ArrowUp size={16} aria-hidden="true" />
          )}
        </button>
      </div>

      {/* Hidden inputs — webkitdirectory for folder picking */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={folderInputRef}
        type="file"
        hidden
        // @ts-expect-error — non-standard but supported in Webkit + Chromium
        webkitdirectory=""
        directory=""
        onChange={(e) => {
          handleFolder(e.target.files);
          e.target.value = '';
        }}
      />
    </motion.form>
  );
}

function IconBtn({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--color-text-secondary)] hover:bg-[var(--color-bg)] hover:text-[var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] disabled:opacity-40"
    >
      {children}
    </button>
  );
}
