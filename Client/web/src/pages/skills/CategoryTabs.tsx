import { Code, Database, Palette, Server, Shield, FileText, Image, Briefcase, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';

const STATIC_CATEGORIES = [
  { id: 'development', label: '开发', icon: Code },
  { id: 'data-ai', label: '数据与AI', icon: Database },
  { id: 'design', label: '设计', icon: Palette },
  { id: 'devops', label: '运维', icon: Server },
  { id: 'testing-security', label: '测试安全', icon: Shield },
  { id: 'documentation', label: '文档', icon: FileText },
  { id: 'content-media', label: '内容媒体', icon: Image },
  { id: 'business', label: '商业', icon: Briefcase },
  { id: 'tools', label: '工具', icon: Wrench },
];

interface CategoryOption {
  id: string;  // 真实 SkillsMP domain slug (e.g. 'devops', 'data-ai')
  label: string;
}

interface CategoryTabsProps {
  selected: string | null;
  onSelect: (category: string | null) => void;
  /** 可选 — 动态 options (从 /categories 端点拿的 slugs); 没传则用静态 9 个 domain */
  options?: CategoryOption[];
}

export function CategoryTabs({ selected, onSelect, options }: CategoryTabsProps) {
  // 优先用动态 options (来自 SkillsMP MCP list_categories)
  // 没传或为空时, 用静态 9 个 (UI 退化但仍可点)
  const categories: Array<{ id: string; label: string; icon: typeof Code | null }> =
    options && options.length
      ? options.map((o) => {
          const stat = STATIC_CATEGORIES.find((s) => s.id === o.id);
          return { id: o.id, label: o.label, icon: stat?.icon ?? null };
        })
      : STATIC_CATEGORIES;

  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => onSelect(null)}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
          selected === null
            ? 'bg-[var(--color-accent)] text-white'
            : 'bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]'
        )}
      >
        全部
      </button>
      {categories.map((cat) => {
        const Icon = cat.icon;
        const isActive = selected === cat.id;
        return (
          <button
            key={cat.id}
            onClick={() => onSelect(cat.id)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
              isActive
                ? 'bg-[var(--color-accent)] text-white'
                : 'bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]'
            )}
          >
            {Icon && <Icon size={12} />}
            {cat.label}
          </button>
        );
      })}
    </div>
  );
}
