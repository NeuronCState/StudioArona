import { useDesignModeStore } from "@/stores/design-mode";

/**
 * Arona interactive wallpaper shell.
 *
 * Loads the Spine WebGL wallpaper (Arona + Plana) from
 * /assets/wallpaper/arona/index.html in a full-screen iframe.
 *
 * Features: mouse tracking, head pat, voice lines, day/night cycle.
 * Switch back to Studio via the ← button or keyboard shortcut.
 */

const WALLPAPER_URL = "/assets/wallpaper/arona/index.html";

export function AronaShell() {
  const setMode = useDesignModeStore((s) => s.setMode);

  return (
    <div style={{ position: "fixed", inset: 0, overflow: "hidden" }}>
      {/* Spine WebGL wallpaper iframe */}
      <iframe
        src={WALLPAPER_URL}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          border: "none",
          pointerEvents: "auto",
        }}
        allow="autoplay"
        title="Arona & Plana"
      />

      {/* Return to Studio button */}
      <button
        onClick={() => setMode("studio")}
        style={{
          position: "absolute",
          top: 16,
          left: 16,
          zIndex: 30,
          padding: "6px 14px",
          borderRadius: 20,
          border: "1px solid rgba(255,255,255,0.15)",
          background: "rgba(0,0,0,0.35)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          color: "#fff",
          fontSize: 12,
          cursor: "pointer",
          transition: "background 200ms",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "rgba(0,0,0,0.55)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "rgba(0,0,0,0.35)";
        }}
      >
        ← Studio
      </button>
    </div>
  );
}

export default AronaShell;
