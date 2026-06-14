/**
 * 通用确认弹窗 — 危险操作的二次确认
 *
 * 用法:
 *   <ConfirmDialog
 *     open={showConfirm}
 *     title="删除日程?"
 *     description="「测试编辑」将被永久删除, 无法恢复。"
 *     confirmLabel="删除"
 *     destructive
 *     onConfirm={handleDelete}
 *     onClose={() => setShowConfirm(false)}
 *   />
 */
import { Dialog } from '@javis/ui-kit';
import { motion } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 危险操作 — 按钮用红底 */
  destructive?: boolean;
  /** 确认按钮 loading 状态 */
  loading?: boolean;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = '确认',
  cancelLabel = '取消',
  destructive = false,
  loading = false,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} title={title} description={description}>
      <div className="flex flex-col gap-4">
        {destructive && (
          <motion.div
            initial={{ scale: 0, rotate: -45 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 22, delay: 0.05 }}
            className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50 dark:bg-red-500/10"
          >
            <AlertTriangle size={22} className="text-red-600 dark:text-red-400" />
          </motion.div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50 disabled:opacity-50 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={
              destructive
                ? 'rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-500 disabled:opacity-50'
                : 'rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-500 disabled:opacity-50'
            }
          >
            {loading ? '处理中...' : confirmLabel}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
