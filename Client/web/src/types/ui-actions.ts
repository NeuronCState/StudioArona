// Synced with packages/contracts/ui-actions.schema.json
// Agent 操控前端的事件类型

export type UIAction =
  // ── Existing (M5.1) ──
  | { type: 'navigate'; to: string }
  | { type: 'highlight'; selector: string }
  | { type: 'render_card'; payload: Record<string, unknown> }
  | { type: 'clear_session' }
  | { type: 'toast'; message: string; level: 'info' | 'warn' | 'error' }
  | { type: 'confirm'; message: string; action: string }

  // ── New (M5.2 W3) — Live2D / theme / scene / VM ──
  | { type: 'live2d.play_motion'; motion: string; group?: string }
  | { type: 'live2d.set_expression'; expression: string }
  | { type: 'live2d.set_emotion'; emotion: string }
  | { type: 'live2d.lipsync_audio'; audioUrl: string }
  | { type: 'theme.switch'; mode: 'arona' | 'studio' }
  | { type: 'scene.set_time'; time: 'day' | 'night' }
  | { type: 'scene.set_weather'; weather: string }
  | { type: 'vm.console_followup'; vmId: string; output: string; command?: string }

  // ── Data sync ──
  | { type: 'data.changed'; resource: string };
