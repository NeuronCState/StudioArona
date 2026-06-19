/**
 * Type declarations for pixi-spine + PixiJS 7 integration.
 *
 * pixi-spine re-exports Spine from @pixi-spine/loader-uni and
 * auto-installs its asset loader when imported. We declare the
 * module here so that `tsc` does not complain about missing types.
 */

// ── pixi-spine ──
declare module "pixi-spine" {
  export { Spine } from "@pixi-spine/loader-uni";
  export * from "@pixi-spine/base";
}

export {};
