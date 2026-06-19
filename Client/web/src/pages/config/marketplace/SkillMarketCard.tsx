import { useState } from "react";
import { Download, ExternalLink, Star, Loader2, Trash2 } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { motion as m } from "@/lib/motion";

interface MarketSkill {
  slug: string;
  name: string;
  description: string;
  description_zh: string;
  source: string;
  source_url: string;
  detail_url?: string;
  author: string;
  stars: number;
  tags: string[];
  category: string;
  installed?: boolean;
}

const sourceColors: Record<string, string> = {
  skillsmp: "bg-blue-500/10 text-blue-500",
  skillhub: "bg-green-500/10 text-green-500",
  github: "bg-gray-500/10 text-gray-500",
};

interface SkillMarketCardProps {
  skill: MarketSkill;
  onInstall: (skill: MarketSkill) => void;
  onUninstall: (skill: MarketSkill) => void;
  isInstalling?: boolean;
}

export function SkillMarketCard({
  skill,
  onInstall,
  onUninstall,
  isInstalling,
}: SkillMarketCardProps) {
  const displayName = skill.description_zh || skill.description;
  const [expanded, setExpanded] = useState(false);

  // 详情页 URL — 优先 detail_url (skillsmp 详情), 退到 source_url (github 源码)
  const detailUrl = skill.detail_url || skill.source_url;
  const detailLabel =
    skill.source === "skillsmp" ? "查看 skillsmp 详情" : "查看源码";

  return (
    <motion.div
      whileHover={{ y: -2, scale: 1.005 }}
      transition={{ duration: m.duration.base / 1000, ease: m.easing.out }}
      className="group rounded-[24px] border border-[var(--color-border)] bg-[var(--color-surface-glass)] p-5 shadow-[var(--shadow-1)] backdrop-blur-xl"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold text-[var(--color-text-primary)] truncate">
            {skill.name}
          </h3>
          {skill.author && (
            <p className="mt-1 text-xs text-[var(--color-text-muted)] truncate">
              by {skill.author}
            </p>
          )}
        </div>
        <span
          className={cn(
            "shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-medium",
            sourceColors[skill.source] || "bg-gray-500/10 text-gray-500",
          )}
        >
          {skill.source}
        </span>
      </div>

      {/* Description */}
      <p
        className={cn(
          "mt-3 text-xs leading-relaxed text-[var(--color-text-secondary)]",
          expanded ? "" : "line-clamp-3",
        )}
      >
        {displayName}
      </p>
      {displayName && displayName.length > 150 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-1 text-xs text-[var(--color-accent)] hover:underline"
        >
          {expanded ? "收起" : "展开"}
        </button>
      )}

      {/* Tags */}
      {skill.tags && skill.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {skill.tags.slice(0, 5).map((tag) => (
            <span
              key={tag}
              className="rounded bg-[var(--color-accent-soft)] px-1.5 py-0.5 text-[10px] text-[var(--color-accent)]"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="mt-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 text-xs text-[var(--color-text-muted)]">
          {skill.stars > 0 && (
            <span className="inline-flex items-center gap-1">
              <Star size={10} className="fill-current" />
              {skill.stars}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {/* 详情页 (新标签页) — 跳 skillsmp 详情 或 github 源码 */}
          {detailUrl && (
            <a
              href={detailUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-bg)] hover:text-[var(--color-text-primary)]"
              title={detailLabel}
            >
              <ExternalLink size={12} />
            </a>
          )}

          {/* 安装 */}
          <button
            onClick={() =>
              skill.installed ? onUninstall(skill) : onInstall(skill)
            }
            disabled={isInstalling}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              skill.installed
                ? "bg-red-500/10 text-red-500 hover:bg-red-500/15"
                : "bg-[var(--color-accent)] text-white hover:opacity-90",
            )}
          >
            {isInstalling ? (
              <Loader2 size={12} className="animate-spin" />
            ) : skill.installed ? (
              <Trash2 size={12} />
            ) : (
              <Download size={12} />
            )}
            {skill.installed ? "卸载" : "安装"}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
