"""Studio Arona graphical configuration API."""

from pathlib import Path
from typing import Any

from dotenv import dotenv_values, set_key, unset_key
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from agent.prompts import PERSONAS_DIR, _read_persona, build_system_prompt
from config.settings import reset_settings
from config.studio import load_studio_config, save_studio_config
from memory.narrative import get_narrative

router = APIRouter()
ROOT = Path(__file__).resolve().parent.parent.parent
ENV_PATH = ROOT / ".env"

PERSONA_FILES = {"agents": "AGENTS.md", "soul": "SOUL.md", "user": "USER.md"}
SECRET_FIELDS = {
    "zhipuai_api_key": "ZHIPUAI_API_KEY",
    "todoist_api_token": "TODOIST_API_TOKEN",
    "uapis_api_key": "UAPIS_API_KEY",
    "amap_api_key": "AMAP_API_KEY",
    "tavily_api_key": "TAVILY_API_KEY",
}


class PersonaUpdate(BaseModel):
    agents: str
    soul: str
    user: str


class CredentialsUpdate(BaseModel):
    values: dict[str, str] = Field(default_factory=dict)
    clear: list[str] = Field(default_factory=list)


class ToolsUpdate(BaseModel):
    disabled_tools: list[str]


class McpUpdate(BaseModel):
    servers: dict[str, dict[str, Any]]


def refresh_prompt(request: Request) -> None:
    _read_persona.cache_clear()
    build_system_prompt.cache_clear()
    get_narrative.cache_clear()
    request.app.state.system_prompt = build_system_prompt()


def _read_personas() -> dict[str, str]:
    return {
        key: (PERSONAS_DIR / filename).read_text(encoding="utf-8")
        if (PERSONAS_DIR / filename).exists()
        else ""
        for key, filename in PERSONA_FILES.items()
    }


def _credential_status() -> dict[str, bool]:
    values = dotenv_values(ENV_PATH) if ENV_PATH.exists() else {}
    return {key: bool(values.get(env_name)) for key, env_name in SECRET_FIELDS.items()}


@router.get("/config")
async def get_configuration(request: Request):
    studio = load_studio_config()
    disabled = set(studio.get("disabled_tools", []))
    native_tools = getattr(request.app.state, "native_tools", [])
    mcp_tools = getattr(request.app.state, "mcp_tools", [])
    return {
        "personas": _read_personas(),
        "credentials": _credential_status(),
        "tools": [
            {
                "name": tool.name,
                "description": tool.description,
                "enabled": tool.name not in disabled,
                "source": "native",
            }
            for tool in native_tools
        ]
        + [
            {
                "name": tool.name,
                "description": tool.description,
                "enabled": True,
                "source": "mcp",
            }
            for tool in mcp_tools
        ],
        "mcp_servers": studio.get("mcp_servers", {}),
    }


@router.put("/config/personas")
async def update_personas(body: PersonaUpdate, request: Request):
    PERSONAS_DIR.mkdir(parents=True, exist_ok=True)
    for key, filename in PERSONA_FILES.items():
        (PERSONAS_DIR / filename).write_text(getattr(body, key), encoding="utf-8")
    refresh_prompt(request)
    return {"personas": _read_personas()}


@router.put("/config/credentials")
async def update_credentials(body: CredentialsUpdate):
    ENV_PATH.touch(exist_ok=True)
    unknown = (set(body.values) | set(body.clear)) - set(SECRET_FIELDS)
    if unknown:
        raise HTTPException(status_code=400, detail=f"Unknown credentials: {sorted(unknown)}")
    for key, value in body.values.items():
        if value:
            set_key(str(ENV_PATH), SECRET_FIELDS[key], value, quote_mode="always")
    for key in body.clear:
        unset_key(str(ENV_PATH), SECRET_FIELDS[key])
    reset_settings()
    return {"credentials": _credential_status(), "restart_required": True}


@router.put("/config/tools")
async def update_tools(body: ToolsUpdate, request: Request):
    native_tools = getattr(request.app.state, "native_tools", [])
    known = {tool.name for tool in native_tools}
    unknown = set(body.disabled_tools) - known
    if unknown:
        raise HTTPException(status_code=400, detail=f"Unknown tools: {sorted(unknown)}")
    disabled = sorted(set(body.disabled_tools))
    studio = load_studio_config()
    studio["disabled_tools"] = disabled
    save_studio_config(studio)
    request.app.state.tools = [tool for tool in native_tools if tool.name not in set(disabled)] + list(
        getattr(request.app.state, "mcp_tools", [])
    )
    return {"disabled_tools": disabled}


@router.put("/config/mcp")
async def update_mcp(body: McpUpdate):
    studio = load_studio_config()
    studio["mcp_servers"] = body.servers
    save_studio_config(studio)
    return {"mcp_servers": body.servers, "restart_required": True}
