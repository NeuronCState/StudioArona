import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Sparkles, FileCode2, Bot, Folder } from 'lucide-react';
import { useDelayedPending } from '@/hooks/useDelayedPending';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '@/lib/api/client';
import { Tabs, Badge, Skeleton, EmptyState, CardError } from '@javis/ui-kit';
import { cn } from '@/lib/utils';
import { StaggerList, StaggerItem } from '@/components/motion';
import { motion as m } from '@/lib/motion';
import { useAuthStore } from '@/stores/auth';
import { MarketplaceTab } from './MarketplaceTab';

interface Skill {
  name: string;
  slug: string;
  origin: 'user' | 'hermes';
  path: string;
  preview: string;
  description?: string;
  version?: string;
  platforms?: string[];
  tags?: string[];
}

/**
 * Parse a SKILL.md preview. Many hermes skills use YAML frontmatter
 * (--- name: ... description: ...). The backend may truncate before the
 * closing "---" so we extract fields with regex rather than full YAML.
 */
function parseSkill(s: Skill): Skill {
  const text = s.preview || '';
  if (!text.startsWith('---')) {
    // Markdown style: first line is "# Name", rest is body
    const lines = text.split('\n');
    const first = lines[0]?.replace(/^#\s*/, '').trim();
    const body = lines.slice(1).join('\n').trim();
    if (!s.name || s.name.startsWith('---')) {
      return { ...s, name: first || s.name, description: body || s.preview };
    }
    return s;
  }
  const out: Skill = { ...s };
  const nameM = text.match(/^---\s*\nname:\s*([^\n]+)/m);
  if (nameM) out.name = nameM[1].trim();
  const descM = text.match(/description:\s*"?([^"\n]+?)"?\s*\n/);
  if (descM) out.description = descM[1].trim();
  const verM = text.match(/^version:\s*([\d.]+)/m);
  if (verM) out.version = verM[1].trim();
  const platM = text.match(/^platforms:\s*\[([^\]]+)\]/m);
  if (platM) out.platforms = platM[1].split(',').map((p) => p.trim().replace(/^["']|["']$/g, ''));
  const tagM = text.match(/(?:^|\s)tags:\s*\[([^\]]+)\]/m);
  if (tagM) out.tags = tagM[1].split(',').map((p) => p.trim().replace(/^["']|["']$/g, ''));
  return out;
}

interface SkillsResponse {
  user_id: string;
  total: number;
  user_provided: Skill[];
  hermes_generated: Skill[];
}

const originMeta: Record<string, { icon: typeof Sparkles; label: string; color: string }> = {
  user: { icon: FileCode2, label: '用户编写', color: 'text-blue-500' },
  hermes: { icon: Bot, label: 'Hermes 自动生成', color: 'text-[var(--color-accent)]' },
};

function SkillsSkeleton() {
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <Skeleton width={200} height={24} />
      <div className="flex gap-4">
        {[1, 2].map((i) => (
          <Skeleton key={i} width={100} height={20} />
        ))}
      </div>
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} variant="rect" height={100} />
      ))}
    </div>
  );
}

export function SkillsPage() {
  const [activeTab, setActiveTab] = useState<'all' | 'user' | 'hermes' | 'marketplace'>('all');
  const [search] = useState('');
  const user = useAuthStore((s) => s.user);
  const userId = user?.id ?? 'demo';

  const {
    data,
    isPending,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['user-skills', userId],
    queryFn: () => api.get<SkillsResponse>(`/v1/users/${userId}/skills`),
  });

  const allSkills = useMemo(() => {
    if (!data) return [] as Skill[];
    return [...data.user_provided, ...data.hermes_generated].map(parseSkill);
  }, [data]);

  const filtered = useMemo(() => {
    if (!allSkills.length) return [];
    let pool: Skill[] = activeTab === 'all' ? allSkills : allSkills.filter((s) => s.origin === activeTab);
    if (search) {
      const q = search.toLowerCase();
      pool = pool.filter(
        (s) => s.name.toLowerCase().includes(q) || s.preview.toLowerCase().includes(q),
      );
    }
    return pool;
  }, [allSkills, activeTab, search]);

  const loading = useDelayedPending(isPending);
  if (loading && !data) return <SkillsSkeleton />;

  if (isError) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <CardError message={error?.message} onRetry={() => refetch()} />
      </div>
    );
  }

  const userCount = data?.user_provided.length ?? 0;
  const hermesCount = data?.hermes_generated.length ?? 0;

  return (
    <div className="studio-page mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-stone-400">Skills</p>
          <h2 className="mt-2 text-2xl font-black tracking-[-0.04em] text-[var(--color-text-primary)]">
            技能库
          </h2>
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
            你手写的 SKILL.md 和 Hermes 在使用过程中自动提炼的技能，都会按用户隔离保存。
          </p>
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex flex-wrap gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
        <StatBadge label="总技能" value={data?.total ?? 0} />
        <StatBadge label="用户编写" value={userCount} accent={userCount > 0} />
        <StatBadge label="Hermes 自动生成" value={hermesCount} accent={hermesCount > 0} />
        <div className="ml-auto flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
          <Folder size={12} />
          <code className="text-[10px]">~/.hermes/profiles/{userId}/skills/</code>
        </div>
      </div>

      {/* Tabs */}
      <Tabs
        tabs={[
          { id: 'all', label: `全部 ${data?.total ?? 0}` },
          { id: 'user', label: `用户 ${userCount}` },
          { id: 'hermes', label: `Hermes ${hermesCount}` },
          { id: 'marketplace', label: '市场' },
        ]}
        activeTab={activeTab}
        onTabChange={(t) => setActiveTab(t as typeof activeTab)}
      />

      {/* Content — AnimatePresence 包住, 切换 tab 时 fade+slide 过渡 */}
      <AnimatePresence mode="wait" initial={false}>
        {activeTab === 'marketplace' ? (
          <motion.div
            key="marketplace"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: m.duration.fast / 1000, ease: m.easing.out }}
          >
            <MarketplaceTab />
          </motion.div>
        ) : (
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: m.duration.fast / 1000, ease: m.easing.out }}
          >
            {loading && !data ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} variant="rect" height={140} />
                ))}
              </div>
            ) : !data ? (
              // 数据未到位, 不渲染任何内容
              null
            ) : !filtered.length ? (
              <EmptyState
                icon={<Sparkles size={40} />}
                title="还没有技能"
                description={
                  data?.total === 0
                    ? '在 ~/.hermes/profiles/<你>/skills/<name>/SKILL.md 放一个文件试试。'
                    : '试试切换筛选，或在搜索框里换个关键词。'
                }
              />
            ) : (
              <StaggerList
                className="grid grid-cols-1 gap-4 md:grid-cols-2"
                staggerKey={(activeTab as 'list' | 'page')}
              >
                {filtered.map((s) => (
                  <StaggerItem key={s.slug}>
                    <SkillCard skill={s} />
                  </StaggerItem>
                ))}
              </StaggerList>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StatBadge({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-[var(--color-text-muted)]">{label}</span>
      <span
        className={cn(
          'text-sm font-semibold',
          accent ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-primary)]',
        )}
      >
        {value}
      </span>
    </div>
  );
}

function SkillCard({ skill }: { skill: Skill }) {
  const meta = originMeta[skill.origin] ?? originMeta.user;
  const Icon = meta.icon;
  return (
    <motion.div
      whileHover={{ y: -2, scale: 1.005 }}
      whileTap={{ scale: 0.99 }}
      transition={{ duration: m.duration.base / 1000, ease: m.easing.out }}
      className={cn(
        'group rounded-[24px] border bg-[var(--color-surface-glass)] p-5 shadow-[var(--shadow-1)] backdrop-blur-xl',
        skill.origin === 'hermes'
          ? 'border-[var(--color-accent)]/30'
          : 'border-[var(--color-border)]',
      )}
    >
      <div className="flex items-center gap-2">
        <Icon size={14} className={meta.color} />
        <Badge variant={skill.origin === 'hermes' ? 'accent' : 'default'}>{meta.label}</Badge>
      </div>

      <h3 className="mt-2 text-base font-semibold text-[var(--color-text-primary)]">
        {skill.name}
      </h3>

      <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-[var(--color-text-secondary)]">
        {skill.description || skill.preview}
      </p>

      {(skill.tags?.length || skill.version || skill.platforms?.length) ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {skill.version && (
            <span className="rounded bg-[var(--color-bg)] px-1.5 py-0.5 text-[10px] font-mono text-[var(--color-text-muted)]">
              v{skill.version}
            </span>
          )}
          {skill.platforms?.map((p) => (
            <span key={p} className="rounded bg-[var(--color-bg)] px-1.5 py-0.5 text-[10px] text-[var(--color-text-muted)]">
              {p}
            </span>
          ))}
          {skill.tags?.map((t) => (
            <span key={t} className="rounded bg-[var(--color-accent-soft)] px-1.5 py-0.5 text-[10px] text-[var(--color-accent)]">
              #{t}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-3 flex items-center justify-between gap-2 text-[10px] text-[var(--color-text-muted)]">
        <code className="truncate" title={skill.path}>
          {skill.slug}/SKILL.md
        </code>
        <a
          href={`vscode://file${skill.path ? `/${skill.path}` : ''}`}
          onClick={(e) => e.preventDefault()}
          className="inline-flex items-center gap-1 rounded p-1 opacity-0 transition-opacity hover:bg-[var(--color-bg)] hover:text-[var(--color-text-primary)] group-hover:opacity-100"
          title="在编辑器中打开"
        >
          <ExternalLink size={10} />
        </a>
      </div>
    </motion.div>
  );
}
