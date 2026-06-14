import { useDesignModeStore } from '@/stores/design-mode';

export function DesignModeToggle() {
  const mode = useDesignModeStore((s) => s.mode);
  const toggleMode = useDesignModeStore((s) => s.toggleMode);

  return (
    <>
      <button
        onClick={() => mode !== 'studio' && toggleMode()}
        className={`rounded-md px-2 py-0.5 text-xs font-medium transition-all duration-200 ${
          mode === 'studio'
            ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
            : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
        }`}
      >
        Studio
      </button>
      <button
        onClick={() => mode !== 'arona' && toggleMode()}
        className={`rounded-md px-2 py-0.5 text-xs font-medium transition-all duration-200 ${
          mode === 'arona'
            ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
            : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
        }`}
      >
        Arona
      </button>
    </>
  );
}
