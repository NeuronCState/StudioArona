import { useNavigate } from "react-router-dom";
import { useUIStore } from "@/stores/ui";
import type { UIAction } from "@/types/ui-actions";

let navigateFn: ((to: string) => void) | null = null;

// Callback registry for render_card — set by ChatPage to append cards to message stream
type RenderCardHandler = (name: string, props: Record<string, unknown>) => void;
let onRenderCard: RenderCardHandler | null = null;

// ── Event bus for M5.2+ handlers (spine / theme / scene / vm) ──
// Components subscribe via window events so they don't need direct imports.
type UIEventHandler = (action: UIAction) => void;
const eventBusTarget = new EventTarget();

export function onUIAction(type: string, handler: UIEventHandler): () => void {
  const listener = (e: Event) => {
    const action = (e as CustomEvent<UIAction>).detail;
    handler(action);
  };
  eventBusTarget.addEventListener(`ui-action:${type}`, listener);
  return () =>
    eventBusTarget.removeEventListener(`ui-action:${type}`, listener);
}

function emitUIAction(type: string, action: UIAction) {
  eventBusTarget.dispatchEvent(
    new CustomEvent(`ui-action:${type}`, { detail: action }),
  );
}

export function setNavigateFn(fn: (to: string) => void) {
  navigateFn = fn;
}

export function setRenderCardHandler(fn: RenderCardHandler) {
  onRenderCard = fn;
}

export function dispatchUIAction(action: UIAction) {
  switch (action.type) {
    // ── Existing handlers (M5.1) ──

    case "navigate":
      navigateFn?.(action.to);
      break;

    case "highlight":
      try {
        const el = document.querySelector(action.selector);
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
        el?.classList.add("ring-2", "ring-[var(--color-accent)]");
        setTimeout(
          () => el?.classList.remove("ring-2", "ring-[var(--color-accent)]"),
          2000,
        );
      } catch {
        /* selector may be invalid */
      }
      break;

    case "render_card":
      if (onRenderCard) {
        onRenderCard(
          String(action.payload.componentName ?? "UnknownCard"),
          (action.payload.props ?? {}) as Record<string, unknown>,
        );
      }
      break;

    case "clear_session":
      window.dispatchEvent(new CustomEvent("javis:clear-session"));
      break;

    case "toast":
      useUIStore.getState().addToast(action.message, action.level);
      break;

    case "confirm":
      if (window.confirm(action.message)) {
        dispatchUIAction({ type: "navigate", to: action.action });
      }
      break;

    // ── New handlers (M5.2 W3) — emit to event bus for subscribers ──

    case "live2d.play_motion":
      // TODO: M5.3 — AronaModel subscribes and calls model.motion(action.motion, action.group, 3)
      emitUIAction("live2d.play_motion", action);
      break;

    case "live2d.set_expression":
      // TODO: M5.3 — AronaModel subscribes and calls model.expression(action.expression)
      emitUIAction("live2d.set_expression", action);
      break;

    case "live2d.set_emotion":
      // TODO: M5.3 — AronaModel subscribes, maps emotion → expression + motion via lookup table
      emitUIAction("live2d.set_emotion", action);
      break;

    case "live2d.lipsync_audio":
      // TODO: M5.3 — AronaModel subscribes, plays audio + drives lip-sync parameters
      emitUIAction("live2d.lipsync_audio", action);
      break;

    case "theme.switch":
      // TODO: M5.3 — design-mode store switches, triggers Studio ↔ Arona shell swap
      emitUIAction("theme.switch", action);
      break;

    case "scene.set_time":
      // TODO: M5.3 — ClassroomScene subscribes, swaps day/night .glb
      emitUIAction("scene.set_time", action);
      break;

    case "scene.set_weather":
      // TODO: M5.3 — ClassroomScene subscribes, adjusts environment/particles
      emitUIAction("scene.set_weather", action);
      break;

    case "vm.console_followup":
      // TODO: M5.2 W3 → M5.4 — ConsoleViewer subscribes, renders monospace output card in chat
      emitUIAction("vm.console_followup", action);
      break;

    case "data.changed":
      emitUIAction("data.changed", action);
      break;
  }
}

export function useUIActionBridge() {
  const navigate = useNavigate();
  setNavigateFn(navigate);
}
