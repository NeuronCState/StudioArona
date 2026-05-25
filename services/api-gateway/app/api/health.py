"""Health check endpoint."""

from fastapi import APIRouter

router = APIRouter(tags=["Health"])


@router.get("/health")
async def health():
    return {"status": "ok", "service": "api-gateway"}
@router.get("/api/health")
async def api_health():
    return {"status": "ok", "service": "api-gateway"}
