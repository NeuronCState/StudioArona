import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { FolderOpen, Database, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { needsMigration, migrateFromIdb, backendType } from '@/lib/storage';
import { Button } from '@javis/ui-kit';

/**
 * StorageMigrationBanner — Tauri 桌面端首次启动时, 检测到 IDB 已有数据但 fs 还没数据时
 * 弹一个一次性 banner 问用户是否迁移
 *
 * 设计:
 * - 仅在 Tauri 桌面 + 有 IDB 旧数据 + fs 空 时显示
 * - 用户选 "迁移" / "跳过" / 关闭
 * - 选过的偏好 localStorage 记录 (一次性, 不再弹)
 */
const MIGRATION_DISMISSED_KEY = 'studio-arona-migration-dismissed';

export function StorageMigrationBanner() {
  const [show, setShow] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (backendType() !== 'tauri-fs') return; // 仅 Tauri 桌面

    // 已选过迁移/跳过, 不再弹
    if (localStorage.getItem(MIGRATION_DISMISSED_KEY) === '1') return;

    needsMigration().then(needs => {
      if (needs) setShow(true);
    });
  }, []);

  const handleMigrate = async () => {
    setMigrating(true);
    try {
      const { migrated } = await migrateFromIdb();
      setResult(`已迁移 ${migrated} 条数据到 ~/Documents/studioarona/`);
      queryClient.invalidateQueries();
    } catch (e) {
      setResult(`迁移失败: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setMigrating(false);
      localStorage.setItem(MIGRATION_DISMISSED_KEY, '1');
      setTimeout(() => setShow(false), 3000);
    }
  };

  const handleSkip = () => {
    localStorage.setItem(MIGRATION_DISMISSED_KEY, '1');
    setShow(false);
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.3 }}
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2"
        >
          <div className="flex max-w-lg items-start gap-3 rounded-2xl border border-stone-200 bg-white p-4 shadow-lg dark:border-stone-700 dark:bg-stone-900">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-900/30">
              <Database size={20} className="text-amber-600 dark:text-amber-400" />
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-stone-800 dark:text-stone-200">
                  迁移数据到 ~/Documents/studioarona/
                </p>
                <button
                  type="button"
                  onClick={handleSkip}
                  className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-300"
                  aria-label="关闭"
                >
                  <X size={16} />
                </button>
              </div>
              <p className="text-xs text-stone-600 dark:text-stone-400">
                {result ?? (
                  <>
                    检测到浏览器 IDB 里有旧数据, 桌面版默认写到系统文件夹。
                    <br />
                    迁移后, 卸载应用不会丢数据, Finder 也能直接打开。
                  </>
                )}
              </p>
              <div className="flex gap-2 pt-1">
                <Button
                  size="sm"
                  variant="primary"
                  onClick={handleMigrate}
                  disabled={migrating}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <FolderOpen size={14} />
                    {migrating ? '迁移中...' : '迁移到 ~/Documents/'}
                  </span>
                </Button>
                <Button size="sm" variant="ghost" onClick={handleSkip}>
                  跳过
                </Button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
