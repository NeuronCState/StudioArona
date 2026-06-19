import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AgentMessage } from '@/components/agent/useAgentChat';

/**
 * Focus mode chat list — 专注模式下的对话历史
 * localStorage key: studio-arona-focus-chats (persist middleware 自动加 v{N} 后缀)
 *
 * 数据流:
 * - StudioSidebar 顶部 "新对话" 按钮 → 创建并设为 active
 * - FocusSidebar 列表 → 切换 / 重命名 / 删除
 */
export interface FocusChat {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

interface FocusChatsState {
  chats: FocusChat[];
  activeChatId: string | null;
  messagesByChat: Record<string, AgentMessage[]>;
  createChat: (title?: string) => string;
  ensureActiveChat: () => string;
  setActiveChat: (id: string | null) => void;
  setMessages: (
    id: string,
    update: AgentMessage[] | ((messages: AgentMessage[]) => AgentMessage[]),
  ) => void;
  renameChat: (id: string, title: string) => void;
  deleteChat: (id: string) => void;
}

function makeId(): string {
  return `chat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function defaultTitle(existing: FocusChat[]): string {
  // 取现有数字, +1
  const used = new Set<number>();
  for (const c of existing) {
    const m = c.title.match(/^新对话\s+(\d+)$/);
    if (m) used.add(Number(m[1]));
  }
  let n = 1;
  while (used.has(n)) n += 1;
  return `新对话 ${n}`;
}

export const useFocusChatsStore = create<FocusChatsState>()(
  persist(
    (set, get) => ({
      chats: [],
      activeChatId: null,
      messagesByChat: {},
      createChat: (title) => {
        const id = makeId();
        const now = Date.now();
        const state = get();
        const finalTitle = title ?? defaultTitle(state.chats);
        const chat: FocusChat = {
          id,
          title: finalTitle,
          createdAt: now,
          updatedAt: now,
        };
        set({ chats: [...state.chats, chat], activeChatId: id });
        return id;
      },
      ensureActiveChat: () => {
        const state = get();
        if (state.activeChatId && state.chats.some((chat) => chat.id === state.activeChatId)) {
          return state.activeChatId;
        }
        return state.createChat();
      },
      setActiveChat: (id) => set({ activeChatId: id }),
      setMessages: (id, update) =>
        set((state) => {
          const current = state.messagesByChat[id] ?? [];
          const messages = typeof update === 'function' ? update(current) : update;
          const firstUserMessage = messages.find(
            (message) => message.role === 'user' && message.content.trim(),
          );
          return {
            messagesByChat: { ...state.messagesByChat, [id]: messages },
            chats: state.chats.map((chat) => {
              if (chat.id !== id) return chat;
              const derivedTitle = firstUserMessage?.content.trim().replace(/\s+/g, ' ').slice(0, 30);
              return {
                ...chat,
                title:
                  /^新对话\s+\d+$/.test(chat.title) && derivedTitle
                    ? derivedTitle
                    : chat.title,
                updatedAt: Date.now(),
              };
            }),
          };
        }),
      renameChat: (id, title) =>
        set((state) => ({
          chats: state.chats.map((c) =>
            c.id === id ? { ...c, title, updatedAt: Date.now() } : c,
          ),
        })),
      deleteChat: (id) =>
        set((state) => {
          const next = state.chats.filter((c) => c.id !== id);
          const messagesByChat = { ...state.messagesByChat };
          delete messagesByChat[id];
          const nextActive =
            state.activeChatId === id ? (next.length > 0 ? next[0].id : null) : state.activeChatId;
          return { chats: next, activeChatId: nextActive, messagesByChat };
        }),
    }),
    {
      name: 'studio-arona-focus-chats',
      version: 1,
      partialize: (state) => ({
        chats: state.chats,
        activeChatId: state.activeChatId,
        messagesByChat: Object.fromEntries(
          Object.entries(state.messagesByChat).map(([id, messages]) => [
            id,
            messages.map((message) =>
              message.pending
                ? {
                    ...message,
                    pending: false,
                    content: message.content || '生成已中断',
                  }
                : message,
            ),
          ]),
        ),
      }),
    },
  ),
);
