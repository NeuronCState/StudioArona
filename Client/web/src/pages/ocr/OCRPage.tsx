import { useState, useCallback, useRef, useEffect, useTransition } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Upload,
  FileText,
  Download,
  Copy,
  Check,
  Loader2,
  X,
  File,
  RefreshCw,
  DownloadCloud,
} from "lucide-react";
import { Dialog } from "@javis/ui-kit";
import { cn } from "@/lib/utils";
import {
  ocrParsePdf,
  ocrRecognizeImage,
  ensureOcrReady,
  ocrCheckUpdate,
  ocrInstall,
  ocrInstallStatus,
  type OCRCheckUpdate,
  type OCRInstallStatus,
} from "@/lib/api/ocr";

interface ParseResult {
  markdown: string;
  fileName: string;
  timestamp: number;
  pageCount?: number;
}

export function OCRPage() {
  const [, startTransition] = useTransition();
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [results, setResults] = useState<ParseResult[]>([]);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [selectedResultIndex, setSelectedResultIndex] = useState<number | null>(
    null,
  );
  const [loadingMsg, setLoadingMsg] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  // 模型安装/升级状态
  const [updateInfo, setUpdateInfo] = useState<OCRCheckUpdate | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showInstallDialog, setShowInstallDialog] = useState(false);
  const [installJob, setInstallJob] = useState<OCRInstallStatus | null>(null);
  const [installError, setInstallError] = useState<string>("");
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 探测更新 (进页面 + 用户点按钮时调)
  const refreshUpdateInfo = useCallback(async (autoShowDialog: boolean) => {
    setIsRefreshing(true);
    try {
      const info = await ocrCheckUpdate();
      setUpdateInfo(info);
      if (autoShowDialog) {
        // 用户主动查: 不管什么状态都弹
        setShowInstallDialog(true);
        return;
      }
      // 自动探测: 仅未装 / 有新版 时弹
      if (!info.installed || info.needs_update) {
        setShowInstallDialog(true);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // 检查更新失败不要阻塞用户, 只在控制台报错
      // eslint-disable-next-line no-console
      console.warn("ocrCheckUpdate failed:", msg);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  // 页面 mount 时探测一次
  useEffect(() => {
    refreshUpdateInfo(false);
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [refreshUpdateInfo]);

  // 启动后台下载
  const startInstall = useCallback(
    async (version: string) => {
      setInstallError("");
      setInstallJob(null);
      try {
        const accepted = await ocrInstall(version);
        setInstallJob({
          job_id: accepted.job_id,
          version: accepted.version,
          status: accepted.status,
          started_at: Date.now() / 1000,
          finished_at: null,
          return_code: null,
          log_tail: "排队中 ...",
        });
        // 启动轮询
        if (pollTimerRef.current) clearInterval(pollTimerRef.current);
        pollTimerRef.current = setInterval(async () => {
          try {
            const status = await ocrInstallStatus(accepted.job_id);
            setInstallJob(status);
            if (status.status === "done" || status.status === "failed") {
              if (pollTimerRef.current) clearInterval(pollTimerRef.current);
              pollTimerRef.current = null;
              // 完成后刷新 updateInfo
              if (status.status === "done") {
                void refreshUpdateInfo(false);
              }
            }
          } catch (e) {
            // 单次轮询失败不打断, 等下次
            // eslint-disable-next-line no-console
            console.warn("install status poll failed:", e);
          }
        }, 2000);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setInstallError(msg);
      }
    },
    [refreshUpdateInfo],
  );

  const closeInstallDialog = useCallback(() => {
    // 还在下载时, 关闭 Dialog 不会取消下载 (后台继续, 轮询继续)
    setShowInstallDialog(false);
  }, []);

  const parseMutation = useMutation({
    mutationFn: async (file: File) => {
      const isImage = file.type.startsWith("image/");

      // 懒启动 OCR 引擎 (首次加载 ~30s)
      setLoadingMsg("启动 OCR 引擎 ...");
      await ensureOcrReady((p) => {
        setLoadingMsg(p.message);
      });

      setLoadingMsg("OCR 处理中 ...");
      const result = isImage
        ? await ocrRecognizeImage(file)
        : await ocrParsePdf(file);

      return result;
    },
    onSuccess: (data, variables) => {
      const result: ParseResult = {
        markdown: data.markdown,
        fileName: variables.name,
        timestamp: Date.now(),
        pageCount: data.page_count,
      };
      setResults((prev) => [result, ...prev]);
      setSelectedResultIndex(0);
      setLoadingMsg("");
    },
    onError: (err) => {
      setLoadingMsg("");
      const msg = err instanceof Error ? err.message : String(err);
      alert(`OCR 失败: ${msg}`);
    },
  });

  const handleFileSelect = useCallback((file: File) => {
    const isPDF = file.type === "application/pdf";
    const isImage = file.type.startsWith("image/");
    if (!isPDF && !isImage) {
      alert("请选择 PDF 或图片文件");
      return;
    }
    startTransition(() => setPdfFile(file));
  }, [startTransition]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      dropRef.current?.classList.remove("border-[var(--color-accent)]");
      const file = e.dataTransfer.files[0];
      if (file) handleFileSelect(file);
    },
    [handleFileSelect],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dropRef.current?.classList.add("border-[var(--color-accent)]");
  }, []);

  const handleDragLeave = useCallback(() => {
    dropRef.current?.classList.remove("border-[var(--color-accent)]");
  }, []);

  const handleParse = useCallback(() => {
    if (!pdfFile) return;
    parseMutation.mutate(pdfFile);
  }, [pdfFile, parseMutation]);

  const handleCopy = useCallback((text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  }, []);

  const handleExportMarkdown = useCallback((result: ParseResult) => {
    const blob = new Blob([result.markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${result.fileName.replace(".pdf", "")}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleExportPDF = useCallback((result: ParseResult) => {
    // 客户端 markdown → PDF (浏览器 print API, 不依赖后端)
    const win = window.open("", "_blank", "width=900,height=1200");
    if (!win) return;
    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${result.fileName}</title>
<style>
  body { font-family: -apple-system, sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; line-height: 1.6; color: #222; }
  h1, h2, h3 { color: #111; margin-top: 1.5em; }
  code { background: #f5f5f5; padding: 2px 6px; border-radius: 3px; font-size: 90%; }
  pre { background: #f5f5f5; padding: 12px; border-radius: 6px; overflow-x: auto; }
  pre code { background: none; padding: 0; }
  blockquote { border-left: 4px solid #ddd; margin: 1em 0; padding: 0 1em; color: #666; }
  hr { border: none; border-top: 1px solid #eee; margin: 2em 0; }
</style></head><body>
<pre>${result.markdown.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]!)}</pre>
</body></html>`;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 500);
  }, []);

  const handleClear = useCallback(() => {
    setPdfFile(null);
    setResults([]);
    setSelectedResultIndex(null);
  }, []);

  const selectedResult =
    selectedResultIndex !== null ? results[selectedResultIndex] : null;
  // 模型未装好时, 把上传/解析 UI 换成引导卡片, 避免点了上传才在解析时报错
  const notInstalled = !!updateInfo && !updateInfo.installed;

  return (
    <div className="studio-page @container mx-auto max-w-6xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-stone-400">
            Document
          </p>
          <h2 className="mt-2 text-2xl font-black tracking-[-0.04em] text-[var(--color-text-primary)]">
            文档解析
          </h2>
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
            使用{" "}
            {updateInfo?.current_version
              ? `PaddleOCR-VL-${updateInfo.current_version}`
              : "PaddleOCR-VL"}
            本地解析 PDF 文档，导出为 Markdown 或 PDF
          </p>
        </div>
        <button
          onClick={() => void refreshUpdateInfo(true)}
          disabled={isRefreshing}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] disabled:opacity-50"
          title="检查 OCR 模型更新"
        >
          {isRefreshing ? (
            <Loader2 size={12} className="animate-spin" />
          ) : updateInfo?.needs_update ? (
            <DownloadCloud size={12} className="text-[var(--color-accent)]" />
          ) : (
            <RefreshCw size={12} />
          )}
          {updateInfo?.needs_update
            ? `升级到 ${updateInfo.latest_version}`
            : updateInfo && !updateInfo.installed
              ? "安装 OCR"
              : "检查更新"}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 @5xl:grid-cols-3">
        {/* Left: Upload + History */}
        <div className="space-y-4 lg:col-span-1">
          {notInstalled ? (
            <NotInstalledCard
              latestVersion={updateInfo?.latest_version}
              isRefreshing={isRefreshing}
              onInstall={() => setShowInstallDialog(true)}
              onRetry={() => void refreshUpdateInfo(false)}
            />
          ) : (
            <>
              {/* PDF Upload */}
              <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-glass)] p-4 backdrop-blur-xl">
                <h3 className="mb-3 text-sm font-semibold text-[var(--color-text-primary)]">
                  上传 PDF
                </h3>
                <div
                  ref={dropRef}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    "flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 transition-colors cursor-pointer",
                    pdfFile
                      ? "border-[var(--color-accent)]/30 bg-[var(--color-accent)]/5"
                      : "border-[var(--color-border)] hover:border-[var(--color-accent)]/50",
                  )}
                >
                  {pdfFile ? (
                    <div className="flex w-full items-center gap-3">
                      <File size={32} className="shrink-0 text-red-500" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-[var(--color-text-primary)]">
                          {pdfFile.name}
                        </p>
                        <p className="text-xs text-[var(--color-text-muted)]">
                          {(pdfFile.size / 1024 / 1024).toFixed(1)} MB
                        </p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setPdfFile(null);
                        }}
                        className="rounded-full p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg)]"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <Upload
                        size={40}
                        className="mb-3 text-[var(--color-text-muted)] opacity-40"
                      />
                      <p className="text-sm text-[var(--color-text-secondary)]">
                        拖拽文件到此处
                      </p>
                      <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                        支持 PDF、JPG、PNG、WebP
                      </p>
                    </>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileSelect(file);
                  }}
                />
              </div>

              {/* Parse Button */}
              <button
                onClick={handleParse}
                disabled={!pdfFile || parseMutation.isPending || notInstalled}
                className={cn(
                  "flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-semibold transition-all",
                  pdfFile && !parseMutation.isPending
                    ? "bg-[var(--color-accent)] text-white hover:opacity-90"
                    : "bg-[var(--color-surface)] text-[var(--color-text-muted)] cursor-not-allowed",
                )}
              >
                {parseMutation.isPending ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    {loadingMsg || "解析中..."}
                  </>
                ) : (
                  <>
                    <FileText size={16} />
                    开始解析
                  </>
                )}
              </button>

              {/* History */}
              {results.length > 0 && (
                <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-glass)] p-4 backdrop-blur-xl">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
                      解析历史
                    </h3>
                    <button
                      onClick={handleClear}
                      className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
                    >
                      清空
                    </button>
                  </div>
                  <div className="space-y-2">
                    {results.map((result, index) => (
                      <button
                        key={result.timestamp}
                        onClick={() => setSelectedResultIndex(index)}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs transition-colors",
                          selectedResultIndex === index
                            ? "bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
                            : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]",
                        )}
                      >
                        <File size={12} />
                        <span className="truncate flex-1">
                          {result.fileName}
                        </span>
                        {result.pageCount && (
                          <span className="shrink-0 text-[10px] opacity-60">
                            {result.pageCount}页
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Right: Result Viewer */}
        <div className="lg:col-span-2">
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-glass)] p-4 backdrop-blur-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
                {selectedResult ? selectedResult.fileName : "解析结果"}
              </h3>
              {selectedResult && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() =>
                      handleCopy(selectedResult.markdown, selectedResultIndex!)
                    }
                    className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-2.5 py-1 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
                  >
                    {copiedIndex === selectedResultIndex ? (
                      <Check size={12} className="text-green-500" />
                    ) : (
                      <Copy size={12} />
                    )}
                    复制
                  </button>
                  <button
                    onClick={() => handleExportMarkdown(selectedResult)}
                    className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-2.5 py-1 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
                  >
                    <Download size={12} />
                    Markdown
                  </button>
                  <button
                    onClick={() => handleExportPDF(selectedResult)}
                    className="inline-flex items-center gap-1 rounded-lg bg-[var(--color-accent)] px-2.5 py-1 text-xs text-white hover:opacity-90"
                  >
                    <Download size={12} />
                    PDF
                  </button>
                </div>
              )}
            </div>

            {parseMutation.isError && (
              <div className="mb-4 rounded-xl bg-red-500/10 p-4 text-sm text-red-500">
                解析失败:{" "}
                {(parseMutation.error as Error)?.message || "未知错误"}
              </div>
            )}

            {notInstalled ? (
              <div className="flex flex-col items-center justify-center py-20 text-center text-[var(--color-text-muted)]">
                <FileText size={48} className="mb-4 opacity-20" />
                <p className="text-sm">请先安装 OCR 模型</p>
                <p className="mt-1 max-w-xs text-xs leading-relaxed">
                  安装完成后才能解析 PDF 和图片
                </p>
              </div>
            ) : !selectedResult ? (
              <div className="flex flex-col items-center justify-center py-20 text-[var(--color-text-muted)]">
                <FileText size={48} className="mb-4 opacity-20" />
                <p className="text-sm">上传 PDF 后开始解析</p>
              </div>
            ) : (
              <div className="max-h-[600px] overflow-auto rounded-xl bg-[var(--color-surface)] p-4">
                <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-[var(--color-text-primary)]">
                  {selectedResult.markdown}
                </pre>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 模型安装/升级 Dialog */}
      <Dialog
        open={showInstallDialog}
        onClose={closeInstallDialog}
        title={
          installJob && installJob.status === "running"
            ? `下载中 (${installJob.version}) ...`
            : installJob && installJob.status === "done"
              ? "下载完成"
              : installJob && installJob.status === "failed"
                ? "下载失败"
                : updateInfo?.error
                  ? "检查更新失败"
                  : !updateInfo?.installed
                    ? "OCR 模型未安装"
                    : updateInfo?.needs_update
                      ? `发现新版本: ${updateInfo.latest_version}`
                      : "OCR 模型已是最新"
        }
        description={
          !updateInfo
            ? "检查中 ..."
            : updateInfo.error
              ? updateInfo.error
              : !updateInfo.installed
                ? `下载 PaddleOCR-VL-${updateInfo.latest_version} GGUF 模型 (~1.7G, 5-30 分钟)`
                : updateInfo.needs_update
                  ? `当前 ${updateInfo.current_version} → ${updateInfo.latest_version} (≈1.7G)`
                  : `当前版本: ${updateInfo.current_version}`
        }
      >
        <InstallDialogBody
          updateInfo={updateInfo}
          installJob={installJob}
          installError={installError}
          isRefreshing={isRefreshing}
          onInstall={startInstall}
          onClose={closeInstallDialog}
          onRetry={() => void refreshUpdateInfo(true)}
        />
      </Dialog>
    </div>
  );
}

interface NotInstalledCardProps {
  latestVersion: string | null | undefined;
  isRefreshing: boolean;
  onInstall: () => void;
  onRetry: () => void;
}

function NotInstalledCard({
  latestVersion,
  isRefreshing,
  onInstall,
  onRetry,
}: NotInstalledCardProps) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-glass)] p-6 backdrop-blur-xl">
      <div className="flex flex-col items-center text-center">
        <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-accent)]/10">
          <DownloadCloud size={22} className="text-[var(--color-accent)]" />
        </div>
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
          OCR 模型未安装
        </h3>
        <p className="mt-2 text-xs leading-relaxed text-[var(--color-text-secondary)]">
          首次使用需下载 PaddleOCR-VL
          {latestVersion ? `-${latestVersion}` : ""}
          <br />
          模型 (~1.7 GB, 约 5–30 分钟)
        </p>
        <button
          onClick={onInstall}
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-4 py-2 text-xs font-medium text-white hover:opacity-90"
        >
          <DownloadCloud size={12} />
          立即下载
        </button>
        <button
          onClick={onRetry}
          disabled={isRefreshing}
          className="mt-3 text-[11px] text-[var(--color-text-muted)] underline-offset-2 hover:text-[var(--color-text-secondary)] hover:underline disabled:opacity-50"
        >
          {isRefreshing ? "检查中 ..." : "已下载? 重新检查"}
        </button>
      </div>
    </div>
  );
}

interface InstallDialogBodyProps {
  updateInfo: OCRCheckUpdate | null;
  installJob: OCRInstallStatus | null;
  installError: string;
  isRefreshing: boolean;
  onInstall: (version: string) => void;
  onClose: () => void;
  onRetry: () => void;
}

function InstallDialogBody({
  updateInfo,
  installJob,
  installError,
  isRefreshing,
  onInstall,
  onClose,
  onRetry,
}: InstallDialogBodyProps) {
  // 下载中: 显示日志 + 取消按钮
  if (
    installJob &&
    (installJob.status === "pending" || installJob.status === "running")
  ) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
          <Loader2 size={14} className="animate-spin" />
          {installJob.status === "pending"
            ? "排队中 ..."
            : "正在下载并校验 (~5-30 分钟)"}
        </div>
        <pre className="max-h-48 overflow-auto rounded-lg bg-[var(--color-bg)] p-3 font-mono text-[11px] text-[var(--color-text-muted)]">
          {installJob.log_tail || ""}
        </pre>
        <p className="text-xs text-[var(--color-text-muted)]">
          关闭此对话框不会取消下载, 后台继续. 下载完成后下次打开 OCR
          页会自动激活.
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
          >
            隐藏 (后台继续)
          </button>
        </div>
      </div>
    );
  }

  // 下载完成
  if (installJob && installJob.status === "done") {
    return (
      <div className="space-y-3">
        <div className="rounded-lg bg-green-500/10 p-3 text-sm text-green-600 dark:text-green-400">
          ✓ {installJob.version} 已激活, 可立即使用.
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-xs text-white hover:opacity-90"
          >
            开始使用
          </button>
        </div>
      </div>
    );
  }

  // 下载失败
  if (installJob && installJob.status === "failed") {
    return (
      <div className="space-y-3">
        <div className="rounded-lg bg-red-500/10 p-3 text-sm text-red-500">
          ✗ 下载失败 (return code: {installJob.return_code ?? "?"})
          <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap font-mono text-[11px] text-[var(--color-text-muted)]">
            {installJob.log_tail}
          </pre>
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
          >
            关闭
          </button>
        </div>
      </div>
    );
  }

  // HF 失败: 显示错误 + 重试按钮
  if (updateInfo?.error) {
    return (
      <div className="space-y-3">
        <div className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-600 dark:text-amber-400">
          ⚠ 无法连到 HuggingFace
          <div className="mt-1 text-xs text-[var(--color-text-muted)]">
            {updateInfo.error}
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
          >
            关闭
          </button>
          <button
            onClick={onRetry}
            disabled={isRefreshing}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {isRefreshing ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <RefreshCw size={12} />
            )}
            重试
          </button>
        </div>
      </div>
    );
  }

  // 真正"已是最新": 显示确认 + 可选重新下载 (应对模型文件损坏场景)
  if (updateInfo?.installed && !updateInfo.needs_update) {
    return (
      <div className="space-y-3">
        <div className="rounded-lg bg-green-500/10 p-3 text-sm text-green-600 dark:text-green-400">
          ✓ PaddleOCR-VL-{updateInfo.current_version} 已是最新
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
          >
            关闭
          </button>
          <button
            onClick={() => onInstall(updateInfo.current_version!)}
            disabled={isRefreshing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] disabled:opacity-50"
          >
            <DownloadCloud size={12} />
            重新下载
          </button>
        </div>
      </div>
    );
  }

  // 初始状态: 显示安装/升级按钮
  const targetVersion = updateInfo?.latest_version;
  if (!targetVersion) {
    return (
      <div className="space-y-3 text-sm text-[var(--color-text-muted)]">
        无法获取最新版本信息.
        {installError && (
          <div className="text-red-500">错误: {installError}</div>
        )}
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
          >
            关闭
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-1.5 text-sm text-[var(--color-text-secondary)]">
        {updateInfo?.installed && (
          <li>
            当前:{" "}
            <span className="font-mono text-[var(--color-text-primary)]">
              {updateInfo.current_version}
            </span>
          </li>
        )}
        <li>
          最新:{" "}
          <span className="font-mono text-[var(--color-text-primary)]">
            {targetVersion}
          </span>
        </li>
        <li>
          大小:{" "}
          <span className="font-mono text-[var(--color-text-primary)]">
            ~1.7 GB
          </span>{" "}
          (主模型 893 MB + 视觉投影 841 MB)
        </li>
        <li>
          来源:{" "}
          <span className="font-mono text-[11px] text-[var(--color-text-muted)]">
            huggingface.co/PaddlePaddle/PaddleOCR-VL-{targetVersion}-GGUF
          </span>
        </li>
        {updateInfo?.error && (
          <li className="text-amber-500">
            ⚠ 无法连到 HuggingFace: {updateInfo.error}
          </li>
        )}
      </ul>
      {installError && (
        <div className="rounded-lg bg-red-500/10 p-2 text-xs text-red-500">
          {installError}
        </div>
      )}
      <div className="flex justify-end gap-2 pt-1">
        <button
          onClick={onClose}
          className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
        >
          {updateInfo?.installed ? "稍后" : "取消"}
        </button>
        <button
          onClick={() => onInstall(targetVersion)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
        >
          <DownloadCloud size={12} />
          {updateInfo?.installed
            ? `升级到 ${targetVersion}`
            : `下载 ${targetVersion}`}
        </button>
      </div>
    </div>
  );
}
