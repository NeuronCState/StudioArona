/**
 * Arona Spine Animation Identifiers
 *
 * Animation names extracted from the Spine skeleton data (arona_spr.skel).
 * Used by AronaModel.tsx to drive expressions, idle, and body animations.
 *
 * ── Track layout ──
 * Track 0: Idle base (e.g. 'Idle_01')
 * Track 1: Expression / eye / mouth overlays (numeric IDs: '00', '12', '25', ...)
 * Track 2: Body / arm overlays (e.g. 'Pat_01_A', 'LookEnd_01_A')
 *
 * ── Expression IDs (track 1) ──
 * '00'  — Default / neutral face
 * '02'  — Plana expression variant A
 * '03'  — Plana expression variant B
 * '12'  — Upbeat / happy
 * '13'  — Mild / listening
 * '18'  — Sleepy / drowsy
 * '25'  — Bright / talkative
 * '29'  — Curious / interested
 * '31'  — Excited
 * '32'  — Surprised
 *
 * ── Body animations (track 2) ──
 * 'Pat_01_A'     — Head pat body reaction
 * 'PatEnd_01_A'  — Head pat end body reaction
 * 'LookEnd_01_A' — Eye tracking end body reaction
 *
 * ── Special animations ──
 * 'Idle_01'           — Default idle loop (track 0)
 */

// Expression animation IDs for track 1
export const SPINE_EXPRESSIONS = {
  DEFAULT: '00',
  HAPPY: '25',
  MILD: '13',
  SLEEPY: '18',
  UPBEAT: '12',
  CURIOUS: '29',
  EXCITED: '31',
  SURPRISED: '32',
} as const;

// Idle animation names for track 0
export const SPINE_IDLE = {
  DEFAULT: 'Idle_01',
  BG: 'Idle_background_00',
} as const;

// Body animation names for track 2
export const SPINE_BODY = {
  PAT: 'Pat_01_A',
  PAT_END: 'PatEnd_01_A',
  LOOK_END: 'LookEnd_01_A',
} as const;
