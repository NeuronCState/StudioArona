import { useActionState, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Bot, Plus, Trash2, ArrowRight, Check } from "lucide-react";
import {
  useSonettoConfigStore,
  SONETTO_PRESETS,
  type SonettoProviderConfig,
} from "@/stores/sonetto-config";
import { useT } from "@/lib/i18n";

export function SetupPage() {
  const tr = useT();
  const {
    providers,
    activeProviderId,
    addProvider,
    removeProvider,
    setActiveProvider,
    markSetupComplete,
  } = useSonettoConfigStore();
  const [editing, setEditing] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const [, formAction, isPending] = useActionState(
    async (_prev: null, formData: FormData) => {
      const base_url = (formData.get("base_url") as string).trim();
      if (!base_url) return null;
      const id = `custom-${Date.now()}`;
      addProvider({
        id,
        provider_type: "openai",
        label: (formData.get("label") as string).trim() || base_url,
        api_key: (formData.get("api_key") as string).trim(),
        base_url,
        models: ((formData.get("models") as string) || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        context_window: 32000,
      });
      formRef.current?.reset();
      setEditing(false);
      return null;
    },
    null,
  );

  const handlePreset = (preset: SonettoProviderConfig) => {
    addProvider(preset);
  };

  const handleSkip = () => markSetupComplete();
  const handleComplete = () => markSetupComplete();

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
        className="w-full max-w-lg"
      >
        <div className="mb-8 text-center">
          <div className="mb-4 flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--color-accent)] shadow-lg">
              <Bot size={32} className="text-white" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">{tr("setup.title")}</h1>
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">{tr("setup.subtitle")}
          </p>
        </div>

        {/* Presets */}
        <div className="mb-6">
          <p className="mb-3 text-xs font-medium text-[var(--color-text-muted)]">
            {tr("setup.quickAdd")}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {SONETTO_PRESETS.map((preset) => (
              <button
                key={preset.config.id}
                onClick={() => handlePreset(preset.config)}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-left text-sm transition-colors hover:border-[var(--color-accent)]/50 hover:bg-[var(--color-accent-soft)]"
              >
                <div className="font-medium">{preset.label}</div>
                <div className="truncate text-xs text-stone-500">
                  {preset.config.base_url}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Added providers */}
        {providers.length > 0 && (
          <div className="mb-6">
            <p className="mb-3 text-xs font-medium text-[var(--color-text-muted)]">
              {tr("setup.addedProviders")}
            </p>
            <div className="space-y-2">
              {providers.map((p) => (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[var(--color-text-primary)]">
                      {p.label}
                    </p>
                    <p className="truncate text-xs text-[var(--color-text-muted)]">
                      {p.base_url} · {p.models.join(", ")}
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveProvider(p.id)}
                    className={`rounded-lg px-2 py-1 text-xs transition-colors ${
                      p.id === activeProviderId
                        ? "bg-[var(--color-accent)] text-white"
                        : "bg-[var(--color-bg)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                    }`}
                  >
                    {p.id === activeProviderId ? tr("setup.current") : tr("setup.use")}
                  </button>
                  <button
                    onClick={() => removeProvider(p.id)}
                    className="rounded-lg p-1 text-[var(--color-text-muted)] transition-colors hover:bg-red-50 hover:text-red-500"
                  >
                    <Trash2 size={14} />
                  </button>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* Custom add — React 19 useActionState */}
        {editing ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="mb-6 rounded-xl border border-[var(--color-accent)]/30 bg-[var(--color-surface)] p-4"
          >
            <form ref={formRef} action={formAction} className="space-y-3">
              <div>
                <label htmlFor="sp-label" className="mb-1 block text-xs text-[var(--color-text-secondary)]">{tr("setup.label")}</label>
                <input id="sp-label" name="label" placeholder={tr("setup.label")} className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]" />
              </div>
              <div>
                <label htmlFor="sp-url" className="mb-1 block text-xs text-[var(--color-text-secondary)]">{tr("setup.baseUrl")}</label>
                <input id="sp-url" name="base_url" placeholder="https://api.example.com/v1" required className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]" />
              </div>
              <div>
                <label htmlFor="sp-key" className="mb-1 block text-xs text-[var(--color-text-secondary)]">{tr("setup.apiKey")}</label>
                <input id="sp-key" name="api_key" placeholder="sk-..." type="password" className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]" />
              </div>
              <div>
                <label htmlFor="sp-models" className="mb-1 block text-xs text-[var(--color-text-secondary)]">{tr("setup.models")}</label>
                <input id="sp-models" name="models" placeholder="gpt-4o-mini, gpt-4o" className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]" />
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setEditing(false)} className="rounded-lg px-3 py-1.5 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">{tr("setup.cancel")}</button>
                <button type="submit" disabled={isPending} className="rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-xs text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-50">{isPending ? tr("setup.adding") : tr("setup.add")}</button>
              </div>
            </form>
          </motion.div>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="mb-6 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--color-border)] py-3 text-sm text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
          >
            <Plus size={16} />
            {tr("setup.customAdd")}
          </button>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between">
          <button
            onClick={handleSkip}
            className="text-sm text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-secondary)]"
          >
            {tr("setup.skip")}
          </button>
          <button
            onClick={handleComplete}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-accent)] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--color-accent-hover)]"
          >
            <Check size={16} />
            {tr("setup.complete")}
            <ArrowRight size={16} />
          </button>
        </div>
      </motion.div>
    </div>
  );
}
