"""REST API — 长期记忆叙事。"""

import random

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from memory.memory_manager import MemoryManager

router = APIRouter()


class MemoryCreate(BaseModel):
    description: str
    theme: str


class MemoryUpdate(BaseModel):
    description: str | None = None
    theme: str | None = None
    reason: str = "Studio Arona graphical edit"


@router.get("/narrative")
async def get_narrative(request: Request):
    ltm = request.app.state.ltm
    return {"narrative": ltm.get_narrative()}


@router.get("/memories")
async def get_memories(request: Request):
    ltm = request.app.state.ltm
    mm = MemoryManager(yaml_file=str(ltm._memory_path))
    return mm.get_memories_grouped()


@router.post("/memories")
async def create_memory(body: MemoryCreate, request: Request):
    mm = MemoryManager(yaml_file=str(request.app.state.ltm._memory_path))
    memory_id = mm.add(body.description.strip(), body.theme.strip())
    from api.routes.configuration import refresh_prompt

    refresh_prompt(request)
    return {"id": memory_id, "description": body.description, "theme": body.theme}


@router.put("/memories/{memory_id}")
async def update_memory(memory_id: str, body: MemoryUpdate, request: Request):
    mm = MemoryManager(yaml_file=str(request.app.state.ltm._memory_path))
    try:
        mm.update(memory_id, body.reason, body.description, body.theme)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    from api.routes.configuration import refresh_prompt

    refresh_prompt(request)
    return {"status": "updated"}


@router.delete("/memories/{memory_id}")
async def delete_memory(memory_id: str, request: Request):
    mm = MemoryManager(yaml_file=str(request.app.state.ltm._memory_path))
    try:
        removed = mm.delete(memory_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    from api.routes.configuration import refresh_prompt

    refresh_prompt(request)
    return {"status": "deleted", "description": removed}


@router.get("/moment")
async def get_moment(request: Request):
    ltm = request.app.state.ltm
    mm = MemoryManager(yaml_file=str(ltm._memory_path))
    items = mm.show()
    if not items:
        return {"moment": None}
    chosen = random.choice(items)
    history = mm.show_description_history(chosen["id"])
    return {
        "moment": {
            "id": chosen["id"],
            "description": chosen["description"],
            "theme": chosen["theme"],
            "history": history,
        }
    }
