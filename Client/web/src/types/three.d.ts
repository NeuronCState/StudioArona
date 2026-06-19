/**
 * @react-three/fiber v8 ambient type declarations.
 *
 * R3F v8 does not ship complete .d.ts files in its npm package.
 * We declare the subset of the API used by ClassroomScene here.
 */

import type { ReactNode } from "react";
import type { Group as ThreeGroup } from "three";

// ── @react-three/fiber module exports ──

declare module "@react-three/fiber" {
  export interface CanvasProps {
    children?: ReactNode;
    camera?: { position?: [number, number, number]; fov?: number };
    gl?: Record<string, unknown>;
    frameloop?: "always" | "demand" | "never";
    style?: React.CSSProperties;
  }

  export const Canvas: React.FC<CanvasProps>;

  export function useFrame(
    callback: (state: unknown, delta: number) => void,
  ): void;
}

// ── @react-three/drei module exports ──

declare module "@react-three/drei" {
  export function useGLTF(path: string): { scene: ThreeGroup };
  export namespace useGLTF {
    export function preload(path: string): void;
  }
}

// ── Three.js JSX intrinsic elements (normally provided by R3F) ──

declare global {
  namespace JSX {
    interface IntrinsicElements {
      color: { attach?: string; args?: unknown[]; children?: ReactNode };
      ambientLight: { color?: string; intensity?: number };
      directionalLight: {
        position?: [number, number, number];
        color?: string;
        intensity?: number;
        castShadow?: boolean;
        "shadow-mapSize-width"?: number;
        "shadow-mapSize-height"?: number;
        "shadow-camera-near"?: number;
        "shadow-camera-far"?: number;
        "shadow-camera-left"?: number;
        "shadow-camera-right"?: number;
        "shadow-camera-top"?: number;
        "shadow-camera-bottom"?: number;
      };
      mesh: {
        rotation?: [number, number, number];
        position?: [number, number, number];
        receiveShadow?: boolean;
        castShadow?: boolean;
        children?: ReactNode;
      };
      planeGeometry: { args?: [number, number] };
      sphereGeometry: { args?: [number, number, number] };
      meshStandardMaterial: { color?: string };
      meshBasicMaterial: {
        color?: string;
        side?: number;
      };
      primitive: { object: unknown; visible?: boolean };
    }
  }
}

export {};
