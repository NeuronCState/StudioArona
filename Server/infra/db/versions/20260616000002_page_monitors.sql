-- Studio Arona v3 — per-user webpage monitors.
-- RSS feeds and webpage monitors share the "information sources" page, but
-- webpage changes need their own event history because they are not RSS items.

CREATE TABLE IF NOT EXISTS page_monitors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    label TEXT NOT NULL,
    css_selector TEXT NOT NULL DEFAULT 'body',
    last_hash TEXT,
    last_checked_at TIMESTAMPTZ,
    last_changed_at TIMESTAMPTZ,
    check_interval_min INT NOT NULL DEFAULT 15 CHECK (check_interval_min BETWEEN 1 AND 1440),
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, url)
);

CREATE INDEX IF NOT EXISTS idx_page_monitors_user_created
    ON page_monitors(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_page_monitors_enabled_due
    ON page_monitors(enabled, last_checked_at);

CREATE TABLE IF NOT EXISTS page_monitor_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    monitor_id UUID NOT NULL REFERENCES page_monitors(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    link TEXT NOT NULL,
    summary TEXT,
    content_hash TEXT NOT NULL,
    published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(monitor_id, content_hash)
);

CREATE INDEX IF NOT EXISTS idx_page_monitor_events_monitor_created
    ON page_monitor_events(monitor_id, created_at DESC);
