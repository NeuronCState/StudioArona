---
name: studio-arona
description: Manage the current user's Studio Arona schedules, RSS feeds, page monitors, notifications, system status, and synchronized memory.
---

# Studio Arona

Use the `studio_*` tools for data owned by Studio Arona. These tools authenticate as the current
logged-in user and the Server enforces user isolation.

## Routing

- Calendar events: `studio_schedule`
- RSS subscriptions and articles: `studio_feeds`
- Webpage change tracking: `studio_page_monitors`
- Notifications, cron health, system metrics, and VMs: `studio_status`
- Memory synchronized through Server: `studio_server_memory`

Do not use Todoist tools for Studio Arona schedules. Use RSS feeds for syndication URLs and page
monitors for ordinary webpages that must be checked for content changes.

## Mutation rules

Read the current item before updating it. Preserve identifiers and optimistic-lock timestamps when
the API returns them. Before deleting data, ask the user for explicit confirmation, then call the
tool with `confirm=true`. Never reuse identifiers or results from another user or session.
