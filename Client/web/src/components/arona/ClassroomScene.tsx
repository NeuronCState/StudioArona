import { Suspense, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { useGLTF, Float, Environment, useProgress, PerformanceMonitor, Html } from "@react-three/drei";
import { ACESFilmicToneMapping, PCFSoftShadowMap, SRGBColorSpace } from "three";

// ── Configure Draco decoder (called once on first use) ──
let _dracoReady = false;
function ensureDracoDecoder() {
  if (_dracoReady) return;
  _dracoReady = true;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (useGLTF as any).setDecoderPath("/draco/");
}

// ── Lighting rig (drei <Environment> + legacy directional for shadows) ──
// <Environment> replaces ambientLight — HDR-based ambient provides natural
// color bleeding and diffuse lighting. directionalLight kept for sharp sun
// shadows that Environment presets don't generate.
function SceneLighting({ time }: { time: "day" | "night" }) {
  const bg = time === "day" ? "#87CEEB" : "#0d0d2b";
  const envPreset = time === "day" ? "sunset" as const : "night" as const;
  const sun = time === "day"
    ? { position: [8, 12, 4] as const, color: "#fff5e6", intensity: 1.0 }
    : { position: [3, 2, -4] as const, color: "#8899cc", intensity: 0.12 };

  return (
    <>
      <color attach="background" args={[bg]} />
      {/* HDR environment for natural ambient + reflections */}
      <Environment
        preset={envPreset}
        environmentIntensity={time === "day" ? 0.5 : 0.15}
      />
      {/* Directional sun for sharp shadows (Environment doesn't cast shadows) */}
      <directionalLight
        position={sun.position}
        color={sun.color}
        intensity={sun.intensity}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={0.5}
        shadow-camera-far={50}
        shadow-camera-left={-15}
        shadow-camera-right={15}
        shadow-camera-top={15}
        shadow-camera-bottom={-15}
      />
    </>
  );
}

// ── Floating Sun Orb (drei <Float>) ──
function SunOrb({ time }: { time: "day" | "night" }) {
  const color = time === "day" ? "#fff5e6" : "#8899cc";
  const intensity = time === "day" ? 1.4 : 0.3;
  return (
    <Float
      speed={0.5}
      rotationIntensity={0.2}
      floatIntensity={0.3}
      floatingRange={[0, 0.3]}
    >
      <mesh position={[4, 3, -2]}>
        <sphereGeometry args={[0.15, 16, 16]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={intensity}
          transparent
          opacity={0.9}
        />
      </mesh>
    </Float>
  );
}

// ── GLB Scene ──
function GLBScene({ time }: { time: "day" | "night" }) {
  ensureDracoDecoder();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const day = (useGLTF as any)("/assets/scenes/classroom-day.glb", true);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const night = (useGLTF as any)("/assets/scenes/classroom-night.glb", true);
  const dayClone = useMemo(() => day.scene.clone(), [day.scene]);
  const nightClone = useMemo(() => night.scene.clone(), [night.scene]);

  return (
    <>
      {/* Classroom models with subtle Float for breathing effect */}
      <Float speed={0.3} rotationIntensity={0.05} floatIntensity={0.08}>
        <primitive object={dayClone} visible={time === "day"} />
      </Float>
      <Float speed={0.3} rotationIntensity={0.05} floatIntensity={0.08}>
        <primitive object={nightClone} visible={time === "night"} />
      </Float>
      <SceneLighting time={time} />
      <SunOrb time={time} />
    </>
  );
}

// ── Loading progress (drei useProgress) ──
function SceneLoadProgress() {
  const { active, progress, errors } = useProgress();
  if (!active || errors.length > 0) return null;
  const pct = Math.round(progress);
  return (
    <Html center style={{ pointerEvents: "none" }}>
      <div
        style={{
          background: "rgba(0,0,0,0.5)",
          color: "#fff",
          padding: "8px 16px",
          borderRadius: 12,
          fontSize: 13,
          fontFamily: "var(--font-sans)",
          backdropFilter: "blur(8px)",
        }}
      >
        教室加载中… {pct}%
      </div>
    </Html>
  );
}

// ── Main export ──
export function ClassroomScene({
  time = "day",
  onTimeChange,
}: {
  time?: "day" | "night";
  onTimeChange?: (t: "day" | "night") => void;
}) {
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 1 }}>
      <Canvas
        camera={{ position: [0, 1.5, 4], fov: 45 }}
        shadows="soft"
        dpr={[1, 2]}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: "high-performance",
          failIfMajorPerformanceCaveat: false,
          outputColorSpace: SRGBColorSpace,
          toneMapping: ACESFilmicToneMapping,
          toneMappingExposure: 1.2,
          shadowMapType: PCFSoftShadowMap,
        }}
        frameloop="demand"
        onCreated={({ gl }) => {
          gl.shadowMap.enabled = true;
          gl.shadowMap.type = PCFSoftShadowMap;
        }}
        style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      >
        <PerformanceMonitor
          onDecline={() => {
            // Low FPS: drop shadow quality and DPR
          }}
          onIncline={() => {
            // FPS recovered: restore quality
          }}
          flipflops={3}
          bounds={(refreshrate) => [refreshrate * 0.6, refreshrate]}
        >
          <Suspense fallback={null}>
            <GLBScene time={time} />
            <SceneLoadProgress />
          </Suspense>
        </PerformanceMonitor>
      </Canvas>

      {/* Day/night toggle */}
      <button
        onClick={() => onTimeChange?.(time === "day" ? "night" : "day")}
        aria-label={time === "day" ? "切换到夜晚" : "切换到白天"}
        style={{
          position: "absolute",
          bottom: 20,
          right: 20,
          zIndex: 30,
          width: 40,
          height: 40,
          borderRadius: 20,
          border: "1px solid rgba(255,255,255,0.15)",
          background: "rgba(0,0,0,0.3)",
          backdropFilter: "blur(10px)",
          color: "#fff",
          fontSize: 18,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {time === "day" ? "\u{1F319}" : "\u{2600}\u{FE0F}"}
      </button>
    </div>
  );
}
