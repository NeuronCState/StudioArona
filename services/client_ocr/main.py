"""Client-side OCR service — PaddleOCR-VL-1.6 via llama.cpp.

桌面应用按需启动:
  - Tauri 启动时不调 (模型 1.7G 不进 boot)
  - 用户进 OCR 页面 → 前端调 Tauri command `ensure_ocr()` → Rust spawn llama-server (端口 8082)
  - 空闲 5min 自动 kill (释放内存/显存)
  - Web 模式 (无 Tauri): 直接 python -m uvicorn, 端口 8083

依赖 (与 SonettoHere 共享 venv):
  - fastapi
  - httpx
  - pillow
  - pyobjc-framework-Quartz (macOS PDF→image)
"""
from __future__ import annotations

import base64
import os
import platform
import subprocess
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ---------- 路径 (Client/ 为 cwd) ----------
VENDOR_DIR = Path(__file__).resolve().parent.parent.parent / "vendor" / "paddle-ocr"
LLAMA_CPP_DIR = Path(__file__).resolve().parent.parent.parent / "vendor" / "llama.cpp"

LLAMA_PORT = int(os.environ.get("OCR_LLAMA_PORT", "8082"))
APP_PORT = int(os.environ.get("OCR_PORT", "8083"))


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
    model = VENDOR_DIR / "PaddleOCR-VL-1.6-GGUF.gguf"
    mmproj = VENDOR_DIR / "PaddleOCR-VL-1.6-GGUF-mmproj.gguf"
    if not model.exists():
        raise RuntimeError(f"Model not found at {model}")
    if not mmproj.exists():
        raise RuntimeError(f"mmproj not found at {mmproj}")
    return model, mmproj


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
    return {
        "status": "ok",
        "llama_running": llama_ok,
        "model": "PaddleOCR-VL-1.6",
        "vendor": str(VENDOR_DIR),
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