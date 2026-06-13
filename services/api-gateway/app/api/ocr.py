"""OCR API endpoint using PaddleOCR-VL-1.6 via llama.cpp with GPU acceleration."""
from __future__ import annotations

import base64
import json
import os
import platform
import subprocess
import tempfile
from pathlib import Path

import httpx
from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel

router = APIRouter(prefix="/ocr", tags=["ocr"])

VENDOR_DIR = Path(__file__).resolve().parents[4] / "vendor" / "paddle-ocr"
LLAMA_CPP_DIR = Path(__file__).resolve().parents[4] / "vendor" / "llama.cpp"

# Server state
_server_process = None
_server_port = 8081


def get_platform() -> str:
    """Get platform identifier for llama.cpp binary selection."""
    system = platform.system().lower()
    machine = platform.machine().lower()

    if system == "darwin" and machine == "arm64":
        return "darwin-arm64"
    elif system == "linux" and machine == "x86_64":
        return "linux-x64"
    elif system == "windows" and machine == "x86_64":
        return "windows-x64"
    else:
        raise RuntimeError(f"Unsupported platform: {system}/{machine}")


def get_llama_server_path() -> Path:
    """Get platform-specific llama-server path."""
    plat = get_platform()
    server_path = LLAMA_CPP_DIR / plat / "llama-server"
    if not server_path.exists():
        server_path = LLAMA_CPP_DIR / plat / "llama-server.exe"
    if not server_path.exists():
        raise RuntimeError(f"llama-server not found at {server_path}")
    return server_path


def get_model_path() -> Path:
    """Get GGUF model path."""
    model_path = VENDOR_DIR / "PaddleOCR-VL-1.6-GGUF.gguf"
    if not model_path.exists():
        raise RuntimeError(f"Model not found at {model_path}")
    return model_path


def get_mmproj_path() -> Path:
    """Get multimodal projector path."""
    mmproj_path = VENDOR_DIR / "PaddleOCR-VL-1.6-GGUF-mmproj.gguf"
    if not mmproj_path.exists():
        raise RuntimeError(f"Multimodal projector not found at {mmproj_path}")
    return mmproj_path


async def ensure_server_running() -> None:
    """Ensure llama-server is running with the model."""
    global _server_process

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"http://127.0.0.1:{_server_port}/health", timeout=2)
            if resp.status_code == 200:
                return
    except Exception:
        pass

    # Start server
    server_path = get_llama_server_path()
    model_path = get_model_path()
    mmproj_path = get_mmproj_path()

    cmd = [
        str(server_path),
        "-m", str(model_path),
        "--mmproj", str(mmproj_path),
        "--port", str(_server_port),
        "--host", "127.0.0.1",
        "-ngl", "99",  # Offload all layers to GPU
    ]

    _server_process = subprocess.Popen(
        cmd,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    # Wait for server to be ready
    import asyncio
    for _ in range(30):
        await asyncio.sleep(1)
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(f"http://127.0.0.1:{_server_port}/health", timeout=2)
                if resp.status_code == 200:
                    return
        except Exception:
            pass

    raise RuntimeError("Failed to start llama-server")


def pdf_to_images(pdf_path: str) -> list[Path]:
    """Convert PDF pages to PNG images using macOS sips or fallback."""
    output_dir = Path(tempfile.mkdtemp())
    output_pattern = output_dir / "page_%d.png"

    if platform.system() == "Darwin":
        # Use sips on macOS
        subprocess.run(
            ["sips", "-s", "format", "png", pdf_path, "--out", str(output_pattern)],
            check=True,
            capture_output=True,
        )
        # sips doesn't support multi-page, use a different approach
        # Convert each page using Quartz (via Python)
        try:
            import Quartz
            from CoreFoundation import CFURLCreateFromFileSystemRepresentation

            pdf_url = Quartz.CFURLCreateFromFileSystemRepresentation(
                None, pdf_path.encode(), len(pdf_path), False
            )
            pdf_doc = Quartz.CGPDFDocumentCreateWithURL(pdf_url)
            num_pages = Quartz.CGPDFDocumentGetNumberOfPages(pdf_doc)

            pages = []
            for i in range(num_pages):
                page = Quartz.CGPDFDocumentGetPage(pdf_doc, i + 1)
                rect = Quartz.CGPDFPageGetBoxRect(page, Quartz.kCGPDFMediaBox)

                # Create bitmap context
                scale = 2  # 2x resolution
                width = int(rect.size.width * scale)
                height = int(rect.size.height * scale)

                cs = Quartz.CGColorSpaceCreateDeviceRGB()
                context = Quartz.CGBitmapContextCreate(
                    None, width, height, 8, width * 4, cs,
                    Quartz.kCGImageAlphaPremultipliedLast
                )

                # Fill white background
                Quartz.CGContextSetRGBFillColor(context, 1, 1, 1, 1)
                Quartz.CGContextFillRect(context, Quartz.CGRectMake(0, 0, width, height))

                # Draw PDF page
                Quartz.CGContextScaleCTM(context, scale, scale)
                Quartz.CGContextDrawPDFPage(context, page)

                # Save as PNG
                image = Quartz.CGBitmapContextCreateImage(context)
                page_path = output_dir / f"page_{i + 1}.png"
                url = Quartz.CFURLCreateFromFileSystemRepresentation(
                    None, str(page_path).encode(), len(str(page_path)), False
                )
                dest = Quartz.CGImageDestinationCreateWithURL(url, "public.png", 1, None)
                Quartz.CGImageDestinationAddImage(dest, image, None)
                Quartz.CGImageDestinationFinalize(dest)

                pages.append(page_path)

            return pages
        except ImportError:
            # Fallback: use pdftoppm if available
            try:
                subprocess.run(
                    ["pdftoppm", "-png", "-r", "200", pdf_path, str(output_dir / "page")],
                    check=True,
                    capture_output=True,
                )
                return sorted(output_dir.glob("page-*.png"))
            except (subprocess.CalledProcessError, FileNotFoundError):
                raise RuntimeError("Cannot convert PDF to images. Install poppler or use macOS Quartz.")
    else:
        # Linux: use pdftoppm
        subprocess.run(
            ["pdftoppm", "-png", "-r", "200", pdf_path, str(output_dir / "page")],
            check=True,
            capture_output=True,
        )
        return sorted(output_dir.glob("page-*.png"))


async def ocr_image(image_path: Path) -> str:
    """Run OCR on a single image via llama.cpp API."""
    await ensure_server_running()

    # Read and encode image
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
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:{mime};base64,{image_data}"},
                    },
                    {"type": "text", "text": "OCR:"},
                ],
            }
        ],
        "max_tokens": 4096,
    }

    async with httpx.AsyncClient(timeout=300) as client:
        resp = await client.post(
            f"http://127.0.0.1:{_server_port}/v1/chat/completions",
            json=payload,
        )
        if resp.status_code != 200:
            raise RuntimeError(f"OCR failed: {resp.text}")

        data = resp.json()
        return data["choices"][0]["message"]["content"]


class ParseResponse(BaseModel):
    markdown: str
    page_count: int


class RecognizeResponse(BaseModel):
    markdown: str


@router.post("/parse", response_model=ParseResponse)
async def parse_document(file: UploadFile = File(...)):
    """Parse a PDF document using PaddleOCR-VL-1.6 with GPU acceleration."""
    if not file.filename or not file.filename.endswith(".pdf"):
        raise HTTPException(400, "Only PDF files are supported")

    # Save uploaded file
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        # Convert PDF to images
        images = pdf_to_images(tmp_path)
        if not images:
            raise HTTPException(500, "Failed to convert PDF to images")

        # OCR each page
        results = []
        for i, img_path in enumerate(images):
            text = await ocr_image(img_path)
            results.append(f"<!-- Page {i + 1} -->\n\n{text}")

        markdown = "\n\n---\n\n".join(results)
        return ParseResponse(markdown=markdown, page_count=len(images))

    except Exception as e:
        raise HTTPException(500, str(e))
    finally:
        os.unlink(tmp_path)
        # Cleanup temp images
        for img in images:
            if img.exists():
                img.unlink()
        if images:
            images[0].parent.rmdir()


@router.post("/recognize", response_model=RecognizeResponse)
async def recognize_image(image: UploadFile = File(...)):
    """Recognize text in an image using PaddleOCR-VL-1.6 with GPU acceleration."""
    if not image.content_type or not image.content_type.startswith("image/"):
        raise HTTPException(400, "Only image files are supported")

    # Save uploaded file
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
        os.unlink(tmp_path)
