# Hermes OpenAI-Compatible Integration

> How the **agent panel** (`useAgentChat.ts`) talks to your local **Hermes**
> runtime, plus the operational knobs you'll actually need to flip when
> things break.

---

## TL;DR

```bash
# 1. Make sure your env file exists
cd Client/web
cp .env.example .env

# 2. Start the Hermes OpenAI-compatible proxy (separate terminal)
hermes proxy start                  # default 127.0.0.1:8645, provider=nous

# 3. Confirm the endpoint responds
curl -s http://127.0.0.1:8645/health
curl -s http://127.0.0.1:8645/v1/models

# 4. Run the web app — the agent panel will now stream real responses
pnpm dev
```

If `curl /health` returns `{"status": "ok", "upstream": "Nous Portal"}` (or
`"xAI Grok"`) the agent panel is wired up correctly. The default
`VITE_HERMES_BASE_URL` in `.env.example` already points at `127.0.0.1:8645`.

---

## What the agent panel actually calls

Every `send` in `useAgentChat.ts` issues one HTTP request:

```
POST ${VITE_HERMES_BASE_URL}/v1/chat/completions
Authorization: Bearer ${VITE_HERMES_API_KEY}
Content-Type: application/json

{
  "model": "<VITE_HERMES_MODEL>",
  "messages": [
    { "role": "user",  "content": "..." },
    { "role": "assistant", "content": "..." }
  ],
  "stream": true,
  "temperature": 0.7
}
```

Hermes returns an SSE stream of `data: {choices:[{delta:{content:"…"}}]}`
chunks terminated by `data: [DONE]`. The hook decodes them per-record
(records are separated by blank lines), tolerates mid-chunk splits, and
appends each delta to the trailing assistant message in the panel.

| Step            | Code point                                       |
| --------------- | ------------------------------------------------ |
| Endpoint config | `HERMES_BASE_URL` constant in `useAgentChat.ts`  |
| Network request | `fetch(...).then(parseSSE)` inside `send`        |
| SSE parsing     | `parseSSERecord()` helper                        |
| Cancel          | `AbortController` stored in `abortRef`           |
| Error UX        | `lastError` state + per-bubble `error` field     |

---

## Starting Hermes (the OpenAI-compatible surface)

Hermes ≥ 0.16 ships `hermes proxy` — a small aiohttp server that forwards
OpenAI-format requests to an authenticated upstream provider (Nous Portal
or xAI Grok OAuth). The proxy is the only thing the agent panel talks to.

```bash
hermes proxy start                   # foreground, Ctrl-C to stop
hermes proxy start --port 9000       # custom port
hermes proxy start --provider xai    # switch to xAI Grok OAuth
hermes proxy start --host 0.0.0.0    # expose on LAN
hermes proxy start --help            # full flag list
```

For background / boot-time service install:

```bash
hermes proxy start  # foreground is recommended during development
```

> Hermes 0.16 only ships **two** proxy upstream providers — `nous` and
> `xai`. The `custom:2345subscribe` provider you may have configured for
> `hermes chat` is **not** exposed through the proxy; it requires the
> Hermes chat CLI / TUI to reach. If you want the agent panel to drive a
> custom base URL, run your own OpenAI-compatible bridge in front of it
> (e.g. a one-file FastAPI proxy) and point `VITE_HERMES_BASE_URL` at
> that instead.

### Health & model discovery

```bash
curl -s http://127.0.0.1:8645/health | jq
# {
#   "status": "ok",
#   "upstream": "Nous Portal",
#   "authenticated": true
# }

curl -s http://127.0.0.1:8645/v1/models | jq '.data[].id'
```

`/v1/models` returns whatever the upstream provider exposes. The
`VITE_HERMES_MODEL` you set in `.env` must be one of those IDs.

---

## Authenticating Hermes with an upstream provider

The proxy needs valid OAuth state for the provider you pick:

```bash
# Nous Portal (default)
hermes portal        # one-shot login + setup wizard

# xAI Grok OAuth
hermes auth add xai-oauth
hermes model         # pick the xai provider
```

Verify auth before the agent panel tries to talk:

```bash
hermes status | grep -A2 "Auth Providers"
hermes proxy status
```

If `authenticated: false` in `/health`, the proxy will return 401 the
moment a request lands. The agent panel will show a friendly banner:
> *Hermes 鉴权失败 (401)。请检查 API key 或重新登录上游 provider。*

---

## Configuring the web app

`Client/web/.env.example` ships sane defaults; copy it to `.env` and
edit if your setup is non-standard:

```ini
VITE_HERMES_BASE_URL=http://127.0.0.1:8645
VITE_HERMES_MODEL=gpt-4o-mini
VITE_HERMES_API_KEY=local-hermes
```

| Var                   | Default                  | When to change                                            |
| --------------------- | ------------------------ | --------------------------------------------------------- |
| `VITE_HERMES_BASE_URL`| `http://127.0.0.1:8645`  | Hermes runs in Docker, on a remote box, or a custom port  |
| `VITE_HERMES_MODEL`   | `gpt-4o-mini`            | Your upstream exposes a different model id                |
| `VITE_HERMES_API_KEY` | `local-hermes`           | You've fronted Hermes with a real auth layer              |

Vite only exposes env vars prefixed with `VITE_` to client code — that's
a hard Vite rule, not a choice. Do **not** put real secrets in
`VITE_HERMES_*`; the whole bundle is shipped to the browser.

---

## What the panel shows when something is wrong

The hook converts every failure mode into a human-readable string. From
the user's perspective the bubble they just spawned shows the error
inline, and `lastError` is also available for the panel header.

| Symptom in UI                                                    | Root cause                                                                 |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------- |
| *连不上 Hermes (http://127.0.0.1:8645)*                          | `hermes proxy` not running, port blocked, or wrong `VITE_HERMES_BASE_URL`  |
| *Hermes 鉴权失败 (401)*                                          | `hermes portal` (or `hermes auth add xai-oauth`) needs to be re-run        |
| *Hermes 返回 500 …*                                              | Upstream provider outage — check `hermes status` and the proxy logs       |
| *Hermes 没有返回可读流*                                          | Upstream misconfigured or Hermes version too old (< 0.16)                  |
| *流式连接中断*                                                    | Network blip mid-stream — the partial bubble is kept, the user can retry   |
| *请求已取消*                                                     | User clicked the cancel button — expected, no action needed                |

### Quick triage

```bash
# Is the port open?
lsof -nP -iTCP:8645 -sTCP:LISTEN

# Does the proxy respond?
curl -s -m 3 http://127.0.0.1:8645/health

# Are you authenticated?
curl -s http://127.0.0.1:8645/v1/models | jq '.data | length'

# Is the model id known to the upstream?
curl -s http://127.0.0.1:8645/v1/models | jq '.data[].id'

# Tail the proxy / Hermes logs
hermes logs --tail 50
```

---

## Manual smoke test (no UI required)

Once Hermes proxy is up you can confirm the wire format the panel uses
with one curl:

```bash
curl -N -s -X POST http://127.0.0.1:8645/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer local-hermes' \
  -d '{
    "model": "gpt-4o-mini",
    "stream": true,
    "messages": [{"role": "user", "content": "ping"}]
  }'
```

You should see a stream of `data: {…}` lines, one `data: [DONE]` at the
end, and exit with HTTP 200. If you see that, the agent panel will work
in the browser too.

---

## Files touched by this integration

- `Client/web/src/components/agent/useAgentChat.ts` — replaced the mock
  reply with a real `fetch` + SSE consumer.
- `Client/web/src/components/agent/HERMES_INTEGRATION.md` — this file.
- `Client/web/.env.example` — template; copy to `.env` to override the
  in-code defaults (`http://127.0.0.1:8645`, model `gpt-4o-mini`).

The hook's public API (`messages`, `isStreaming`, `lastError`,
`attachments`, `send`, `cancel`, `removeAttachment`, `addAttachments`,
`clear`) is unchanged — panel components do not need to be modified.
