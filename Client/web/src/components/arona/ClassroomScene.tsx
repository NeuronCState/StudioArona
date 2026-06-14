import { Suspense, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';

// ── Configure Draco decoder (called once on first use) ──
let _dracoReady = false;
function ensureDracoDecoder() {
  if (_dracoReady) return;
  _dracoReady = true;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (useGLTF as any).setDecoderPath('/draco/');
}

// ── Dynamic Sun ──
function sunForTime(time: 'day' | 'night') {
  return time === 'day'
    ? { position: [8, 12, 4] as [number, number, number], color: '#fff5e6', intensity: 1.2, ambientColor: '#b8d4f0', ambientIntensity: 0.4, skyColor: '#87CEEB' }
    : { position: [3, 2, -4] as [number, number, number], color: '#8899cc', intensity: 0.15, ambientColor: '#1a1a3e', ambientIntensity: 0.08, skyColor: '#0d0d2b' };
}

function DynamicSun({ time }: { time: 'day' | 'night' }) {
  const target = useMemo(() => sunForTime(time), [time]);
  return (
    <>
      <color attach="background" args={[target.skyColor]} />
      <ambientLight color={target.ambientColor} intensity={target.ambientIntensity} />
      <directionalLight
        position={target.position} color={target.color} intensity={target.intensity}
        castShadow
        shadow-mapSize-width={1024} shadow-mapSize-height={1024}
        shadow-camera-near={0.5} shadow-camera-far={50}
        shadow-camera-left={-15} shadow-camera-right={15}
        shadow-camera-top={15} shadow-camera-bottom={-15}
      />
    </>
  );
}

// ── GLB Scene ──
function GLBScene({ time }: { time: 'day' | 'night' }) {
  ensureDracoDecoder();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const day = (useGLTF as any)('/assets/scenes/classroom-day.glb', true);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const night = (useGLTF as any)('/assets/scenes/classroom-night.glb', true);
  const dayClone = useMemo(() => day.scene.clone(), [day.scene]);
  const nightClone = useMemo(() => night.scene.clone(), [night.scene]);

  return (
    <>
      <primitive object={dayClone} visible={time === 'day'} />
      <primitive object={nightClone} visible={time === 'night'} />
      <DynamicSun time={time} />
    </>
  );
}

// ── Main export ──
export function ClassroomScene({
  time = 'day',
  onTimeChange,
}: {
  time?: 'day' | 'night';
  onTimeChange?: (t: 'day' | 'night') => void;
}) {
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 1 }}>
      <Canvas
        camera={{ position: [0, 1.5, 4], fov: 45 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        frameloop="demand"
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
      >
        <Suspense fallback={null}>
          <GLBScene time={time} />
        </Suspense>
      </Canvas>

      {/* Day/night toggle */}
      <button
        onClick={() => onTimeChange?.(time === 'day' ? 'night' : 'day')}
        aria-label={time === 'day' ? '切换到夜晚' : '切换到白天'}
        style={{
          position: 'absolute', bottom: 20, right: 20, zIndex: 30,
          width: 40, height: 40, borderRadius: 20,
          border: '1px solid rgba(255,255,255,0.15)',
          background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(10px)',
          color: '#fff', fontSize: 18, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {time === 'day' ? '\u{1F319}' : '\u{2600}\u{FE0F}'}
      </button>
    </div>
  );
}
