/**
 * OCR API 客户端 — 按需启动, 双模式 (桌面 Tauri / Web 浏览器)
 *
 * - 桌面 (Tauri): invoke Tauri command → Rust 直接 spawn 子进程 (llama-server + fastapi)
 *   - 模型 1.7G 不进 boot, 用户点 OCR 按钮才加载 (懒加载)
 *   - 空闲 5 分钟自动 kill (释放显存/内存)
 *
 * - 浏览器 (Web): 直接 fetch localhost:8083 → 假设用户已启 uvicorn
 *   - dev 启动: pnpm dev:ocr (独立命令)
 */
import { isTauri } from '../storage/platform';

interface OCRResult {
  markdown: string;
  page_count?: number;
}

interface OCRProgress {
  phase: 'loading' | 'ready' | 'starting' | 'ocr';
  message: string;
  load_secs_estimate?: number;
}

/**
 * 确保 OCR 服务运行 (懒启动)
 * - 桌面: invoke Tauri command `ocr_ensure`
 * - Web: ping localhost:8083, 不在就报错 (用户手动启)
 */
export async function ensureOcrReady(onProgress?: (p: OCRProgress) => void): Promise<void> {
  if (isTauri()) {
    onProgress?.({ phase: 'starting', message: '启动 OCR 引擎 ...' });
    const { invoke } = await import('@tauri-apps/api/core');
    const result = await invoke<{ status: string; load_secs_estimate?: number }>('ocr_ensure');
    if (result.load_secs_estimate) {
      onProgress?.({
        phase: 'loading',
        message: `加载模型 (~${result.load_secs_estimate}s, 首次加载较慢) ...`,
        load_secs_estimate: result.load_secs_estimate,
      });
    }
    onProgress?.({ phase: 'ready', message: 'OCR 就绪' });
    return;
  }

  // Web 模式: 检查端口
  onProgress?.({ phase: 'starting', message: '检查 OCR 服务 ...' });
  try {
    const resp = await fetch('http://127.0.0.1:8083/health', { signal: AbortSignal.timeout(3000) });
    if (!resp.ok) throw new Error('OCR service not healthy');
    onProgress?.({ phase: 'ready', message: 'OCR 就绪' });
  } catch {
    throw new Error(
      'OCR 服务未启动。Web 模式请运行: cd StudioArona && pnpm dev:ocr\n' +
        '桌面模式会自动启动 OCR 引擎。',
    );
  }
}

/**
 * OCR 健康检查 (无副作用)
 */
export async function ocrHealth(): Promise<{ running: boolean; details?: unknown }> {
  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const r = await invoke<{ llama_running?: boolean }>('ocr_health');
      return { running: !!r.llama_running, details: r };
    } catch {
      return { running: false };
    }
  }
  try {
    const r = await fetch('http://127.0.0.1:8083/health');
    const d = await r.json();
    return { running: r.ok, details: d };
  } catch {
    return { running: false };
  }
}

/**
 * 主动 kill OCR 进程 (释放显存)
 */
export async function ocrIdleKill(): Promise<void> {
  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('ocr_idle_kill');
    } catch {
      /* ignore */
    }
  }
}

/**
 * PDF → markdown
 */
export async function ocrParsePdf(file: File): Promise<OCRResult> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    // Tauri 命令读本地路径 — 把 File 写到临时文件再传路径
    // 但浏览器 File API 在 Tauri webview 里只能拿 File 对象, 不能直接拿真实文件系统路径
    // 解法: 用 Tauri fs plugin 写临时文件, 或转 base64 给命令
    const bytes = new Uint8Array(await file.arrayBuffer());
    // 直接用 base64 方式调 invoke (Tauri v2 支持 typed args)
    // 简化: 让 Rust 端只接受 file_path, 前端把 File 通过 Tauri dialog plugin 拿 path
    // 当前实现: 用 Rust 读 file_path, 前端需要先写到临时文件
    // 我们用 base64 → Rust 写临时文件
    const b64 = btoa(String.fromCharCode(...bytes));
    const result = await invoke<OCRResult>('ocr_parse_b64', {
      fileName: file.name,
      base64: b64,
    });
    return result;
  }

  // Web 模式
  const form = new FormData();
  form.append('file', file);
  const resp = await fetch('http://127.0.0.1:8083/ocr/parse', {
    method: 'POST',
    body: form,
  });
  if (!resp.ok) throw new Error(`OCR failed: ${resp.status}`);
  return resp.json();
}

/**
 * Image → markdown
 */
export async function ocrRecognizeImage(file: File): Promise<OCRResult> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    const bytes = new Uint8Array(await file.arrayBuffer());
    const b64 = btoa(String.fromCharCode(...bytes));
    const result = await invoke<OCRResult>('ocr_recognize_b64', {
      fileName: file.name,
      base64: b64,
    });
    return result;
  }

  const form = new FormData();
  form.append('image', file);
  const resp = await fetch('http://127.0.0.1:8083/ocr/recognize', {
    method: 'POST',
    body: form,
  });
  if (!resp.ok) throw new Error(`OCR failed: ${resp.status}`);
  return resp.json();
}