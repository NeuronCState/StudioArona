/**
 * Scene configuration presets.
 *
 * Each scene defines day/night lighting parameters, model paths, and
 * ambient settings. Adding a new scene (e.g. "office", "garden") means
 * adding one entry here — no changes to ClassroomScene.tsx needed.
 */

export interface LightingPreset {
  sunPosition: [number, number, number];
  sunColor: string;
  sunIntensity: number;
  ambientColor: string;
  ambientIntensity: number;
  skyColor: string;
}

export interface ScenePreset {
  /** Human-readable label */
  label: string;
  /** Lighting for each time period */
  lighting: {
    day: LightingPreset;
    night: LightingPreset;
  };
  /** GLB model paths (relative to /assets/scenes/) */
  models: {
    day: string;
    night: string;
  };
}

export const CLASSROOM_PRESET: ScenePreset = {
  label: '教室',
  lighting: {
    day: {
      sunPosition: [8, 12, 4],
      sunColor: '#fff5e6',
      sunIntensity: 1.2,
      ambientColor: '#b8d4f0',
      ambientIntensity: 0.4,
      skyColor: '#87CEEB',
    },
    night: {
      sunPosition: [3, 2, -4],
      sunColor: '#8899cc',
      sunIntensity: 0.15,
      ambientColor: '#1a1a3e',
      ambientIntensity: 0.08,
      skyColor: '#0d0d2b',
    },
  },
  models: {
    day: '/assets/scenes/classroom-day.glb',
    night: '/assets/scenes/classroom-night.glb',
  },
};

/** Registry of all available scenes */
export const SCENE_REGISTRY: Record<string, ScenePreset> = {
  classroom: CLASSROOM_PRESET,
};

/** Get lighting preset for a scene + time */
export function getLighting(
  scene: string,
  time: 'day' | 'night',
): LightingPreset {
  return SCENE_REGISTRY[scene]?.lighting[time] ?? CLASSROOM_PRESET.lighting.day;
}

/** Get model path for a scene + time */
export function getModelPath(scene: string, time: 'day' | 'night'): string {
  return SCENE_REGISTRY[scene]?.models[time] ?? CLASSROOM_PRESET.models.day;
}
