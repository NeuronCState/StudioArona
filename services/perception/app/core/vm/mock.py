"""Mock VMBackend — in-memory state machine.

Mac default. Simulates VM lifecycle with async state transitions.
create → creating (8s) → running
"""

from __future__ import annotations

import asyncio
import time
import uuid

import structlog

from app.core.vm.base import SshEndpoint, VM, VMSpec

logger = structlog.get_logger(subsystem="vm")

# State transition delay (seconds)
_CREATE_DELAY = 8.0


class MockVMBackend:
    """Mock VM backend with in-memory state machine."""

    def __init__(self) -> None:
        self._vms: dict[str, VM] = {}

    async def list(self, owner_id: str | None = None) -> list[VM]:
        vms = list(self._vms.values())
        if owner_id:
            vms = [vm for vm in vms if vm.owner_id == owner_id]
        return vms

    async def create(self, spec: VMSpec, owner_id: str) -> VM:
        vm_id = f"vm_{uuid.uuid4().hex[:8]}"
        now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

        vm = VM(
            id=vm_id,
            owner_id=owner_id,
            name=spec.name,
            cpu=spec.cpu,
            mem_gb=spec.mem_gb,
            disk_gb=spec.disk_gb,
            image=spec.image,
            status="creating",
            ssh_port=None,
            created_at=now,
        )
        self._vms[vm_id] = vm
        logger.info("vm_mock_create", vm_id=vm_id, owner=owner_id, name=spec.name)

        # Simulate async transition to running
        asyncio.create_task(self._transition_to_running(vm_id))
        return vm

    async def start(self, id: str) -> None:
        vm = self._get(id)
        if vm.status != "stopped":
            raise ValueError(f"Cannot start VM {id} in state {vm.status}")
        vm.status = "running"
        logger.info("vm_mock_start", vm_id=id)

    async def stop(self, id: str) -> None:
        vm = self._get(id)
        if vm.status != "running":
            raise ValueError(f"Cannot stop VM {id} in state {vm.status}")
        vm.status = "stopped"
        logger.info("vm_mock_stop", vm_id=id)

    async def destroy(self, id: str) -> None:
        vm = self._get(id)
        if vm.status == "destroyed":
            raise ValueError(f"VM {id} already destroyed")
        vm.status = "destroyed"
        logger.info("vm_mock_destroy", vm_id=id)

    async def upload(self, id: str, src_path: str, dst_path: str) -> None:
        vm = self._get(id)
        if vm.status != "running":
            raise ValueError(f"Cannot upload to VM {id} in state {vm.status}")
        logger.info("vm_mock_upload", vm_id=id, src=src_path, dst=dst_path)

    async def ssh_endpoint(self, id: str) -> SshEndpoint:
        vm = self._get(id)
        if vm.status != "running":
            raise ValueError(f"VM {id} not running, cannot get SSH endpoint")
        return SshEndpoint(host="127.0.0.1", port=2222, user="ubuntu")

    def _get(self, id: str) -> VM:
        if id not in self._vms:
            raise KeyError(f"VM {id} not found")
        return self._vms[id]

    async def console(self, id: str, lines: int = 50) -> dict:
        vm = self._get(id)
        if vm.status not in ("running", "stopped", "error"):
            raise ValueError(f"Cannot read console of VM {id} in state {vm.status}")

        # Generate mock console log lines
        template = [
            "[    0.000000] Booting Linux on physical CPU 0x0",
            "[    0.000000] Linux version 6.8.0-48-generic (buildd@lcy02-amd64-080)",
            "[    0.123456] CPU: Intel(R) Core(TM) i7-10750H CPU @ 2.60GHz",
            f"[    0.234567] Memory: {vm.mem_gb * 1024 * 1024}K available",
            "[    0.345678] smpboot: CPU0: Intel(R) Core(TM) i7-10750H CPU @ 2.60GHz",
            "[    1.456789] EXT4-fs (vda1): mounted filesystem with ordered data mode",
            "[    2.567890] systemd[1]: systemd 255.4-1ubuntu8 running in system mode",
            "[    3.678901] systemd[1]: Started Journal Service",
            "[    4.789012] sshd[1234]: Server listening on 0.0.0.0 port 22",
            "[    5.890123] cloud-init[5678]: SSH host keys generated",
            f"[   10.000000] VM {id} boot complete, status={vm.status}",
            f"[   15.000000] CPU cores: {vm.cpu}, Memory: {vm.mem_gb}GB, Disk: {vm.disk_gb}GB",
            "[   20.000000] docker.service: Starting Docker Application Container Engine...",
            "[   25.000000] docker.service: Started Docker Application Container Engine",
            "[   30.000000] NetworkManager[9012]: device eth0 connected",
        ]

        # Pad with generic lines if requested more than template
        all_lines = list(template)
        while len(all_lines) < lines:
            ts = 30 + len(all_lines) - len(template) + 1
            all_lines.append(f"[   {ts:02d}.000000] system log entry {len(all_lines) + 1}")

        truncated = len(all_lines) > lines
        output_lines = all_lines[-lines:] if truncated else all_lines

        logger.info("vm_mock_console", vm_id=id, lines=lines, truncated=truncated)
        return {
            "vm_id": id,
            "lines": "\n".join(output_lines),
            "truncated": truncated,
        }

    async def toggle_exec(self, id: str, enabled: bool) -> dict:
        vm = self._get(id)
        # In mock mode, we track exec_enabled in a separate dict
        if not hasattr(self, "_exec_enabled"):
            self._exec_enabled = {}
        self._exec_enabled[id] = enabled
        logger.info("vm_mock_toggle_exec", vm_id=id, enabled=enabled)
        return {
            "id": vm.id,
            "name": vm.name,
            "status": vm.status,
            "exec_enabled": enabled,
        }

    async def _transition_to_running(self, vm_id: str) -> None:
        await asyncio.sleep(_CREATE_DELAY)
        if vm_id in self._vms and self._vms[vm_id].status == "creating":
            self._vms[vm_id].status = "running"
            self._vms[vm_id].ssh_port = 2222
            logger.info("vm_mock_transition", vm_id=vm_id, new_status="running")
