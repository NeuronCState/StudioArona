import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { DURATION, EASING, bezierCSS } from "@/lib/motion/tokens";
import { cn } from "@/lib/utils";

/**
 * Visual demo component that renders all motion tokens
 * in an interactive story.
 */
function MotionTokensDemo() {
  const [activeEasing, setActiveEasing] = useState<string | null>(null);
  const [activeDuration, setActiveDuration] = useState<string | null>(null);
  const [activeUtility, setActiveUtility] = useState<string | null>(null);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "2rem",
        maxWidth: 720,
      }}
    >
      {/* ---- Easing curves ---- */}
      <section>
        <h2
          style={{
            fontSize: "1.2rem",
            marginBottom: "0.75rem",
            color: "var(--color-text-primary)",
          }}
        >
          Easing Curves
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {(Object.keys(EASING) as Array<keyof typeof EASING & string>).map(
            (name) => (
              <div
                key={name}
                style={{ display: "flex", alignItems: "center", gap: 12 }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.75rem",
                    width: 80,
                    color: "var(--color-text-secondary)",
                  }}
                >
                  {name}
                </span>
                <code
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.7rem",
                    color: "var(--color-text-muted)",
                    width: 220,
                  }}
                >
                  {bezierCSS(EASING[name])}
                </code>
                <div style={{ position: "relative", height: 32, flex: 1 }}>
                  <div
                    onClick={() => {
                      setActiveEasing(name);
                      setTimeout(() => setActiveEasing(null), 800);
                    }}
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: "var(--radius-pill)",
                      backgroundColor: "var(--color-accent)",
                      transition:
                        activeEasing === name
                          ? `transform ${DURATION.base}ms ${bezierCSS(EASING[name])}`
                          : "none",
                      transform:
                        activeEasing === name
                          ? "translateX(calc(100% - 24px))"
                          : "none",
                      cursor: "pointer",
                    }}
                  />
                </div>
              </div>
            ),
          )}
        </div>
        <p
          style={{
            fontSize: "0.75rem",
            color: "var(--color-text-muted)",
            marginTop: 8,
          }}
        >
          Click any ball to animate it with the corresponding easing curve.
        </p>
      </section>

      {/* ---- Duration scale ---- */}
      <section>
        <h2
          style={{
            fontSize: "1.2rem",
            marginBottom: "0.75rem",
            color: "var(--color-text-primary)",
          }}
        >
          Duration Scale
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {(Object.keys(DURATION) as Array<keyof typeof DURATION & string>).map(
            (name) => (
              <div
                key={name}
                style={{ display: "flex", alignItems: "center", gap: 12 }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.75rem",
                    width: 80,
                    color: "var(--color-text-secondary)",
                  }}
                >
                  {name}
                </span>
                <code
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.7rem",
                    color: "var(--color-text-muted)",
                    width: 80,
                  }}
                >
                  {DURATION[name]}ms
                </code>
                <div style={{ position: "relative", height: 24, flex: 1 }}>
                  <div
                    onClick={() => {
                      setActiveDuration(name);
                      setTimeout(
                        () => setActiveDuration(null),
                        DURATION[name] + 200,
                      );
                    }}
                    style={{
                      height: "100%",
                      borderRadius: "var(--radius-sm)",
                      backgroundColor: "var(--color-accent-soft)",
                      transition:
                        activeDuration === name
                          ? `width ${DURATION[name]}ms var(--ease-out)`
                          : "none",
                      width: activeDuration === name ? "100%" : "0%",
                      cursor: "pointer",
                    }}
                  />
                </div>
              </div>
            ),
          )}
        </div>
        <p
          style={{
            fontSize: "0.75rem",
            color: "var(--color-text-muted)",
            marginTop: 8,
          }}
        >
          Click any bar to fill it at the corresponding duration.
        </p>
      </section>

      {/* ---- Utility classes ---- */}
      <section>
        <h2
          style={{
            fontSize: "1.2rem",
            marginBottom: "0.75rem",
            color: "var(--color-text-primary)",
          }}
        >
          Utility Classes
        </h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          {[
            { cls: "motion-lift", label: "lift" },
            { cls: "motion-press", label: "press" },
            { cls: "route-stage", label: "route-stage" },
          ].map(({ cls, label }) => (
            <button
              key={cls}
              onClick={() => {
                setActiveUtility(label);
                setTimeout(() => setActiveUtility(null), 800);
              }}
              className={cn(
                "rounded-md border border-[var(--color-border)] px-4 py-2 text-sm",
                "bg-[var(--color-surface)] text-[var(--color-text-primary)]",
                activeUtility === label ? cls : "",
              )}
              style={{
                transition: activeUtility !== label ? "none" : undefined,
                ...(activeUtility === label && cls === "route-stage"
                  ? { animation: "none" }
                  : {}),
              }}
            >
              {label}
              {activeUtility === label && (
                <span
                  className={cn(cls === "route-stage" ? "route-stage" : "")}
                  style={{ marginLeft: 8, display: "inline-block" }}
                >
                  active
                </span>
              )}
            </button>
          ))}
        </div>
        <p
          style={{
            fontSize: "0.75rem",
            color: "var(--color-text-muted)",
            marginTop: 8,
          }}
        >
          Click any button to see its micro-interaction effect.
        </p>
      </section>
    </div>
  );
}

const meta: Meta<typeof MotionTokensDemo> = {
  title: "Design Tokens/Motion",
  component: MotionTokensDemo,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component: `
## Motion System Tokens

Studio Arona motion system provides a consistent animation language across the app.

### Easing Curves
| Name | CSS | Use Case |
|------|-----|----------|
| out | cubic-bezier(0.16, 1, 0.3, 1) | Default exit/entrance. Slight overshoot feel. |
| outSoft | cubic-bezier(0.22, 1, 0.36, 1) | Gentle hover transitions. |
| inOut | cubic-bezier(0.65, 0, 0.35, 1) | Symmetric transitions (modals, accordions). |
| in | cubic-bezier(0.7, 0, 1, 0.5) | Objects leaving screen. |
| elastic | cubic-bezier(0.34, 1.56, 0.64, 1) | Joyful micro-interactions, scale-ins. |

### Duration Scale
| Token | Value | Use Case |
|-------|-------|----------|
| instant | 0ms | Screen reader only, no visual change. |
| fast | 120ms | Hover, focus, press feedback. |
| base | 240ms | Card expand/collapse, sidebar, list reorder. |
| slow | 400ms | Route transitions, modal open/close. |
| extra | 600ms | Theme switch, large-scale layout shifts. |

### Utility Classes
| Class | Effect |
|-------|--------|
| motion-lift | Card-like hover: translateY(-2px) + shadow |
| motion-press | Active state: scale(0.98) |
| route-stage | Page mount animation: fade + slideUp |
| motion-stagger | Parent: children stagger in with slide-up |

### Reduced Motion
All animations respect \`prefers-reduced-motion: reduce\`. Duration variables are set to 0ms, and a global \`* { animation-duration: 0s !important }\` catch-all ensures no animation slips through.
        `,
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof MotionTokensDemo>;

export const Default: Story = {};
