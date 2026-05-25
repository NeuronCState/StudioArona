"""NAS (飞牛 fnOS) client — user provisioning and auto-login proxy."""

import asyncio
import logging
import os
import subprocess
from pathlib import Path

import httpx

logger = logging.getLogger(__name__)

NAS_HOST = os.environ.get("NAS_HOST", "192.168.198.129")
NAS_SSH_PORT = os.environ.get("NAS_SSH_PORT", "23")
NAS_SSH_USER = os.environ.get("NAS_SSH_USER", "arona")
NAS_SSH_PASSWORD = os.environ.get("NAS_SSH_PASSWORD", "arona")
NAS_WEB_URL = os.environ.get("NAS_WEB_URL", "http://192.168.198.129:5666")

_SSHPASS = "sshpass"
if Path("/opt/homebrew/bin/sshpass").exists():
    _SSHPASS = "/opt/homebrew/bin/sshpass"


def _nas_ssh(args: list[str], timeout: int = 30) -> subprocess.CompletedProcess:
    cmd = [
        _SSHPASS, "-p", NAS_SSH_PASSWORD,
        "ssh", "-o", "ConnectTimeout=5", "-o", "StrictHostKeyChecking=no",
        "-p", NAS_SSH_PORT,
        f"{NAS_SSH_USER}@{NAS_HOST}",
    ] + args
    return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)


async def create_nas_user(username: str, password: str) -> bool:
    """Create a NAS user with the given credentials. No storage quota.

    Returns True if user was created, False if already exists.
    """
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None, _nas_ssh, [f"id {username} 2>/dev/null && echo EXISTS || echo NOT_FOUND"]
    )
    if "EXISTS" in result.stdout:
        return False

    enc_result = await loop.run_in_executor(
        None, _nas_ssh, [f"openssl passwd -6 '{password}' 2>/dev/null || echo '{password}' | openssl passwd -6 -stdin"]
    )
    password_hash = enc_result.stdout.strip()

    create_result = await loop.run_in_executor(
        None, _nas_ssh, [
            "sudo", "useradd", "-m", "-s", "/usr/sbin/nologin",
            "-p", password_hash, username,
        ]
    )
    if create_result.returncode != 0:
        raise RuntimeError(f"Failed to create NAS user '{username}': {create_result.stderr}")

    return True


# ── NAS auto-login: per-user authenticated proxy session ────

_sessions: dict[str, httpx.AsyncClient] = {}


async def _authenticate_with_nas(username: str, password: str) -> httpx.AsyncClient:
    """Authenticate with the NAS web UI and return a cookied httpx client."""
    client = httpx.AsyncClient(
        timeout=httpx.Timeout(30.0, read=60.0),
        follow_redirects=False,
    )

    # Step 1: Get the login page to obtain any CSRF tokens / cookies
    try:
        await client.get(f"{NAS_WEB_URL}/", timeout=10.0)
    except Exception as e:
        logger.warning(f"NAS pre-fetch failed: {e}")

    # Step 2: Try to login via the CGI endpoint
    try:
        resp = await client.post(
            f"{NAS_WEB_URL}/cgi/login",
            json={"username": username, "password": password},
            timeout=10.0,
        )
        logger.info(f"NAS /cgi/login: {resp.status_code} cookies={dict(resp.cookies)} body={resp.text[:200]}")
    except Exception as e:
        logger.warning(f"NAS /cgi/login failed: {e}")

    return client


async def get_nas_session(username: str, password: str) -> httpx.AsyncClient:
    """Get or create an authenticated NAS session for the given user."""
    if username in _sessions:
        client = _sessions[username]
        if not client.is_closed:
            return client

    client = await _authenticate_with_nas(username, password)
    _sessions[username] = client
    return client


async def cleanup_nas_sessions():
    """Close all NAS sessions."""
    for username, client in list(_sessions.items()):
        if not client.is_closed:
            await client.aclose()
        del _sessions[username]
