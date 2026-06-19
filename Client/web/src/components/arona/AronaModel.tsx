import { useEffect, useRef, useState } from "react";
import { onUIAction } from "@/lib/ui-actions";
import type { UIAction } from "@/types/ui-actions";

/**
 * Arona Spine model rendered via PixiJS 7 + pixi-spine.
 *
 * Loads the BA Arona character `.skel` binary and renders it with
 * the official pixi-spine runtime (replacing the abandoned pixi-live2d-display).
 *
 * Asset paths: /assets/wallpaper/arona/assets/arona_spr.{skel,atlas,png}
 */

// Spine character model path (.skel binary — atlas auto-discovered by pixi-spine)
const CHARACTER_PATH = "/assets/wallpaper/arona/assets/arona_spr.skel";

// Track indices (matching the original Wallpaper Engine convention)
const TRACK_IDLE = 0; // Base idle animation
const TRACK_EXPRESSION = 1; // Expression / eye / mouth (blendable)
const TRACK_BODY = 2; // Body / arm overlays

// Default expression animation (neutral face)
const DEFAULT_EXPRESSION = "00";

// ── Emotion -> Spine expression animation lookup ──
// Expression IDs are numeric strings matching the Spine skeleton's animation names.
// These were extracted from the existing wallpaper's voice data arrays.
const EMOTION_MAP: Record<string, { expression: string; body?: string }> = {
  happy: { expression: "25" },
  sad: { expression: "13" },
  surprised: { expression: "32" },
  angry: { expression: "12" },
  sleepy: { expression: "18" },
  curious: { expression: "29" },
  neutral: { expression: DEFAULT_EXPRESSION },
};

function throttle<T extends (...args: never[]) => void>(fn: T, ms: number): T {
  let last = 0;
  return ((...args: never[]) => {
    const now = Date.now();
    if (now - last >= ms) {
      last = now;
      fn(...args);
    }
  }) as unknown as T;
}

export function AronaModel({
  active = true,
  onLoad,
  onError,
}: {
  active?: boolean;
  onLoad?: () => void;
  onError?: (err: Error) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const spineRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const appRef = useRef<any>(null);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Initialize ──
  useEffect(() => {
    if (!active) return;

    let cancelled = false;

    async function init() {
      try {
        // 1. Import pixi.js + pixi-spine (pixi-spine auto-installs its loader)
        const PIXI = await import("pixi.js");
        await import("pixi-spine");

        if (cancelled) return;

        // 2. Create PixiJS Application
        const app = new PIXI.Application({
          width: window.innerWidth,
          height: window.innerHeight,
          backgroundAlpha: 0,
          antialias: true,
          resolution: window.devicePixelRatio || 1,
          autoDensity: true,
        });
        appRef.current = app;

        if (containerRef.current && !cancelled) {
          containerRef.current.appendChild(app.view as HTMLCanvasElement);
        }

        // 3. Load Spine skeleton (.skel + .atlas auto-discovered by pixi-spine loader)
        const { Spine } = await import("pixi-spine");
        const spineResource = await PIXI.Assets.load(CHARACTER_PATH);

        if (cancelled) return;

        // 4. Create Spine instance
        const spine = new Spine(spineResource.spineData);
        spineRef.current = spine;

        // 5. Set default idle animation
        spine.state.setAnimation(TRACK_IDLE, "Idle_01", true);
        spine.state.setAnimation(TRACK_EXPRESSION, DEFAULT_EXPRESSION, true);
        spine.state.data.defaultMix = 0.3;

        // 6. Add to stage and position (centered, slightly right)
        app.stage.addChild(spine);

        const modelHeight = spine.spineData?.height ?? 800;
        const scale = (app.screen.height * 0.7) / modelHeight;
        spine.scale.set(scale);
        spine.x = app.screen.width * 0.55;
        spine.y = app.screen.height * 0.5;

        if (!cancelled) {
          setModelLoaded(true);
          onLoad?.();
          console.warn("[AronaModel] Spine model loaded successfully");
        }
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : String(e);
          setError(msg);
          onError?.(e instanceof Error ? e : new Error(msg));
          console.error("[AronaModel] Initialization failed:", e);
        }
      }
    }

    init().catch(console.error);

    return () => {
      cancelled = true;
      if (spineRef.current) {
        try {
          spineRef.current.destroy();
        } catch {
          /* already disposed */
        }
        spineRef.current = null;
      }
      if (appRef.current) {
        try {
          appRef.current.destroy(true);
        } catch {
          /* already destroyed */
        }
        appRef.current = null;
      }
    };
  }, [active]);

  // ── Mouse tracking (throttled 33ms ~ 30fps) ──
  useEffect(() => {
    if (!active || !modelLoaded) return;

    const onMouseMove = throttle((e: MouseEvent) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const spine = spineRef.current as any;
      if (!spine?.skeleton) return;

      // Find the Touch_Eye bone for eye tracking (same as Wallpaper Engine)
      const eyeBone = spine.skeleton.findBone("Touch_Eye");
      if (!eyeBone) return;

      const x = (e.clientX / window.innerWidth) * 2 - 1;
      const y = (e.clientY / window.innerHeight) * 2 - 1;

      // Apply eye tracking offset (inverted, matching Wallpaper Engine behavior)
      eyeBone.x += -x * 10;
      eyeBone.y += -y * 10;
    }, 33);

    window.addEventListener("mousemove", onMouseMove);
    return () => window.removeEventListener("mousemove", onMouseMove);
  }, [active, modelLoaded]);

  // ── Handle window resize ──
  useEffect(() => {
    if (!active || !appRef.current) return;

    const handleResize = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const app = appRef.current as any;
      if (app?.renderer) {
        app.renderer.resize(window.innerWidth, window.innerHeight);
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [active]);

  // ── UI Action subscriptions ──
  useEffect(() => {
    if (!active || !modelLoaded || !spineRef.current) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const spine = spineRef.current as any;

    const unsubs: (() => void)[] = [];

    // set_expression: directly set a Spine expression animation by name
    unsubs.push(
      onUIAction("live2d.set_expression", (action: UIAction) => {
        if (action.type === "live2d.set_expression") {
          spine.state.setAnimation(TRACK_EXPRESSION, action.expression, true);
        }
      }),
    );

    // play_motion: play a named animation on the body track, then return to idle
    unsubs.push(
      onUIAction("live2d.play_motion", (action: UIAction) => {
        if (action.type === "live2d.play_motion") {
          const entry = spine.state.setAnimation(
            TRACK_BODY,
            action.motion,
            false,
          );
          entry.mixDuration = 0.3;
          spine.state.addAnimation(TRACK_IDLE, "Idle_01", true, 0);
        }
      }),
    );

    // set_emotion: map emotion keyword to Spine expression animation
    unsubs.push(
      onUIAction("live2d.set_emotion", (action: UIAction) => {
        if (action.type === "live2d.set_emotion") {
          const m = EMOTION_MAP[action.emotion] ?? EMOTION_MAP.neutral;
          const faceEntry = spine.state.setAnimation(
            TRACK_EXPRESSION,
            m.expression,
            true,
          );
          faceEntry.mixDuration = 0.2;
          if (m.body) {
            const bodyEntry = spine.state.setAnimation(
              TRACK_BODY,
              m.body,
              false,
            );
            bodyEntry.mixDuration = 0.3;
          }
        }
      }),
    );

    return () => unsubs.forEach((u) => u());
  }, [active, modelLoaded]);

  if (error) {
    return (
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 10,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "rgba(0,0,0,0.3)",
          color: "#888",
          fontSize: "14px",
        }}
      >
        Arona model unavailable ({error})
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 10,
        pointerEvents: "none",
      }}
    />
  );
}
