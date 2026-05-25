"""Network scanning API — /api/network/* routes.

GET /api/network/devices → list network devices
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.core.network.base import NetworkDevice

router = APIRouter(prefix="/api/network", tags=["Network"])


def _get_scanner():
    from app.core.factory import create_network_scanner

    return create_network_scanner()


@router.get("/devices", response_model=list[NetworkDevice])
async def list_devices() -> list[NetworkDevice]:
    """List devices on the local network.

    Mac stage: 12 mock devices with random online status.
    Linux stage: nmap ping scan + ARP table.
    """
    scanner = _get_scanner()
    try:
        return await scanner.scan()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Network scan failed: {e}")
