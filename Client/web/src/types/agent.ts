/**
 * Shared Agent types — extracted from useAgentChat.ts to break circular dependency
 * with stores/focus-chats.ts.
 *
 * useAgentChat.ts re-exports these so existing `import { AgentMessage } from "./useAgentChat"`
 * continues to work. New consumers should import from `@/types/agent`.
 */

export interface AgentAttachment {
  id: string;
  name: string;
  /** Tauri 桌面: ~/Documents/studioarona/... 绝对路径; Web 端: Blob URL */
  uri: string;
  size: number;
  mimeType: string;
  kind?: "file" | "folder";
  /** Folder uploads preserve this path relative to the selected root. */
  relativePath?: string;
  /** 内部 file ref (Web 端用) */
  file?: File;
}

export interface AgentToolCall {
  id: string;
  name: string;
  input: string;
  output?: string;
  status: "running" | "done" | "error";
  startedAt: number;
  endedAt?: number;
}

export interface AgentMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
  attachments?: AgentAttachment[];
  pending?: boolean;
  error?: string;
  /** ReAct thinking 文本 (折叠) */
  thinking?: string;
  /** 工具调用列表 (折叠) */
  toolCalls?: AgentToolCall[];
  /** 上下文用量 (server 推 context_usage) */
  contextUsage?: { used: number; max: number; percent: number; model: string };
}
