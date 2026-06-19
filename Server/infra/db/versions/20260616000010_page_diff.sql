-- 20260616000010 — page_monitor 真实摘要 (P1#4)
--
-- 背景: spec §6.3 禁止 "200 字预览" 充当智能总结. 必须:
--   - 保存上一版本的 canonical 正文 (可计算 diff 的快照)
--   - 先生成结构化 diff, 再调可配置 LLM 总结
--   - LLM 不可用 → 确定性 diff 摘要 + summary_mode='fallback'
--
-- 新增:
--   page_monitors.previous_content  TEXT   上次成功的 canonical text (用于 diff)
--   page_monitor_events.summary_mode TEXT 'llm' | 'fallback' (审计 / UI 显示)
--   page_monitor_events.diff_summary TEXT   确定性 diff 摘要 (always populated, fallback 时作为 summary)
--   page_monitor_events.llm_used     BOOLEAN  本次事件是否成功调用 LLM

ALTER TABLE page_monitors
    ADD COLUMN IF NOT EXISTS previous_content TEXT;

ALTER TABLE page_monitor_events
    ADD COLUMN IF NOT EXISTS summary_mode TEXT,
    ADD COLUMN IF NOT EXISTS diff_summary TEXT,
    ADD COLUMN IF NOT EXISTS llm_used BOOLEAN NOT NULL DEFAULT FALSE;

-- 用于查询某 monitor 最近的事件
CREATE INDEX IF NOT EXISTS idx_page_monitor_events_mode
    ON page_monitor_events(monitor_id, created_at DESC, summary_mode);
