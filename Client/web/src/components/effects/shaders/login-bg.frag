#version 300 es
precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
uniform vec2 u_mouse;

in vec2 v_uv;
out vec4 fragColor;

// Grid with sin-based wave distortion
float grid(vec2 uv, float size) {
  vec2 g = abs(fract(uv * size) - 0.5);
  float line = min(g.x, g.y);
  float wave = sin(uv.y * 8.0 + u_time) * 0.05;
  return smoothstep(0.0, 0.02, 0.05 - line + wave);
}

// Single particle glow
float particle(vec2 uv, vec2 c, float r) {
  float d = length(uv - c);
  return smoothstep(r, 0.0, d);
}

void main() {
  // Normalise UV to [0,1] with aspect ratio correction
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float aspect = u_resolution.x / u_resolution.y;

  // Mouse position in normalised space, aspect-corrected
  vec2 mouse = u_mouse;
  mouse.x *= aspect;

  vec2 st = vec2(uv.x * aspect, uv.y);

  // Mouse repulsion warp
  vec2 dir = st - mouse;
  float dist = length(dir);
  st += normalize(dir) * 0.02 * exp(-dist * 8.0);

  // Grid layer
  float g = grid(st, 24.0) * 0.15;

  // Drifting particles (5 pseudo-random orbits)
  float p = 0.0;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    vec2 c = vec2(
      0.5 + sin(u_time * 0.3 + fi * 1.7) * 0.4,
      0.5 + cos(u_time * 0.4 + fi * 2.3) * 0.4
    );
    c.x *= aspect;
    p += particle(st, c, 0.02);
  }

  // Colour: warm-grey base + sienna accent tint
  vec3 col = mix(
    vec3(0.97, 0.95, 0.92),     // warm grey base (matches --color-bg)
    vec3(0.72, 0.33, 0.17),     // sienna accent (matches --color-accent)
    g + p * 0.6
  );

  fragColor = vec4(col, 1.0);
}
