"""Client-side OCR service — PaddleOCR-VL via llama.cpp.

桌面应用按需启动:
  - Tauri 启动时不调 (模型 1.7G 不进 boot)
  - 用户进 OCR 页面 → 前端调 Tauri command `ensure_ocr()` → Rust spawn llama-server (端口 8082)
  - 空闲 5min 自动 kill (释放内存/显存)
  - Web 模式 (无 Tauri): 直接 python -m uvicorn, 端口 8083

模型分发 (可选安装 + 升级):
  - 默认不安装 OCR 模型, 客户端零额外体积
  - 用户进 OCR 页面 → /health 报 model_installed=false → 前端弹下载 Modal
  - 调用 POST /api/ocr/install {"version": "1.6"} → 后端 spawn download_ocr.sh
  - 装完自动写 current.json 标记激活版本
  - 用户点"检查更新" → /api/ocr/check-update 调 hf-mirror API → 比对版本

依赖 (与 SonettoHere 共享 venv):
  - fastapi
  - httpx
  - pillow
  - pyobjc-framework-Quartz (macOS PDF→image)
"""
from __future__ import annotations

import asyncio
import base64
import json
import os
import platform
import shutil
import subprocess
import tempfile
import time
from contextlib import asynccontextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx
from fastapi import BackgroundTasks, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ---------- 路径 (Client/ 为 cwd) ----------
# main.py 在 Client/services/ocr/main.py → parent.parent.parent = Client/
VENDOR_ROOT = Path(__file__).resolve().parent.parent.parent
VENDOR_DIR = VENDOR_ROOT / "vendor" / "paddle-ocr"
LLAMA_CPP_DIR = VENDOR_ROOT / "vendor" / "llama.cpp"
DOWNLOAD_SCRIPT = VENDOR_ROOT / "scripts" / "download_ocr.sh"
CURRENT_JSON = VENDOR_DIR / "current.json"

LLAMA_PORT = int(os.environ.get("OCR_LLAMA_PORT", "8082"))
APP_PORT = int(os.environ.get("OCR_PORT", "8083"))

# hf-mirror 的模型发现 API (无 key, 无需鉴权)
# 注意: hf-mirror.com 只镜像模型文件下载, 不镜像 API endpoint;
# 模型发现走 huggingface.co 官方 API (国内慢, 但就一次).
HF_MIRROR = os.environ.get("HF_ENDPOINT", "https://hf-mirror.com")
HF_API_MODELS = "https://huggingface.co/api/models?author=PaddlePaddle&search=PaddleOCR-VL&limit=20"


def get_platform() -> str:
    system = platform.system().lower()
    machine = platform.machine().lower()
    if system == "darwin" and machine == "arm64":
        return "darwin-arm64"
    if system == "linux" and machine == "x86_64":
        return "linux-x64"
    if system == "windows" and machine == "x86_64":
        return "windows-x64"
    raise RuntimeError(f"Unsupported platform: {system}/{machine}")


def get_llama_server_path() -> Path:
    plat = get_platform()
    server = LLAMA_CPP_DIR / plat / "llama-server"
    if not server.exists():
        server = LLAMA_CPP_DIR / plat / "llama-server.exe"
    if not server.exists():
        raise RuntimeError(f"llama-server not found at {server}")
    return server


def get_model_paths() -> tuple[Path, Path]:
    """解析当前激活版本的模型路径. 优先版本子目录, fallback 旧平铺布局."""
    version = read_current_version()
    if version:
        model = VENDOR_DIR / version / f"PaddleOCR-VL-{version}-GGUF.gguf"
        mmproj = VENDOR_DIR / version / f"PaddleOCR-VL-{version}-GGUF-mmproj.gguf"
        if model.exists() and mmproj.exists():
            return model, mmproj
        # current.json 标记了但文件不在, 视为损坏
        if (VENDOR_DIR / version).exists():
            raise RuntimeError(
                f"current.json points to {version} but files missing under {VENDOR_DIR / version}"
            )
    # 旧平铺布局兼容: vendor/paddle-ocr/PaddleOCR-VL-X.Y-GGUF.gguf
    for sub in sorted(VENDOR_DIR.glob("PaddleOCR-VL-*-GGUF.gguf"), reverse=True):
        mmproj_name = sub.name.replace("-GGUF.gguf", "-GGUF-mmproj.gguf")
        mmproj_candidate = sub.parent / mmproj_name
        if mmproj_candidate.exists():
            return sub, mmproj_candidate
    raise RuntimeError(
        f"No OCR model found in {VENDOR_DIR}. "
        f"Run POST /api/ocr/install {{\"version\": \"1.6\"}} or `bash scripts/download_ocr.sh 1.6`."
    )


def read_current_json() -> dict[str, Any] | None:
    """读 current.json, 缺失或损坏返回 None."""
    if not CURRENT_JSON.exists():
        return None
    try:
        return json.loads(CURRENT_JSON.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None


def read_current_version() -> str | None:
    """读 current.json 拿当前激活版本号, 失败返回 None."""
    data = read_current_json()
    if data and isinstance(data.get("version"), str):
        return data["version"]
    return None


def list_installed_versions() -> list[str]:
    """列出所有已下载的版本号 (按版本号倒序, 数字越大越前)."""
    versions: list[str] = []
    if not VENDOR_DIR.exists():
        return versions
    # 1. 子目录里的版本
    for sub in VENDOR_DIR.iterdir():
        if not sub.is_dir():
            continue
        if not (sub / f"PaddleOCR-VL-{sub.name}-GGUF.gguf").exists():
            continue
        if not (sub / f"PaddleOCR-VL-{sub.name}-GGUF-mmproj.gguf").exists():
            continue
        versions.append(sub.name)
    # 2. 旧平铺布局兼容: vendor/paddle-ocr/PaddleOCR-VL-X.Y-GGUF.gguf
    for f in VENDOR_DIR.glob("PaddleOCR-VL-*-GGUF.gguf"):
        v = _parse_version_from_id(f.name.replace(".gguf", ""))
        if v and v not in versions:
            versions.append(v)
    # 简单排序: 拆 major.minor 倒序 (1.10 > 1.9)
    def key(v: str) -> tuple[int, int]:
        try:
            parts = v.split(".")
            return (int(parts[0]), int(parts[1]) if len(parts) > 1 else 0)
        except (ValueError, IndexError):
            return (0, 0)
    return sorted(versions, key=key, reverse=True)


# ---------- Llama server 进程管理 ----------
async def is_llama_running() -> bool:
    try:
        async with httpx.AsyncClient() as c:
            r = await c.get(f"http://127.0.0.1:{LLAMA_PORT}/health", timeout=2)
            return r.status_code == 200
    except Exception:
        return False


def start_llama_server() -> subprocess.Popen:
    server = get_llama_server_path()
    model, mmproj = get_model_paths()
    # GPU offload (-ngl 99). macOS 用 Metal, Linux/Windows CUDA/Vulkan
    cmd = [
        str(server),
        "-m", str(model),
        "--mmproj", str(mmproj),
        "--port", str(LLAMA_PORT),
        "--host", "127.0.0.1",
        "-ngl", "99",
    ]
    log_path = Path(tempfile.gettempdir()) / "studioarona-ocr-llama.log"
    log_file = open(log_path, "ab")
    return subprocess.Popen(
        cmd,
        stdout=log_file,
        stderr=log_file,
        start_new_session=True,  # 独立进程组, 不受父进程退出影响
    )


async def wait_llama_ready(timeout: int = 60) -> bool:
    import asyncio
    for _ in range(timeout):
        if await is_llama_running():
            return True
        await asyncio.sleep(1)
    return False


# ---------- PDF → image ----------
def pdf_to_images(pdf_path: str) -> list[Path]:
    """Convert PDF pages to PNG images. macOS Quartz, Linux pdftoppm."""
    output_dir = Path(tempfile.mkdtemp(prefix="studioarona-ocr-"))

    if platform.system() == "Darwin":
        try:
            import Quartz
            from CoreFoundation import CFURLCreateFromFileSystemRepresentation

            pdf_url = CFURLCreateFromFileSystemRepresentation(
                None, pdf_path.encode(), len(pdf_path), False
            )
            pdf_doc = Quartz.CGPDFDocumentCreateWithURL(pdf_url)
            num_pages = Quartz.CGPDFDocumentGetNumberOfPages(pdf_doc)

            pages = []
            for i in range(num_pages):
                page = Quartz.CGPDFDocumentGetPage(pdf_doc, i + 1)
                rect = Quartz.CGPDFPageGetBoxRect(page, Quartz.kCGPDFMediaBox)

                scale = 2
                width = int(rect.size.width * scale)
                height = int(rect.size.height * scale)

                cs = Quartz.CGColorSpaceCreateDeviceRGB()
                ctx = Quartz.CGBitmapContextCreate(
                    None, width, height, 8, width * 4, cs,
                    Quartz.kCGImageAlphaPremultipliedLast
                )

                Quartz.CGContextSetRGBFillColor(ctx, 1, 1, 1, 1)
                Quartz.CGContextFillRect(ctx, Quartz.CGRectMake(0, 0, width, height))
                Quartz.CGContextScaleCTM(ctx, scale, scale)
                Quartz.CGContextDrawPDFPage(ctx, page)

                image = Quartz.CGBitmapContextCreateImage(ctx)
                page_path = output_dir / f"page_{i + 1}.png"
                url = CFURLCreateFromFileSystemRepresentation(
                    None, str(page_path).encode(), len(str(page_path)), False
                )
                dest = Quartz.CGImageDestinationCreateWithURL(url, "public.png", 1, None)
                Quartz.CGImageDestinationAddImage(dest, image, None)
                Quartz.CGImageDestinationFinalize(dest)
                pages.append(page_path)

            return pages
        except ImportError:
            pass

    # Linux / Windows fallback
    try:
        subprocess.run(
            ["pdftoppm", "-png", "-r", "200", pdf_path, str(output_dir / "page")],
            check=True,
            capture_output=True,
        )
        return sorted(output_dir.glob("page-*.png"))
    except (subprocess.CalledProcessError, FileNotFoundError):
        raise RuntimeError("Cannot convert PDF to images. macOS needs pyobjc-Quartz, Linux/Windows needs poppler (pdftoppm).")


# ---------- OCR 推理 ----------
async def ocr_image(image_path: Path) -> str:
    """Run PaddleOCR-VL on a single image, return markdown text."""
    if not await is_llama_running():
        # 自动启动 (Web 模式 fallback)
        proc = start_llama_server()
        if not await wait_llama_ready(timeout=60):
            raise RuntimeError("llama-server failed to start")

    with open(image_path, "rb") as f:
        image_data = base64.b64encode(f.read()).decode()

    ext = image_path.suffix.lower()
    mime = "image/png" if ext == ".png" else "image/jpeg"

    payload = {
        "model": "paddleocr-vl",
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{image_data}"}},
                    {"type": "text", "text": "OCR:"},
                ],
            }
        ],
        "max_tokens": 4096,
    }

    async with httpx.AsyncClient(timeout=300) as client:
        resp = await client.post(
            f"http://127.0.0.1:{LLAMA_PORT}/v1/chat/completions",
            json=payload,
        )
        if resp.status_code != 200:
            raise RuntimeError(f"OCR failed: {resp.text}")
        return resp.json()["choices"][0]["message"]["content"]


# ---------- FastAPI app ----------
class ParseResponse(BaseModel):
    markdown: str
    page_count: int


class RecognizeResponse(BaseModel):
    markdown: str


# ---------- 模型安装/升级 API ----------
class CheckUpdateResponse(BaseModel):
    installed: bool
    current_version: str | None = None
    latest_version: str | None = None
    latest_id: str | None = None
    needs_update: bool = False
    available_versions: list[dict[str, Any]] = []
    error: str | None = None


class InstallRequest(BaseModel):
    version: str
    activate: bool = True  # 安装完是否立即激活


class InstallAccepted(BaseModel):
    job_id: str
    version: str
    status: str  # "pending" | "running" | "done" | "failed"


class InstallStatus(BaseModel):
    job_id: str
    version: str
    status: str
    started_at: float
    finished_at: float | None = None
    return_code: int | None = None
    log_tail: str = ""


class ActivateRequest(BaseModel):
    version: str


@dataclass
class InstallJob:
    job_id: str
    version: str
    status: str  # pending | running | done | failed
    started_at: float
    finished_at: float | None = None
    return_code: int | None = None
    log_path: Path | None = None
    process: subprocess.Popen | None = None


# 简易内存态 job 池 (单用户本地, 不做持久化; 进程退出后丢)
_install_jobs: dict[str, InstallJob] = {}
_job_counter = 0
_job_lock = asyncio.Lock()


async def _new_job_id() -> str:
    global _job_counter
    async with _job_lock:
        _job_counter += 1
        return f"job_{int(time.time())}_{_job_counter}"


async def query_latest_from_hf() -> dict[str, Any]:
    """调 hf-mirror 拉 PaddleOCR-VL GGUF 系列, 返回最新 + 列表."""
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(HF_API_MODELS)
            r.raise_for_status()
            data = r.json()
    except Exception as e:
        return {"latest": None, "all": [], "error": str(e)}

    gguf = [m for m in data if "gguf" in m.get("tags", [])]
    gguf.sort(key=lambda m: m.get("createdAt", ""), reverse=True)
    return {"latest": gguf[0] if gguf else None, "all": gguf, "error": None}


def _parse_version_from_id(model_id: str) -> str | None:
    """PaddlePaddle/PaddleOCR-VL-1.6-GGUF -> '1.6'"""
    parts = model_id.split("/")[-1].split("-")
    for p in parts:
        if p and p[0].isdigit() and "." in p:
            return p
    return None


async def run_install_job(job: InstallJob) -> None:
    """后台执行 download_ocr.sh, 写日志, 完成后更新 job 状态."""
    plat = get_platform()
    log_path = Path(tempfile.gettempdir()) / f"studioarona-ocr-install-{job.job_id}.log"
    job.log_path = log_path
    job.status = "running"
    log_f = open(log_path, "ab")
    try:
        proc = await asyncio.create_subprocess_exec(
            "bash", str(DOWNLOAD_SCRIPT), job.version, plat,
            stdout=log_f,
            stderr=asyncio.subprocess.STDOUT,
            start_new_session=True,
        )
        job.process = proc
        return_code = await proc.wait()
        job.return_code = return_code
        job.finished_at = time.time()
        job.status = "done" if return_code == 0 else "failed"
    except Exception as e:
        log_f.write(f"\n[install-error] {e}\n".encode())
        job.status = "failed"
        job.return_code = -1
        job.finished_at = time.time()
    finally:
        log_f.close()


async def _read_log_tail(path: Path, max_bytes: int = 4096) -> str:
    try:
        data = path.read_bytes()
        if len(data) > max_bytes:
            data = data[-max_bytes:]
        return data.decode("utf-8", errors="replace")
    except OSError:
        return ""


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 不自动启动 llama-server (按需)
    yield


app = FastAPI(title="StudioArona OCR", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    llama_ok = await is_llama_running()
    current = read_current_version()
    installed = list_installed_versions()
    # 探测本地是否真有模型文件 (子目录或平铺布局)
    model_installed = bool(installed) and (
        # 1) current.json 指向的子目录文件齐全
        bool(current)
        and (VENDOR_DIR / current / f"PaddleOCR-VL-{current}-GGUF.gguf").exists()
        and (VENDOR_DIR / current / f"PaddleOCR-VL-{current}-GGUF-mmproj.gguf").exists()
        # 2) 或旧平铺布局有 gguf 文件
        or any(VENDOR_DIR.glob("PaddleOCR-VL-*-GGUF.gguf"))
    )
    return {
        "status": "ok",
        "llama_running": llama_ok,
        "model_installed": model_installed,
        "current_version": current,
        "installed_versions": installed,
        "vendor": str(VENDOR_DIR),
    }


@app.get("/api/ocr/check-update", response_model=CheckUpdateResponse)
async def check_update():
    """调 hf-mirror 拉 PaddleOCR-VL-GGUF 系列, 对比 current.json 提示是否升级."""
    current = read_current_version()
    info = await query_latest_from_hf()
    latest = info["latest"]
    latest_version = _parse_version_from_id(latest["id"]) if latest else None
    needs_update = bool(
        latest_version and current and latest_version != current
    )
    return CheckUpdateResponse(
        installed=bool(current),
        current_version=current,
        latest_version=latest_version,
        latest_id=latest["id"] if latest else None,
        needs_update=needs_update,
        available_versions=[
            {
                "version": _parse_version_from_id(m["id"]),
                "id": m["id"],
                "created_at": m.get("createdAt"),
                "downloads": m.get("downloads", 0),
            }
            for m in info["all"]
        ],
        error=info["error"],
    )


@app.post("/api/ocr/install", response_model=InstallAccepted)
async def install_model(req: InstallRequest, bg: BackgroundTasks):
    """异步下载指定版本的 OCR 模型. 不阻塞, 客户端轮询 /api/ocr/install/status."""
    if not DOWNLOAD_SCRIPT.exists():
        raise HTTPException(500, f"download_ocr.sh not found at {DOWNLOAD_SCRIPT}")
    job_id = await _new_job_id()
    job = InstallJob(
        job_id=job_id,
        version=req.version,
        status="pending",
        started_at=time.time(),
    )
    _install_jobs[job_id] = job
    bg.add_task(run_install_job, job)
    return InstallAccepted(job_id=job_id, version=req.version, status="pending")


@app.get("/api/ocr/install/status", response_model=InstallStatus)
async def install_status(job_id: str):
    job = _install_jobs.get(job_id)
    if not job:
        raise HTTPException(404, f"job {job_id} not found")
    log_tail = await _read_log_tail(job.log_path) if job.log_path else ""
    return InstallStatus(
        job_id=job.job_id,
        version=job.version,
        status=job.status,
        started_at=job.started_at,
        finished_at=job.finished_at,
        return_code=job.return_code,
        log_tail=log_tail,
    )


@app.post("/api/ocr/activate")
async def activate_version(req: ActivateRequest):
    """切换 current.json 指向的版本 (要求已下载)."""
    version_dir = VENDOR_DIR / req.version
    if not version_dir.is_dir():
        raise HTTPException(404, f"version {req.version} not installed")
    model = version_dir / f"PaddleOCR-VL-{req.version}-GGUF.gguf"
    mmproj = version_dir / f"PaddleOCR-VL-{req.version}-GGUF-mmproj.gguf"
    if not model.exists() or not mmproj.exists():
        raise HTTPException(404, f"version {req.version} files missing")
    # 写 current.json (覆盖式)
    CURRENT_JSON.write_text(
        json.dumps(
            {
                "version": req.version,
                "activated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "model_file": model.name,
                "mmproj_file": mmproj.name,
            },
            indent=2,
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    return {"status": "ok", "current_version": req.version}


@app.delete("/api/ocr/installed/{version}")
async def uninstall_version(version: str):
    """删除已下载的版本目录. 当前激活版本会拒绝删除."""
    current = read_current_version()
    if current == version:
        raise HTTPException(400, f"version {version} is currently active, activate another first")
    version_dir = VENDOR_DIR / version
    if not version_dir.is_dir():
        raise HTTPException(404, f"version {version} not installed")
    shutil.rmtree(version_dir)
    return {"status": "ok", "removed": version}


# ---------- Cleanup 旧平铺布局 + 误下的 safetensors 关联文件 ----------
LEGACY_KEEP = {"current.json"}  # 这些在 vendor 根目录是合法的
LEGACY_PROTECT_GGUF: set[str] = set()  # 平铺的 .gguf 也清 (子目录已有完整副本)


def _scan_legacy_files() -> list[dict[str, Any]]:
    """扫描 vendor/paddle-ocr/ 根目录, 列出可以清理的文件."""
    items: list[dict[str, Any]] = []
    if not VENDOR_DIR.exists():
        return items
    for p in sorted(VENDOR_DIR.iterdir()):
        if p.is_dir():
            continue  # 子目录 (含 {version}/) 是合法的, 不动
        if p.name in LEGACY_KEEP:
            continue  # current.json 是 active 标记, 不动
        items.append({
            "name": p.name,
            "size": p.stat().st_size,
            "reason": _classify_legacy(p),
        })
    return items


def _classify_legacy(p: Path) -> str:
    n = p.name
    if n.endswith("-GGUF.gguf") or n.endswith("-GGUF-mmproj.gguf"):
        return "legacy_flat_gguf"  # 旧平铺 .gguf, 子目录已有完整副本
    if n.endswith(".gguf"):
        return "gguf"  # 其他 gguf (mmproj 等)
    if n.endswith(".gguf") or n.endswith(".safetensors") or n.endswith(".bin"):
        return "model_weight"
    if n.endswith(".py") or n.endswith(".json") or n.endswith(".model") or n.endswith(".lock"):
        return "paddleocr_repo_file"  # 误下的 PaddleOCR 原版仓库文件
    return "unknown"


@app.get("/api/ocr/legacy-files")
async def list_legacy_files():
    """列出 vendor/paddle-ocr/ 根目录里可以清理的文件 (dry run)."""
    items = _scan_legacy_files()
    total_bytes = sum(x["size"] for x in items)
    return {
        "items": items,
        "count": len(items),
        "total_bytes": total_bytes,
        "total_mb": round(total_bytes / 1024 / 1024, 2),
    }


@app.post("/api/ocr/legacy-files/cleanup")
async def cleanup_legacy_files(confirm: bool = False):
    """删除 vendor/paddle-ocr/ 根目录的废文件. 需 confirm=true 才会真删.

    默认 dry run: 列出将删除的文件. 传 ?confirm=true 真正执行.
    """
    items = _scan_legacy_files()
    if not confirm:
        return {
            "dry_run": True,
            "items": items,
            "count": len(items),
            "total_mb": round(sum(x["size"] for x in items) / 1024 / 1024, 2),
            "hint": "POST /api/ocr/legacy-files/cleanup?confirm=true to actually delete",
        }
    deleted: list[dict[str, Any]] = []
    for it in items:
        path = VENDOR_DIR / it["name"]
        try:
            path.unlink()
            deleted.append(it)
        except OSError as e:
            deleted.append({**it, "error": str(e)})
    return {
        "dry_run": False,
        "deleted_count": len([d for d in deleted if "error" not in d]),
        "failed_count": len([d for d in deleted if "error" in d]),
        "deleted": deleted,
    }


@app.post("/ocr/parse", response_model=ParseResponse)
async def parse_document(file: UploadFile = File(...)):
    """Parse PDF document, return markdown per page."""
    if not file.filename or not file.filename.endswith(".pdf"):
        raise HTTPException(400, "Only PDF files are supported")

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    images = []
    try:
        images = pdf_to_images(tmp_path)
        if not images:
            raise HTTPException(500, "Failed to convert PDF to images")

        results = []
        for i, img_path in enumerate(images):
            text = await ocr_image(img_path)
            results.append(f"<!-- Page {i + 1} -->\n\n{text}")

        markdown = "\n\n---\n\n".join(results)
        return ParseResponse(markdown=markdown, page_count=len(images))

    except Exception as e:
        raise HTTPException(500, str(e))
    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass
        for img in images:
            try:
                img.unlink()
            except Exception:
                pass
        if images:
            try:
                images[0].parent.rmdir()
            except Exception:
                pass


@app.post("/ocr/recognize", response_model=RecognizeResponse)
async def recognize_image(image: UploadFile = File(...)):
    """Recognize text in a single image."""
    if not image.content_type or not image.content_type.startswith("image/"):
        raise HTTPException(400, "Only image files are supported")

    suffix = Path(image.filename or "image.png").suffix or ".png"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        content = await image.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        text = await ocr_image(Path(tmp_path))
        return RecognizeResponse(markdown=text)
    except Exception as e:
        raise HTTPException(500, str(e))
    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=APP_PORT, log_level="info")