#version 300 es
// Full-screen triangle vertex shader — no vertex data needed
const vec2 positions[3] = vec2[3](
  vec2(-1.0, -1.0),
  vec2( 3.0, -1.0),
  vec2(-1.0,  3.0)
);

out vec2 v_uv;

void main() {
  vec2 pos = positions[gl_VertexID];
  gl_Position = vec4(pos, 0.0, 1.0);
  // Remap [-1,3] to [0,2] — fragment shader divides by 2
  v_uv = (pos + 1.0) * 0.5;
}
