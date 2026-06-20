import { useCallback, useRef } from "react";
import { preload } from "react-dom";
import { useDesignModeStore } from "@/stores/design-mode";

/**
 * DesignModeToggle — Studio ↔ Arona 模式切换按钮。
 *
 * React 19 preload(): hover 时预加载 Arona 模式的 3D 资产 (GLB + Draco) 和
 * lazy chunk (AronaShell)，减少切换延迟。
 */
export function DesignModeToggle() {
  const mode = useDesignModeStore((s) => s.mode);
  const toggleMode = useDesignModeStore((s) => s.toggleMode);
  const preloaded = useRef(false);

  const preloadArona = useCallback(() => {
    if (preloaded.current) return;
    preloaded.current = true;

    // React 19 preload() — inserts <link rel="preload"> into document head
    preload("/draco/draco_decoder.wasm", { as: "fetch" });
    preload("/assets/scenes/classroom-day.glb", { as: "fetch" });
    preload("/assets/scenes/classroom-night.glb", { as: "fetch" });

    // Trigger Vite dynamic import to start fetching the lazy chunk
    import("@/components/arona/AronaShell").catch(() => {
      // Silently fail — chunk will load when user actually clicks
    });
  }, []);

  return (
    <>
      <button
        onClick={() => mode !== "studio" && toggleMode()}
        className={`rounded-md px-2 py-0.5 text-xs font-medium transition-all duration-200 ${
          mode === "studio"
            ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
            : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
        }`}
      >
        Studio
      </button>
      <button
        onClick={() => mode !== "arona" && toggleMode()}
        onMouseEnter={mode !== "arona" ? preloadArona : undefined}
        className={`rounded-md px-2 py-0.5 text-xs font-medium transition-all duration-200 ${
          mode === "arona"
            ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
            : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
        }`}
      >
        Arona
      </button>
    </>
  );
}
