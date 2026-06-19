import { ServerOff } from "lucide-react";
import { useConnectionStore } from "@/stores/connection";
import { useT } from "@/lib/i18n";

interface StudioServiceOfflineProps {
  /** 哪个服务: 'vms' | 'nas' | 'ha' — 决定副标题文案 */
  service: "vms" | "nas" | "ha";
  /** 重试回调 (点了重连, server 重启后再次 query) */
  onRetry?: () => void;
}

const SERVICE_KEY: Record<StudioServiceOfflineProps["service"], string> = {
  vms: "studio.serviceLabel.vms",
  nas: "studio.serviceLabel.nas",
  ha: "studio.serviceLabel.ha",
};

/**
 * 工作室服务离线占位 — 用于 VMS / NAS / HA 页面 + 磁贴
 *
 * 设计原则 (跟 v3 "本地优先 + 离线感知" 一致):
 * - 离线时**明确**告诉用户"未连接", 不让用户对空白或错误堆栈困惑
 * - 不提供"重试"按钮 (server 没起, 重试无意义) — 改成"如何连接"提示
 * - 在线时正常渲染数据
 */
export function StudioServiceOffline({
  service,
  onRetry,
}: StudioServiceOfflineProps) {
  const t = useT();
  const effectiveMode = useConnectionStore((s) => s.effectiveMode());
  if (effectiveMode === "online") return null;

  const label = t(SERVICE_KEY[service]);
  // 命令本身不翻译 (路径 + 命令是原文), 只翻译步骤标签
  const step1Cmd = "cd Server/center && cargo run";
  const step2Cmd =
    "docker compose -f Server/infra/compose/docker-compose.yml up -d";

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-stone-100 dark:bg-stone-800">
        <ServerOff size={32} className="text-stone-400 dark:text-stone-500" />
      </div>
      <div className="space-y-1">
        <p className="text-base font-medium text-stone-700 dark:text-stone-300">
          {t("studio.offline.title")}
        </p>
        <p className="text-sm text-stone-500 dark:text-stone-400">
          {t("studio.offline.serviceHint", { label })}
        </p>
      </div>
      <div className="mt-2 max-w-sm space-y-1 text-left text-xs text-stone-400 dark:text-stone-500">
        <p>{t("studio.offline.steps")}</p>
        <ol className="list-decimal space-y-0.5 pl-4">
          <li>
            {t("studio.offline.step1Label")}{" "}
            <code className="rounded bg-stone-100 px-1 dark:bg-stone-800">
              {step1Cmd}
            </code>
          </li>
          <li>
            {t("studio.offline.step2Label")}{" "}
            <code className="rounded bg-stone-100 px-1 dark:bg-stone-800">
              {step2Cmd}
            </code>
          </li>
          <li>{t("studio.offline.step3")}</li>
        </ol>
      </div>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 inline-flex items-center gap-2 rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700"
        >
          {t("studio.offline.retry")}
        </button>
      ) : null}
    </div>
  );
}
