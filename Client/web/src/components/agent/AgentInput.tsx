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
  type ReactNode,
} from "react";
import { ArrowUp, FolderInput, Paperclip, Square } from "lucide-react";
import { motion } from "framer-motion";
import { Spinner } from "@javis/ui-kit";
import { motion as m } from "@/lib/motion";
import type { AgentAttachment } from "./useAgentChat";
import { AgentAttachmentChip } from "./AgentAttachment";
import { AutocompletePanel, type AutocompleteItem } from "./AutocompletePanel";
import { useAutocomplete } from "./useAutocomplete";

interface AgentInputProps {
  attachments: AgentAttachment[];
  isStreaming: boolean;
  onSend: (text: string, attachments: AgentAttachment[]) => Promise<boolean>;
  onCancel: () => void;
  onAddAttachments: (items: AgentAttachment[]) => void;
  onRemoveAttachment: (id: string) => void;
  disabled?: boolean;
}

let attachmentCounter = 0;
const nextAttachmentId = () =>
  `att-${Date.now().toString(36)}-${(attachmentCounter++).toString(36)}`;
const MAX_TEXTAREA_HEIGHT = 160;

function makeAttachment(file: File, relativePath?: string): AgentAttachment {
  return {
    id: nextAttachmentId(),
    name: file.name,
    uri: "",
    size: file.size,
    mimeType: file.type || "application/octet-stream",
    kind: relativePath?.includes("/") ? "folder" : "file",
    relativePath: relativePath || file.webkitRelativePath || file.name,
    file,
  };
}

function readEntryFile(entry: FileSystemEntry): Promise<File> {
  return new Promise((resolve, reject) =>
    (entry as FileSystemFileEntry).file(resolve, reject),
  );
}

async function readDirectoryEntries(
  entry: FileSystemEntry,
): Promise<FileSystemEntry[]> {
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  const all: FileSystemEntry[] = [];
  while (true) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
      reader.readEntries(resolve, reject),
    );
    if (batch.length === 0) return all;
    all.push(...batch);
  }
}

async function expandEntry(
  entry: FileSystemEntry,
  parentPath = "",
): Promise<AgentAttachment[]> {
  const relativePath = parentPath ? `${parentPath}/${entry.name}` : entry.name;
  if (entry.isFile)
    return [makeAttachment(await readEntryFile(entry), relativePath)];
  if (!entry.isDirectory) return [];
  const children = await readDirectoryEntries(entry);
  return (
    await Promise.all(children.map((child) => expandEntry(child, relativePath)))
  ).flat();
}

export function AgentInput({
  attachments,
  isStreaming,
  onSend,
  onCancel,
  onAddAttachments,
  onRemoveAttachment,
  disabled,
}: AgentInputProps) {
  const [value, setValue] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const autocompleteItems: AutocompleteItem[] = [
    {
      id: "search",
      name: "search",
      description: "网络搜索 (Tavily)",
      icon: "search",
      insertText: "/search ",
    },
    {
      id: "weather",
      name: "weather",
      description: "查询天气",
      icon: "sparkles",
      insertText: "/weather ",
    },
    {
      id: "map",
      name: "map",
      description: "地图搜索 (高德)",
      icon: "search",
      insertText: "/map ",
    },
    {
      id: "todo",
      name: "todo",
      description: "Todoist 任务",
      icon: "command",
      insertText: "/todo ",
    },
    {
      id: "tarot",
      name: "tarot",
      description: "塔罗牌占卜",
      icon: "sparkles",
      insertText: "/tarot ",
    },
    {
      id: "subagent",
      name: "subagent",
      description: "启动 SubAgent 独立会话",
      icon: "command",
      insertText: "/subagent ",
    },
    {
      id: "file",
      name: "file",
      description: "文件读写",
      icon: "search",
      insertText: "/file ",
    },
    {
      id: "debug",
      name: "debug",
      description: "代码调试",
      icon: "command",
      insertText: "/debug ",
    },
    {
      id: "test",
      name: "test",
      description: "运行测试",
      icon: "command",
      insertText: "/test ",
    },
    {
      id: "image",
      name: "image",
      description: "图像生成",
      icon: "sparkles",
      insertText: "/image ",
    },
  ];
  const handleAutocompleteInsert = useCallback((insertText: string) => {
    setValue((current) => current.replace(/\/[^\s/]*$/, "") + insertText);
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  }, []);
  const ac = useAutocomplete(
    value,
    autocompleteItems,
    handleAutocompleteInsert,
  );

  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
  }, [value]);

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const items = Array.from(files).map((file) =>
        makeAttachment(file, file.webkitRelativePath || file.name),
      );
      if (items.length > 0) onAddAttachments(items);
    },
    [onAddAttachments],
  );

  const handleSubmit = useCallback(
    async (event?: FormEvent) => {
      event?.preventDefault();
      if (disabled || isStreaming) return;
      const text = value.trim();
      if (!text && attachments.length === 0) return;
      if (await onSend(text, attachments)) setValue("");
    },
    [attachments, disabled, isStreaming, onSend, value],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (ac.handleKey(event)) return;
      if (
        event.key === "Enter" &&
        !event.shiftKey &&
        !event.metaKey &&
        !event.ctrlKey
      ) {
        event.preventDefault();
        void handleSubmit();
      }
    },
    [ac, handleSubmit],
  );

  const handleDrop = useCallback(
    async (event: DragEvent<HTMLFormElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setDragOver(false);
      const entries = Array.from(event.dataTransfer.items)
        .map((item) => item.webkitGetAsEntry())
        .filter((entry): entry is FileSystemEntry => Boolean(entry));
      if (entries.length > 0) {
        onAddAttachments(
          (
            await Promise.all(entries.map((entry) => expandEntry(entry)))
          ).flat(),
        );
      } else {
        addFiles(event.dataTransfer.files);
      }
    },
    [addFiles, onAddAttachments],
  );

  const hasContent = value.trim().length > 0 || attachments.length > 0;

  return (
    <motion.form
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: m.duration.base / 1000,
        ease: m.easing.out,
        delay: 0.05,
      }}
      onSubmit={handleSubmit}
      onDragOver={(event) => {
        event.preventDefault();
        if (event.dataTransfer.types.includes("Files")) setDragOver(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setDragOver(false);
      }}
      onDrop={(event) => void handleDrop(event)}
      className={`relative border-t border-[var(--color-border)] bg-[var(--color-surface)] px-3 pb-3 pt-2 transition-colors ${dragOver ? "ring-2 ring-inset ring-[var(--color-accent)]/50" : ""}`}
    >
      {dragOver && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-[var(--color-surface)]/90 text-sm font-medium text-[var(--color-accent)]">
          松开以上传文件或文件夹
        </div>
      )}
      {attachments.length > 0 && (
        <div className="mb-2 flex max-h-24 flex-wrap gap-1.5 overflow-y-auto px-1">
          {attachments.map((attachment) => (
            <AgentAttachmentChip
              key={attachment.id}
              attachment={attachment}
              onRemove={onRemoveAttachment}
            />
          ))}
        </div>
      )}
      <AutocompletePanel
        items={ac.filtered}
        visible={ac.open}
        position={ac.position}
        filterText={ac.filtered.length ? "" : ""}
        activeIndex={ac.activeIndex}
        onSelect={(item) =>
          handleAutocompleteInsert(item.insertText ?? `/${item.name} `)
        }
        onActiveIndexChange={ac.setActiveIndex}
        onClose={ac.close}
      />
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
          setValue(event.target.value)
        }
        onKeyDown={handleKeyDown}
        onPaste={(event: ClipboardEvent<HTMLTextAreaElement>) => {
          if (event.clipboardData.files.length === 0) return;
          event.preventDefault();
          addFiles(event.clipboardData.files);
        }}
        placeholder={isStreaming ? "生成中…" : "问问阿洛娜，或拖入文件/文件夹"}
        disabled={disabled}
        rows={1}
        aria-label="Message input"
        className="block w-full resize-none rounded-md bg-transparent px-2 py-2 text-sm leading-relaxed text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none disabled:opacity-50"
        style={{ maxHeight: MAX_TEXTAREA_HEIGHT }}
      />
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-0.5">
          <IconButton
            label="添加文件"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
          >
            <Paperclip size={16} aria-hidden="true" />
          </IconButton>
          <IconButton
            label="添加文件夹"
            onClick={() => folderInputRef.current?.click()}
            disabled={disabled}
          >
            <FolderInput size={16} aria-hidden="true" />
          </IconButton>
          {isStreaming && (
            <span className="ml-1 inline-flex items-center gap-1.5 text-[11px] text-[var(--color-text-muted)]">
              <Spinner size="sm" />
              <span>生成中</span>
            </span>
          )}
        </div>
        <button
          type={isStreaming ? "button" : "submit"}
          onClick={isStreaming ? onCancel : undefined}
          disabled={!isStreaming && !hasContent}
          aria-label={isStreaming ? "Stop generating" : "Send message"}
          className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] disabled:cursor-not-allowed ${isStreaming ? "bg-[var(--color-error)]/10 text-[var(--color-error)]" : hasContent && !disabled ? "bg-[var(--color-accent)] text-white" : "bg-[var(--color-bg)] text-[var(--color-text-muted)]"}`}
        >
          {isStreaming ? (
            <Square size={14} aria-hidden="true" />
          ) : (
            <ArrowUp size={16} aria-hidden="true" />
          )}
        </button>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        hidden
        onChange={(event) => {
          addFiles(event.target.files ?? []);
          event.target.value = "";
        }}
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        hidden
        // @ts-expect-error Chromium/WebKit directory picker extension.
        webkitdirectory=""
        onChange={(event) => {
          addFiles(event.target.files ?? []);
          event.target.value = "";
        }}
      />
    </motion.form>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--color-text-secondary)] hover:bg-[var(--color-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] disabled:opacity-40"
    >
      {children}
    </button>
  );
}
