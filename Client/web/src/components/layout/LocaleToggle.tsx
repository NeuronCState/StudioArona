import { useLocaleStore } from '@/stores/locale';

export function LocaleToggle() {
  const locale = useLocaleStore((s) => s.locale);
  const setLocale = useLocaleStore((s) => s.setLocale);

  return (
    <>
      <button
        onClick={() => setLocale('zh')}
        className={`rounded-md px-2 py-0.5 text-xs font-medium transition-all duration-200 ${
          locale === 'zh'
            ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
            : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
        }`}
      >
        中文
      </button>
      <button
        onClick={() => setLocale('en')}
        className={`rounded-md px-2 py-0.5 text-xs font-medium transition-all duration-200 ${
          locale === 'en'
            ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
            : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
        }`}
      >
        EN
      </button>
    </>
  );
}
