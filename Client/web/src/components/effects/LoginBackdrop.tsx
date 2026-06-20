import * as twgl from "twgl.js";
import { useEffect, useRef, type ReactElement } from "react";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useVisibility } from "@/hooks/useVisibility";
import vertexShader from "./shaders/login-bg.vert?raw";
import fragmentShader from "./shaders/login-bg.frag?raw";

/**
 * WebGL login page backdrop.
 * Replaces the old O(n²) CPU-particle canvas with a single fragment shader.
 *
 * - Single draw call per frame (fullscreen triangle)
 * - Grille + 5 drifting particles + mouse warp in GPU
 * - Respects prefers-reduced-motion (falls back to static gradient)
 * - Pauses rAF when tab is hidden
 * - Uses cached clientX/clientY (no getBoundingClientRect reflow)
 */
export function LoginBackdrop(): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();
  const visible = useVisibility();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // WebGL2 preferred, fallback to WebGL1
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (!gl) return;

    const programInfo = twgl.createProgramInfo(gl, [
      vertexShader,
      fragmentShader,
    ]);
    const arrays = {
      position: { numComponents: 2, data: [-1, -1, 3, -1, -1, 3] },
    };
    const bufferInfo = twgl.createBufferInfoFromArrays(gl, arrays);

    // Cached mouse position (no per-frame getBoundingClientRect)
    const mouse = { x: 0.5, y: 0.5 };
    let rafId = 0;
    let stopped = false;

    const onMouseMove = (e: MouseEvent) => {
      mouse.x = e.clientX / window.innerWidth;
      mouse.y = 1.0 - e.clientY / window.innerHeight; // flip Y for GL
    };
    window.addEventListener("mousemove", onMouseMove, { passive: true });

    const render = (time: number) => {
      if (stopped) return;

      twgl.resizeCanvasToDisplaySize(canvas);
      gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

      gl.useProgram(programInfo.program);
      twgl.setBuffersAndAttributes(gl, programInfo, bufferInfo);
      twgl.setUniforms(programInfo, {
        u_resolution: [gl.canvas.width, gl.canvas.height],
        u_time: time * 0.001,
        u_mouse: [mouse.x, mouse.y],
      });
      twgl.drawBufferInfo(gl, bufferInfo);

      rafId = requestAnimationFrame(render);
    };

    if (!reduced && visible) {
      rafId = requestAnimationFrame(render);
    }

    return () => {
      stopped = true;
      cancelAnimationFrame(rafId);
      window.removeEventListener("mousemove", onMouseMove);
    };
  }, [reduced, visible]);

  // Reduced-motion: show static CSS gradient instead of GPU rendering
  if (reduced) {
    return (
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(ellipse at 50% 35%, rgba(184, 85, 43, 0.08) 0%, #F7F4EE 65%)",
        }}
        aria-hidden="true"
      />
    );
  }

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 -z-10 bg-[#F7F4EE] dark:bg-[#1A1916]"
      aria-hidden="true"
    />
  );
}
