"""NAS (飞牛 fnOS) client — user provisioning and auto-login."""

import asyncio
import logging
import os
import shutil
import subprocess

logger = logging.getLogger(__name__)

import base64

NAS_HOST = os.environ.get("NAS_HOST", "192.168.198.129")
NAS_SSH_PORT = os.environ.get("NAS_SSH_PORT", "23")
NAS_SSH_USER = os.environ.get("NAS_SSH_USER", "arona")
NAS_SSH_PASSWORD = os.environ.get("NAS_SSH_PASSWORD", "arona")
NAS_WEB_URL = os.environ.get("NAS_WEB_URL", "http://192.168.198.129:5666")
NAS_RSA_PRIVATE_KEY = os.environ.get("NAS_RSA_PRIVATE_KEY", "")

# The env var may be base64-encoded (to support multi-line PEM in .env files)
if NAS_RSA_PRIVATE_KEY and "BEGIN PRIVATE KEY" not in NAS_RSA_PRIVATE_KEY:
    try:
        NAS_RSA_PRIVATE_KEY = base64.b64decode(NAS_RSA_PRIVATE_KEY).decode("utf-8")
    except Exception:
        pass


def _fetch_rsa_key_from_nas() -> str:
    """Try to fetch the RSA private key from the NAS at module load time."""
    if NAS_RSA_PRIVATE_KEY:
        return NAS_RSA_PRIVATE_KEY
    try:
        result = _nas_ssh(
            [f"echo {NAS_SSH_PASSWORD} | sudo -S cat /usr/trim/etc/rsa_private_key.pem"],
            timeout=15,
        )
        if result.returncode == 0 and "BEGIN PRIVATE KEY" in result.stdout:
            return result.stdout.strip()
    except Exception:
        pass
    return ""


# Auto-fetch RSA key on module load
if not NAS_RSA_PRIVATE_KEY:
    _fetched = _fetch_rsa_key_from_nas()
    if _fetched:
        NAS_RSA_PRIVATE_KEY = _fetched
        logger.info("RSA private key loaded from NAS")

_SSHPASS = shutil.which("sshpass") or "sshpass"
_KNOWN_HOSTS_FILE = "NUL" if os.name == "nt" else "/dev/null"


def _nas_ssh(args: list[str], timeout: int = 30) -> subprocess.CompletedProcess:
    cmd = [
        _SSHPASS, "-p", NAS_SSH_PASSWORD,
        "ssh",
        "-o", "ConnectTimeout=5",
        "-o", "StrictHostKeyChecking=no",
        "-o", f"UserKnownHostsFile={_KNOWN_HOSTS_FILE}",
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
        None, _nas_ssh, [f"openssl passwd -6 '{password}'"]
    )
    password_hash = enc_result.stdout.strip()
    if not password_hash:
        raise RuntimeError(f"Failed to hash password for NAS user '{username}'")

    create_result = await loop.run_in_executor(
        None, _nas_ssh, [
            f"echo {NAS_SSH_PASSWORD} | sudo -S useradd -m -s /usr/sbin/nologin -p {password_hash} {username}"
        ]
    )
    if create_result.returncode != 0:
        raise RuntimeError(f"Failed to create NAS user '{username}': {create_result.stderr}")

    return True


def generate_nas_token(username: str) -> str | None:
    """Generate a NAS-compatible JWT token signed with the NAS RSA private key."""
    if not NAS_RSA_PRIVATE_KEY:
        return None

    try:
        from jose import jwt
        import time
        payload = {
            "sub": username,
            "iat": int(time.time()),
            "exp": int(time.time()) + 300,
        }
        return jwt.encode(payload, NAS_RSA_PRIVATE_KEY, algorithm="RS256")
    except Exception as e:
        logger.warning(f"Failed to generate NAS token: {e}")
        return None
