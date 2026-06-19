import type { Schedule } from "@/types/contracts";

const now = new Date();

export const mockSchedules: Schedule[] = [
  {
    id: "s_weekly",
    user_id: "u_zhang",
    title: "周一团队站会",
    body: "每人 5 分钟同步进度",
    starts_at: new Date(now.getTime() + 2 * 3_600_000).toISOString(),
    status: "pending",
    source: "manual",
    created_at: "2026-05-18T08:00:00Z",
    updated_at: "2026-05-18T08:00:00Z",
  },
  {
    id: "s_contract",
    user_id: "u_zhang",
    title: "契约审查会",
    body: "审查 OpenAPI 变更 + Skill 增减",
    starts_at: new Date(now.getTime() + 20 * 3_600_000).toISOString(),
    status: "pending",
    source: "manual",
    created_at: "2026-05-18T09:00:00Z",
    updated_at: "2026-05-18T09:00:00Z",
  },
  {
    id: "s_demo",
    user_id: "u_li",
    title: "周五 Demo",
    body: "每人 5 分钟演示本周成果",
    starts_at: new Date(now.getTime() + 72 * 3_600_000).toISOString(),
    status: "pending",
    source: "manual",
    created_at: "2026-05-18T10:00:00Z",
    updated_at: "2026-05-18T10:00:00Z",
  },
  {
    id: "s_personal",
    user_id: "u_zhang",
    title: "完成 ChatPage 流式渲染",
    body: "接入 SSE mock，实现 token 渐入动画",
    starts_at: new Date(now.getTime() + 48 * 3_600_000).toISOString(),
    status: "pending",
    source: "agent",
    created_at: "2026-05-19T14:00:00Z",
    updated_at: "2026-05-19T14:00:00Z",
  },
];
