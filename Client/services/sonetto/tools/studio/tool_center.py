"""Authenticated tools for Studio Arona schedules, feeds, monitors, status, and memory."""

from typing import Any

import requests
from pydantic import BaseModel, Field

from tools.base import ToolBase, format_error, format_success
from tools.studio.context import center_access_token, center_base_url


def _request(method: str, path: str, body: dict[str, Any] | None = None) -> dict[str, Any] | list[Any]:
    token = center_access_token.get()
    if not token:
        raise ValueError("Studio Server 未连接或当前会话没有用户身份，请先登录并连接 Server")
    response = requests.request(
        method,
        f"{center_base_url.get()}{path}",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json=body,
        timeout=20,
    )
    if response.status_code == 204:
        return {"status": "ok"}
    try:
        payload = response.json()
    except ValueError:
        payload = {"error": response.text or response.reason}
    if not response.ok:
        raise ValueError(payload.get("error") or payload.get("message") or f"HTTP {response.status_code}")
    return payload


class ScheduleInput(BaseModel):
    action: str = Field(description="list/create/update/delete")
    id: str = ""
    title: str = ""
    body: str = ""
    starts_at: str = Field(default="", description="ISO 8601 time with timezone")
    duration_minutes: int = 60
    location: str = ""
    expected_updated_at: str = ""
    confirm: bool = False


class StudioScheduleTool(ToolBase):
    name: str = "studio_schedule"
    description: str = "读取、创建、更新或删除当前 StudioArona 用户的日程。删除必须 confirm=true。"
    args_schema: type[BaseModel] = ScheduleInput

    def _run(self, action: str, id: str = "", title: str = "", body: str = "", starts_at: str = "", duration_minutes: int = 60, location: str = "", expected_updated_at: str = "", confirm: bool = False) -> str:
        try:
            if action == "list":
                return format_success({"items": _request("GET", "/api/schedules")})
            if action == "delete":
                if not confirm: return format_error("删除日程需要 confirm=true")
                return format_success(_request("DELETE", f"/api/schedules/{id}"))
            if action not in {"create", "update"}: return format_error("action 必须是 list/create/update/delete")
            payload = {"title": title, "body": body or None, "starts_at": starts_at, "duration_minutes": duration_minutes, "location": location or None}
            if expected_updated_at: payload["expected_updated_at"] = expected_updated_at
            method, path = ("POST", "/api/schedules") if action == "create" else ("PATCH", f"/api/schedules/{id}")
            return format_success(_request(method, path, payload))
        except Exception as exc: return format_error(str(exc))


class FeedInput(BaseModel):
    action: str = Field(description="list/create/update/delete/refresh/items")
    id: str = ""
    url: str = ""
    title: str = ""
    source: str = ""
    priority: str = "normal"
    enabled: bool = True
    confirm: bool = False


class StudioFeedTool(ToolBase):
    name: str = "studio_feeds"
    description: str = "管理当前用户的 RSS 信息源，读取条目或立即刷新。删除必须 confirm=true。"
    args_schema: type[BaseModel] = FeedInput

    def _run(self, action: str, id: str = "", url: str = "", title: str = "", source: str = "", priority: str = "normal", enabled: bool = True, confirm: bool = False) -> str:
        try:
            if action == "list": return format_success({"items": _request("GET", "/api/feeds")})
            if action == "items": return format_success({"items": _request("GET", f"/api/feeds/{id}/items")})
            if action == "refresh": return format_success(_request("POST", f"/api/feeds/{id}/refresh"))
            if action == "delete":
                if not confirm: return format_error("删除信息源需要 confirm=true")
                return format_success(_request("DELETE", f"/api/feeds/{id}"))
            if action not in {"create", "update"}: return format_error("action 必须是 list/create/update/delete/refresh/items")
            payload = {"url": url, "title": title or None, "source": source or None, "priority": priority, "enabled": enabled}
            method, path = ("POST", "/api/feeds") if action == "create" else ("PATCH", f"/api/feeds/{id}")
            return format_success(_request(method, path, payload))
        except Exception as exc: return format_error(str(exc))


class MonitorInput(BaseModel):
    action: str = Field(description="list/create/update/delete/check/events")
    id: str = ""
    url: str = ""
    label: str = ""
    css_selector: str = "body"
    check_interval_min: int = 15
    enabled: bool = True
    confirm: bool = False


class StudioMonitorTool(ToolBase):
    name: str = "studio_page_monitors"
    description: str = "管理当前用户的网页信息源监控，读取变更事件或立即检查。删除必须 confirm=true。"
    args_schema: type[BaseModel] = MonitorInput

    def _run(self, action: str, id: str = "", url: str = "", label: str = "", css_selector: str = "body", check_interval_min: int = 15, enabled: bool = True, confirm: bool = False) -> str:
        try:
            if action == "list": return format_success({"items": _request("GET", "/api/page-monitors")})
            if action == "events": return format_success({"items": _request("GET", f"/api/page-monitors/{id}/events")})
            if action == "check": return format_success(_request("POST", f"/api/page-monitors/{id}/check"))
            if action == "delete":
                if not confirm: return format_error("删除网页监控需要 confirm=true")
                return format_success(_request("DELETE", f"/api/page-monitors/{id}"))
            if action not in {"create", "update"}: return format_error("action 必须是 list/create/update/delete/check/events")
            payload = {"url": url, "label": label, "css_selector": css_selector, "check_interval_min": check_interval_min, "enabled": enabled}
            method, path = ("POST", "/api/page-monitors") if action == "create" else ("PATCH", f"/api/page-monitors/{id}")
            return format_success(_request(method, path, payload))
        except Exception as exc: return format_error(str(exc))


class StatusInput(BaseModel):
    resource: str = Field(description="notifications/unread/cron/system/vms")


class StudioStatusTool(ToolBase):
    name: str = "studio_status"
    description: str = "读取当前用户通知以及 StudioArona cron、系统指标或虚拟机状态。"
    args_schema: type[BaseModel] = StatusInput

    def _run(self, resource: str) -> str:
        paths = {"notifications": "/api/notifications", "unread": "/api/notifications/unread-count", "cron": "/api/system/cron-status", "system": "/api/system/metrics", "vms": "/api/vms"}
        try:
            if resource not in paths: return format_error(f"resource 必须是: {', '.join(paths)}")
            return format_success({"data": _request("GET", paths[resource])})
        except Exception as exc: return format_error(str(exc))


class MemoryInput(BaseModel):
    action: str = Field(description="list/create/update/delete")
    id: str = ""
    category: str = "general"
    content: str = ""
    importance: int = 3
    source: str = "agent"
    metadata: dict[str, Any] = Field(default_factory=dict)
    confirm: bool = False


class StudioMemoryTool(ToolBase):
    name: str = "studio_server_memory"
    description: str = "管理同步到 StudioArona Server、按用户隔离的记忆条目。删除必须 confirm=true。"
    args_schema: type[BaseModel] = MemoryInput

    def _run(self, action: str, id: str = "", category: str = "general", content: str = "", importance: int = 3, source: str = "agent", metadata: dict[str, Any] | None = None, confirm: bool = False) -> str:
        try:
            if action == "list": return format_success({"items": _request("GET", "/api/memory/entries")})
            if action == "delete":
                if not confirm: return format_error("删除 Server memory 需要 confirm=true")
                return format_success(_request("DELETE", f"/api/memory/entries/{id}"))
            if action not in {"create", "update"}: return format_error("action 必须是 list/create/update/delete")
            payload = {"category": category, "content": content, "importance": importance, "source": source, "metadata": metadata or {}}
            method, path = ("POST", "/api/memory/entries") if action == "create" else ("PATCH", f"/api/memory/entries/{id}")
            return format_success(_request(method, path, payload))
        except Exception as exc: return format_error(str(exc))
