-- 20260616000007 — user-owned Skills 内容 + 附件 (P1#1)
--
-- 背景: 之前 `skills` 表只存安装元数据 (slug/name/version/...), 用户自己写的 Skill
--       在 server 这边没有任何痕迹. 现在让用户能完整 round-trip 自己的 Skill.
--
-- 重要: 这是和 marketplace 安装记录不同的表.
--   skills (已存在): marketplace install 元数据, source='marketplace', 用户不能改内容
--   user_skills (新):  用户自有 Skill 完整内容 (SKILL.md + 附件), source='local' | 'synced'
--
-- 设计:
--   user_skills(user_id, slug, name, description, content_md, source, version,
--               content_hash, updated_at, created_at)
--     PK (user_id, slug) — 一个用户每个 slug 一份
--     version: 乐观锁, PUT 时 expected_version 不匹配 → 409 + server_version
--     content_hash: sha256(content_md + 排序后的 (path, sha256(file_bytes)))
--     source: 'local' (用户手写) | 'synced' (从别处同步进来)
--
--   user_skill_files(id, user_id, slug, rel_path, mime, size, content BYTEA,
--                     content_hash, storage_key, created_at)
--     rel_path: 结构化文件清单里的相对路径
--       CHECK: 不允许绝对路径 ('/' 开头, Windows drive letter), 不允许 '..', 不允许 NUL
--     size: 单文件 ≤ 1 MiB (application-enforced, 任何超限拒绝)
--     content: inline < 256 KiB 时走 BYTEA; 否则 storage_key 指向对象存储
--     content_hash: sha256(file bytes), 客户端校验完整性
--     FOREIGN KEY (user_id, slug) → user_skills(user_id, slug) ON DELETE CASCADE
--
-- 大小限制 (在 application 层 enforce):
--   - content_md:        256 KiB
--   - 单文件:            1 MiB
--   - 文件数:            50
--   - skill 总附件:      5 MiB

CREATE TABLE IF NOT EXISTS user_skills (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    slug TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    content_md TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'local' CHECK (source IN ('local', 'synced')),
    version INTEGER NOT NULL DEFAULT 1,
    content_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_user_skills_updated
    ON user_skills(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS user_skill_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    slug TEXT NOT NULL,
    rel_path TEXT NOT NULL,
    mime TEXT NOT NULL,
    size_bytes BIGINT NOT NULL,
    content BYTEA,
    content_hash TEXT NOT NULL,
    storage_key TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_user_skill_files_skill
        FOREIGN KEY (user_id, slug)
        REFERENCES user_skills(user_id, slug)
        ON DELETE CASCADE,
    -- 防绝对路径与路径遍历 (在应用层额外做 unicode normalization 校验)
    -- 注: PG TEXT 不允许存储 NUL, 所以 NUL 检查放在应用层 (validate_rel_path)
    CONSTRAINT rel_path_no_absolute
        CHECK (rel_path NOT LIKE '/%'
               AND rel_path NOT LIKE '%\%'
               AND rel_path NOT LIKE '%/../%'
               AND rel_path NOT LIKE '../%'
               AND rel_path <> '..'),
    -- mime 不能太长
    CONSTRAINT mime_length
        CHECK (char_length(mime) <= 256),
    -- content / storage_key 二选一
    CONSTRAINT content_or_storage
        CHECK ((content IS NOT NULL)::int + (storage_key IS NOT NULL)::int = 1),
    UNIQUE (user_id, slug, rel_path)
);

CREATE INDEX IF NOT EXISTS idx_user_skill_files_skill
    ON user_skill_files(user_id, slug);
