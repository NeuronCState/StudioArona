import { beforeEach, describe, expect, it } from 'vitest';
import { useFocusChatsStore } from './focus-chats';

describe('focus chats store', () => {
  beforeEach(() => {
    localStorage.removeItem('studio-arona-focus-chats');
    useFocusChatsStore.setState({
      chats: [],
      activeChatId: null,
      messagesByChat: {},
    });
  });

  it('creates an active chat on demand and reuses it', () => {
    const first = useFocusChatsStore.getState().ensureActiveChat();
    const second = useFocusChatsStore.getState().ensureActiveChat();

    expect(second).toBe(first);
    expect(useFocusChatsStore.getState().chats).toHaveLength(1);
  });

  it('keeps messages isolated and derives a title from the first user message', () => {
    const first = useFocusChatsStore.getState().createChat();
    const second = useFocusChatsStore.getState().createChat();

    useFocusChatsStore.getState().setMessages(first, [
      { id: 'u-1', role: 'user', content: '帮我整理今天的日程', createdAt: 1 },
    ]);

    const state = useFocusChatsStore.getState();
    expect(state.messagesByChat[first]).toHaveLength(1);
    expect(state.messagesByChat[second] ?? []).toEqual([]);
    expect(state.chats.find((chat) => chat.id === first)?.title).toBe('帮我整理今天的日程');
  });

  it('removes deleted chat messages and selects the next chat', () => {
    const first = useFocusChatsStore.getState().createChat();
    const second = useFocusChatsStore.getState().createChat();
    useFocusChatsStore.getState().setMessages(second, [
      { id: 'u-2', role: 'user', content: 'test', createdAt: 1 },
    ]);

    useFocusChatsStore.getState().deleteChat(second);

    const state = useFocusChatsStore.getState();
    expect(state.activeChatId).toBe(first);
    expect(state.messagesByChat[second]).toBeUndefined();
  });
});
