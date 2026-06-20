import { useState, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Sparkles,
  RefreshCw,
  Flame,
  FolderTree,
  Trophy,
  CalendarDays,
} from "lucide-react";
import { useLocalResource } from "@/lib/storage/useLocalResource";
import { Skeleton, EmptyState } from "@javis/ui-kit";
import { useAuthStore } from "@/stores/auth";
import {
  getMarketCategories,
  getMarketTrending,
  getMarketInstalled,
  searchMarketSkills,
  type SearchOptions,
} from "./marketplace-service";
import type {
  CategoryEntry,
  MarketSkill,
  SearchResponse,
} from "./marketplace-catalog";
import { CategoryTabs } from "./CategoryTabs";
import { SkillMarketCard } from "./SkillMarketCard";
import { StaggerList, StaggerItem } from "@/components/motion";
import { motion as m } from "@/lib/motion";
import { cn } from "@/lib/utils";

/** LocalMarketSkill — install 后存到 IDB 的形态, 加 id (useLocalResource 泛型约束要) */
interface LocalMarketSkill extends MarketSkill {
  id: string;
}

/**
 * client-side 分类过滤.
 * 选 domain (e.g. devops) → 用该 domain 子分类 slug+name + DOMAIN_KEYWORD_BOOST 关键词
 * 在 skill name/description/tags/author 文本里搜 (任一命中即视为该类).
 * 数据来源: bundled catalog (marketplace-catalog.ts) — marketplace is 100%
 * client-side per architecture principle, no server endpoints involved.
 */
function matchCategory(
  skills: MarketSkill[],
  category: string,
  categories: CategoryEntry[] | undefined,
): MarketSkill[] {
  if (!category) return skills;
  // 合并: 真 categories 子分类名 + 手工补充关键词
  const keywords = new Set<string>();
  const entry = categories?.find((c) => c.domain === category);
  if (entry) {
    entry.child_slugs.forEach((s) => s && keywords.add(s.toLowerCase()));
    entry.child_names.forEach((n) => n && keywords.add(n.toLowerCase()));
  }
  (DOMAIN_KEYWORD_BOOST[category] ?? []).forEach((k) =>
    keywords.add(k.toLowerCase()),
  );
  if (!keywords.size) return skills;
  return skills.filter((s) => {
    const text =
      `${s.name} ${s.description} ${(s.tags ?? []).join(" ")} ${s.author}`.toLowerCase();
    for (const kw of keywords) {
      if (text.includes(kw)) return true;
    }
    return false;
  });
}

/** 顶层 domain 列表 (按技能市场最常逛的排序) */
const DOMAIN_ORDER = [
  "development",
  "devops",
  "data-ai",
  "design",
  "databases",
  "testing-security",
  "documentation",
  "content-media",
  "business",
  "tools",
];



/** client-side 关键词兜底 (真 categories 的 child_names 太空, 加些展开词) */
const DOMAIN_KEYWORD_BOOST: Record<string, string[]> = {
  databases: [
    "postgres",
    "postgresql",
    "sql",
    "mysql",
    "mongodb",
    "nosql",
    "redis",
    "sqlite",
    "database",
    "sql-database",
    "nosql-database",
  ],
  devops: [
    "docker",
    "kubernetes",
    "k8s",
    "terraform",
    "ansible",
    "helm",
    "ci",
    "cd",
    "cicd",
    "cloud",
    "aws",
    "gcp",
    "azure",
    "linux",
    "bash",
    "shell",
    "nginx",
    "monitor",
    "container",
  ],
  "data-ai": [
    "machine-learning",
    "ml",
    "ai",
    "llm",
    "gpt",
    "rag",
    "agent",
    "data",
    "analytics",
    "pandas",
    "numpy",
    "embedding",
    "vector",
    "data-analysis",
    "data-engineering",
    "learning",
    "neural",
    "model",
  ],
  development: [
    "frontend",
    "backend",
    "mobile",
    "web",
    "full-stack",
    "developer",
    "programming",
    "code",
    "coding",
    "lib",
    "sdk",
    "api",
    "framework",
    "package",
    "scripting",
  ],
  "testing-security": [
    "test",
    "testing",
    "security",
    "audit",
    "jest",
    "pytest",
    "pentest",
    "vuln",
    "ssl",
    "encrypt",
    "auth",
    "oauth",
    "jwt",
  ],
  documentation: [
    "doc",
    "docs",
    "readme",
    "guide",
    "tutorial",
    "wiki",
    "markdown",
    "documentation",
    "knowledge",
    "education",
  ],
  "content-media": [
    "blog",
    "article",
    "video",
    "audio",
    "image",
    "media",
    "content",
    "creation",
    "seo",
    "social",
    "youtube",
  ],
  business: [
    "business",
    "sales",
    "marketing",
    "finance",
    "hr",
    "ecommerce",
    "payment",
    "project-management",
    "legal",
    "contract",
  ],
  design: [
    "design",
    "ui",
    "ux",
    "figma",
    "css",
    "tailwind",
    "style",
    "theme",
    "color",
    "font",
    "icon",
    "svg",
    "frontend-design",
  ],
  tools: [
    "tool",
    "cli",
    "git",
    "automation",
    "ide",
    "productivity",
    "utility",
    "helper",
    "script",
    "workflow",
    "bot",
  ],
};

function domainLabel(slug: string, cats?: CategoryEntry[]): string {
  const e = cats?.find((c) => c.domain === slug);
  if (!e) return slug;
  // 中文 label 映射
  const MAP: Record<string, string> = {
    development: "开发",
    devops: "运维",
    "data-ai": "数据与AI",
    design: "设计",
    databases: "数据库",
    "testing-security": "测试安全",
    documentation: "文档",
    "content-media": "内容媒体",
    business: "商业",
    tools: "工具",
  };
  return MAP[slug] ?? e.domain_name;
}

type ViewMode = "trending" | "category" | "search";

export function MarketplaceTab() {
  // viewMode: trending (全网热门) / category (按 domain 选) / search (自由搜)
  const [viewMode, setViewMode] = useState<ViewMode>("trending");
  const [trendingWindow, setTrendingWindow] = useState<
    "all" | "week" | "month"
  >("all");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const user = useAuthStore((s) => s.user);
  const userId = user?.id ?? "demo";
  const queryClient = useQueryClient();

  // 拉真实 categories (24h 后端缓存)
  const { data: categoriesData } = useQuery({
    queryKey: ["marketplace-categories"],
    queryFn: () => getMarketCategories(),
    staleTime: 24 * 60 * 60 * 1000, // 24h
    refetchOnWindowFocus: false,
  });

  // 拉用户已装的 marketplace skill (用作 installed 标记, 让 card 显示"已安装")
  const { data: installedData } = useQuery({
    queryKey: ["marketplace-installed"],
    queryFn: () => getMarketInstalled(),
    staleTime: 30 * 1000, // 30s, install 后及时刷新
  });

  const installedSlugs = useMemo(() => {
    const s = new Set<string>();
    installedData?.slugs?.forEach((slug) => s.add(slug));
    return s;
  }, [installedData]);

  // 拉 trending (热门)
  const {
    data: trendingData,
    isPending: trendingPending,
    refetch: refetchTrending,
  } = useQuery({
    queryKey: ["trending", trendingWindow],
    queryFn: () => getMarketTrending({ window: trendingWindow, limit: 30 }),
    enabled: viewMode === "trending",
    staleTime: 6 * 60 * 60 * 1000, // 6h (跟后端 cache 一致)
  });

  // 拉 search/category 结果
  const {
    data: rawData,
    isPending: searchPending,
    refetch: refetchSearch,
  } = useQuery({
    queryKey: ["marketplace", search, category, page],
    queryFn: () => {
      // 直接用用户输入作为 q — 空 q 在 service 里走 "返回该 category 全部 skills" 分支,
      // 不再 fallback 到 docker/k8s 等子关键词 (那是 skillsmp 不支持 category 时的 workaround).
      const opts: SearchOptions = {
        q: search || "skill",
        page,
        limit: 20,
        sortBy: "stars",
      };
      if (category) opts.category = category;
      return searchMarketSkills(opts);
    },
    enabled: viewMode === "category" || viewMode === "search",
  });

  // 决定当前显示什么数据
  const isPending = viewMode === "trending" ? trendingPending : searchPending;
  const refetch = viewMode === "trending" ? refetchTrending : refetchSearch;
  const currentData: SearchResponse | undefined = useMemo(() => {
    let baseSkills: MarketSkill[] = [];
    if (viewMode === "trending" && trendingData) {
      baseSkills = trendingData.skills;
    } else if (rawData) {
      if (viewMode === "category" && category && categoriesData?.categories) {
        baseSkills = matchCategory(
          rawData.skills,
          category,
          categoriesData.categories,
        );
      } else {
        baseSkills = rawData.skills;
      }
    }
    // 标记 installed 状态 (跟 installed set 对账)
    baseSkills = baseSkills.map((s) => ({
      ...s,
      installed: installedSlugs.has(s.slug),
    }));
    if (viewMode === "trending" && trendingData) {
      return { skills: baseSkills, total: baseSkills.length, page: 1 };
    }
    if (rawData) {
      return { ...rawData, skills: baseSkills, total: baseSkills.length };
    }
    return undefined;
  }, [
    viewMode,
    trendingData,
    rawData,
    category,
    categoriesData,
    installedSlugs,
  ]);

  // Marketplace is 100% client-side — installed skills live in browser IDB
  // only, no Server round-trip on install/uninstall. `serverList` is omitted
  // to signal "local-only" mode to `useLocalResource` (no remote reconcile,
  // no pending-push drain).
  const localSkills = useLocalResource<LocalMarketSkill>({
    table: "skills",
    queryKey: ["skills", "marketplace", "local"],
  });

  const installMutation = useMutation({
    mutationFn: (skill: MarketSkill) => {
      const id = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      return localSkills.save({
        ...skill,
        id,
        installed: true,
      });
    },
    onSuccess: (_data, skill) => {
      // 乐观更新: 立即把 installed 加进 set, 避免 refetch 闪烁
      queryClient.setQueryData<
        { skills: MarketSkill[]; slugs: string[]; total: number } | undefined
      >(["marketplace-installed"], (old) => {
        if (!old) return { skills: [], slugs: [skill.slug], total: 1 };
        if (old.slugs.includes(skill.slug)) return old;
        return {
          ...old,
          slugs: [...old.slugs, skill.slug],
          total: old.total + 1,
        };
      });
      queryClient.invalidateQueries({ queryKey: ["marketplace-installed"] });
      queryClient.invalidateQueries({ queryKey: ["marketplace"] });
      queryClient.invalidateQueries({ queryKey: ["trending"] });
      queryClient.invalidateQueries({ queryKey: ["user-skills", userId] });
    },
  });

  const handleInstall = useCallback(
    (skill: MarketSkill) => {
      installMutation.mutate(skill);
    },
    [installMutation],
  );

  const uninstallMutation = useMutation({
    mutationFn: (skill: MarketSkill) => localSkills.remove(skill.slug),
    onSuccess: (_data, skill) => {
      queryClient.setQueryData<
        { skills: MarketSkill[]; slugs: string[]; total: number } | undefined
      >(["marketplace-installed"], (old) =>
        old
          ? {
              ...old,
              skills: old.skills.filter((item) => item.slug !== skill.slug),
              slugs: old.slugs.filter((slug) => slug !== skill.slug),
              total: Math.max(0, old.total - 1),
            }
          : old,
      );
      queryClient.invalidateQueries({ queryKey: ["marketplace-installed"] });
      queryClient.invalidateQueries({
        queryKey: ["skills", "marketplace", "local"],
      });
    },
  });

  const handleUninstall = useCallback(
    (skill: MarketSkill) => uninstallMutation.mutate(skill),
    [uninstallMutation],
  );

  // 顶层 domain tabs (只显示有数据的)
  const availableDomains = useMemo(() => {
    if (!categoriesData?.categories) return DOMAIN_ORDER;
    const set = new Set(categoriesData.categories.map((c) => c.domain));
    return DOMAIN_ORDER.filter((d) => set.has(d));
  }, [categoriesData]);

  return (
    <div className="space-y-4">
      {/* View Mode 切换: 热门 / 按分类 / 自由搜索 — 滑动指示器 + spring 动画 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative inline-flex rounded-full bg-[var(--color-surface)] p-1">
          {[
            { id: "trending" as const, label: "热门", Icon: Flame },
            { id: "category" as const, label: "按分类", Icon: FolderTree },
            { id: "search" as const, label: "搜索", Icon: Search },
          ].map(({ id, label, Icon }) => {
            const active = viewMode === id;
            return (
              <button
                key={id}
                onClick={() => {
                  if (id === "trending") {
                    setViewMode("trending");
                    setCategory(null);
                    setSearch("");
                  } else if (id === "category") {
                    setViewMode("category");
                    setSearch("");
                  } else {
                    setViewMode("search");
                    setCategory(null);
                  }
                }}
                className={cn(
                  "relative z-10 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  active
                    ? "text-white"
                    : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="viewModePill"
                    className="absolute inset-0 rounded-full bg-[var(--color-accent)] shadow-[var(--shadow-1)]"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
                )}
                <Icon size={12} className="relative z-10" />
                <span className="relative z-10">{label}</span>
              </button>
            );
          })}
        </div>

        <div className="ml-auto">
          <button
            onClick={() => refetch()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-hover)] active:scale-95"
          >
            <RefreshCw size={12} />
            刷新
          </button>
        </div>
      </div>

      {/* Trending 窗口选择 (仅 trending 模式) */}
      <AnimatePresence initial={false} mode="wait">
        {viewMode === "trending" && (
          <motion.div
            key="trending-windows"
            initial={{ opacity: 0, y: -4, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -4, height: 0 }}
            transition={{
              duration: m.duration.base / 1000,
              ease: m.easing.out,
            }}
            className="flex flex-wrap gap-2 overflow-hidden"
          >
            {[
              { id: "all" as const, label: "全部时间", Icon: Trophy },
              { id: "month" as const, label: "本月热门", Icon: CalendarDays },
              { id: "week" as const, label: "本周热门", Icon: Flame },
            ].map(({ id, label, Icon }) => {
              const active = trendingWindow === id;
              return (
                <motion.button
                  key={id}
                  onClick={() => setTrendingWindow(id)}
                  whileTap={{ scale: 0.96 }}
                  transition={{ type: "spring", stiffness: 380, damping: 26 }}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors",
                    active
                      ? "bg-[var(--color-accent)]/15 text-[var(--color-accent)] ring-1 ring-[var(--color-accent)]/40"
                      : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]",
                  )}
                >
                  <Icon size={11} />
                  {label}
                </motion.button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Search 框 (仅 search 模式) */}
      {viewMode === "search" && (
        <div className="relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]"
          />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="搜索技能... (如: python, docker, machine-learning)"
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] py-2 pl-9 pr-3 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
          />
        </div>
      )}

      {/* Category tabs (仅 category 模式) */}
      {viewMode === "category" && (
        <CategoryTabs
          selected={category}
          options={availableDomains.map((d) => ({
            id: d,
            label: domainLabel(d, categoriesData?.categories),
          }))}
          onSelect={(c) => {
            setCategory(c);
            setPage(1);
          }}
        />
      )}

      {/* Results — AnimatePresence 包住, 切换 viewMode / trendingWindow / category 时 fade+slide */}
      <AnimatePresence mode="wait" initial={false}>
        {isPending ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{
              duration: m.duration.fast / 1000,
              ease: m.easing.out,
            }}
            className="grid grid-cols-1 gap-4 @3xl:grid-cols-2"
          >
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} variant="rect" height={180} />
            ))}
          </motion.div>
        ) : !currentData?.skills?.length ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{
              duration: m.duration.fast / 1000,
              ease: m.easing.out,
            }}
          >
            <EmptyState
              icon={<Sparkles size={40} />}
              title="未找到技能"
              description={
                viewMode === "trending"
                  ? "热门列表暂为空, 试试「按分类」或「搜索」"
                  : category
                    ? `当前分类「${domainLabel(category, categoriesData?.categories)}」无匹配, 试试换个搜索词或选「全部」`
                    : "尝试其他关键词"
              }
            />
          </motion.div>
        ) : (
          <motion.div
            key={`${viewMode}-${trendingWindow}-${category ?? ""}-${search}-${page}`}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{
              duration: m.duration.base / 1000,
              ease: m.easing.out,
            }}
          >
            <p className="text-xs text-[var(--color-text-muted)]">
              {viewMode === "trending"
                ? `${trendingWindow === "all" ? "全部时间" : trendingWindow === "month" ? "本月" : "本周"} 热门 — Top ${currentData.total}`
                : viewMode === "category" && category
                  ? `「${domainLabel(category, categoriesData?.categories)}」分类下找到 ${currentData.total} 个技能`
                  : `共 ${currentData.total} 个技能`}
            </p>
            <StaggerList
              className="grid grid-cols-1 gap-4 @3xl:grid-cols-2"
              staggerKey={
                (viewMode +
                  (trendingWindow ?? "") +
                  (category ?? "") +
                  (search ?? "") +
                  "-" +
                  page) as "list" | "page"
              }
            >
              {currentData.skills.map((skill) => (
                <StaggerItem key={`${skill.source}-${skill.slug}`}>
                  <SkillMarketCard
                    skill={skill}
                    onInstall={handleInstall}
                    onUninstall={handleUninstall}
                    isInstalling={
                      installMutation.isPending || uninstallMutation.isPending
                    }
                  />
                </StaggerItem>
              ))}
            </StaggerList>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
