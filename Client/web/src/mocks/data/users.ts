import type { UserProfile } from '@/types/contracts';

export const mockUsers: UserProfile[] = [
  {
    id: 'u_zhang',
    username: 'zhang',
    display_name: '张旭宁',
    role: 'admin',
    created_at: '2026-01-15T08:00:00Z',
    preferences: { theme: 'system', language: 'zh-CN' },
    face_enrolled: true,
  },
  {
    id: 'u_li',
    username: 'li',
    display_name: '李明',
    role: 'member',
    created_at: '2026-02-01T10:00:00Z',
    preferences: { theme: 'dark' },
    face_enrolled: false,
  },
  {
    id: 'u_wang',
    username: 'wang',
    display_name: '王华',
    role: 'member',
    created_at: '2026-02-10T14:00:00Z',
    preferences: {},
    face_enrolled: true,
  },
  {
    id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    username: 'arona',
    display_name: 'Arona',
    role: 'admin',
    created_at: '2026-05-21T09:34:40Z',
    preferences: {},
    face_enrolled: false,
  },
];
