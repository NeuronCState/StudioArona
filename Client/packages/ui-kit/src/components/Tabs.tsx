import { motion } from "framer-motion";

export interface TabsProps {
  tabs: { id: string; label: string }[];
  activeTab: string;
  onTabChange: (id: string) => void;
  /** Optional: when provided, render a sliding indicator using this layoutId. */
  layoutId?: string;
}

export function Tabs({ tabs, activeTab, onTabChange, layoutId = "tabs-active-pill" }: TabsProps) {
  return (
    <div role="tablist" className="flex gap-1 border-b border-[var(--color-border)]">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onTabChange(tab.id)}
            className={`relative px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] ${
              isActive
                ? 'text-[var(--color-accent)]'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            {tab.label}
            {isActive && (
              <motion.span
                layoutId={layoutId}
                className="absolute bottom-0 left-1/2 h-0.5 w-1/2 -translate-x-1/2 rounded-full bg-[var(--color-accent)]"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
