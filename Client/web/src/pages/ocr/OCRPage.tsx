import { useState, useCallback, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Upload, FileText, Download, Copy, Check, Loader2, X, File } from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api/client';

interface ParseResult {
  markdown: string;
  fileName: string;
  timestamp: number;
  pageCount?: number;
}

export function OCRPage() {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [results, setResults] = useState<ParseResult[]>([]);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [selectedResultIndex, setSelectedResultIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const parseMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      const isImage = file.type.startsWith('image/');
      formData.append(isImage ? 'image' : 'file', file);
      const endpoint = isImage ? '/ocr/recognize' : '/ocr/parse';
      const response = await api.post<{ markdown: string; page_count?: number }>(
        endpoint,
        formData,
      );
      return response;
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
    },
  });

  const handleFileSelect = useCallback((file: File) => {
    const isPDF = file.type === 'application/pdf';
    const isImage = file.type.startsWith('image/');
    if (!isPDF && !isImage) {
      alert('请选择 PDF 或图片文件');
      return;
    }
    setPdfFile(file);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      dropRef.current?.classList.remove('border-[var(--color-accent)]');
      const file = e.dataTransfer.files[0];
      if (file) handleFileSelect(file);
    },
    [handleFileSelect],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dropRef.current?.classList.add('border-[var(--color-accent)]');
  }, []);

  const handleDragLeave = useCallback(() => {
    dropRef.current?.classList.remove('border-[var(--color-accent)]');
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
    const blob = new Blob([result.markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${result.fileName.replace('.pdf', '')}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleExportPDF = useCallback(async (result: ParseResult) => {
    const response = await api.post<{ pdf_url: string }>(
      '/ocr/export-pdf',
      { markdown: result.markdown, fileName: result.fileName },
    );
    if (response.pdf_url) {
      const a = document.createElement('a');
      a.href = response.pdf_url;
      a.download = `${result.fileName.replace('.pdf', '')}_parsed.pdf`;
      a.click();
    }
  }, []);

  const handleClear = useCallback(() => {
    setPdfFile(null);
    setResults([]);
    setSelectedResultIndex(null);
  }, []);

  const selectedResult = selectedResultIndex !== null ? results[selectedResultIndex] : null;

  return (
    <div className="studio-page mx-auto max-w-6xl space-y-6 p-6">
      {/* Header */}
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-stone-400">Document</p>
        <h2 className="mt-2 text-2xl font-black tracking-[-0.04em] text-[var(--color-text-primary)]">
          文档解析
        </h2>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
          使用 PaddleOCR-VL-1.6 本地解析 PDF 文档，导出为 Markdown 或 PDF
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left: Upload + History */}
        <div className="space-y-4 lg:col-span-1">
          {/* PDF Upload */}
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-glass)] p-4 backdrop-blur-xl">
            <h3 className="mb-3 text-sm font-semibold text-[var(--color-text-primary)]">上传 PDF</h3>
            <div
              ref={dropRef}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                'flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 transition-colors cursor-pointer',
                pdfFile
                  ? 'border-[var(--color-accent)]/30 bg-[var(--color-accent)]/5'
                  : 'border-[var(--color-border)] hover:border-[var(--color-accent)]/50',
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
                  <Upload size={40} className="mb-3 text-[var(--color-text-muted)] opacity-40" />
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
            disabled={!pdfFile || parseMutation.isPending}
            className={cn(
              'flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-semibold transition-all',
              pdfFile && !parseMutation.isPending
                ? 'bg-[var(--color-accent)] text-white hover:opacity-90'
                : 'bg-[var(--color-surface)] text-[var(--color-text-muted)] cursor-not-allowed',
            )}
          >
            {parseMutation.isPending ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                解析中...
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
                <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">解析历史</h3>
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
                      'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs transition-colors',
                      selectedResultIndex === index
                        ? 'bg-[var(--color-accent)]/10 text-[var(--color-accent)]'
                        : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]',
                    )}
                  >
                    <File size={12} />
                    <span className="truncate flex-1">{result.fileName}</span>
                    {result.pageCount && (
                      <span className="shrink-0 text-[10px] opacity-60">{result.pageCount}页</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Result Viewer */}
        <div className="lg:col-span-2">
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-glass)] p-4 backdrop-blur-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
                {selectedResult ? selectedResult.fileName : '解析结果'}
              </h3>
              {selectedResult && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleCopy(selectedResult.markdown, selectedResultIndex!)}
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
                解析失败: {(parseMutation.error as Error)?.message || '未知错误'}
              </div>
            )}

            {!selectedResult ? (
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
    </div>
  );
}
