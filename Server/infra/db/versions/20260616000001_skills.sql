-- Studio Arona v3 — skills table (S1c)
-- 由 Mavis coder agent 生成, 2026-06-16
--
-- skill 安装记录: user 把 marketplace skill 安装到本地的状态
-- marketplace 真数据源留 TODO (registry/categories/search 仍走 mock)

CREATE TABLE IF NOT EXISTS skills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    slug TEXT NOT NULL,
    name TEXT NOT NULL,
    version TEXT NOT NULL DEFAULT '0.1.0',
    description TEXT,
    category TEXT,
    source TEXT NOT NULL DEFAULT 'marketplace'
        CHECK (source IN ('marketplace', 'local', 'imported')),
    installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_skills_user_installed ON skills(user_id, installed_at DESC);
