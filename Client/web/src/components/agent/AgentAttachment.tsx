import type { AgentAttachment } from "./useAgentChat";
import { FileText, Folder, X } from "lucide-react";

interface AgentAttachmentChipProps {
  attachment: AgentAttachment;
  onRemove: (id: string) => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function AgentAttachmentChip({
  attachment,
  onRemove,
}: AgentAttachmentChipProps) {
  const Icon = attachment.kind === "folder" ? Folder : FileText;
  return (
    <span
      className="group inline-flex max-w-[200px] items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] py-1 pl-2 pr-1 text-xs text-[var(--color-text-secondary)]"
      title={attachment.name}
    >
      <Icon size={12} aria-hidden="true" className="shrink-0" />
      <span className="truncate">{attachment.name}</span>
      <span className="shrink-0 text-[10px] text-[var(--color-text-muted)]">
        {formatSize(attachment.size)}
      </span>
      <button
        type="button"
        onClick={() => onRemove(attachment.id)}
        aria-label={`Remove ${attachment.name}`}
        className="ml-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-[var(--color-text-muted)] hover:bg-[var(--color-border)] hover:text-[var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
      >
        <X size={10} aria-hidden="true" />
      </button>
    </span>
  );
}
