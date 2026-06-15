import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["selector", '[data-theme="dark"]'],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: "#B8552B",
          hover: "#9B4420",
          soft: "#F2E4D9",
        },
        surface: {
          DEFAULT: "#FFFFFF",
          raised: "#FFFFFF",
          overlay: "rgba(0,0,0,0.4)",
        },
        border: {
          DEFAULT: "#E5E1DA",
          subtle: "#EFEBE5",
        },
        text: {
          primary: "#1A1916",
          secondary: "#6B6560",
          muted: "#9B9590",
        },
      },
      fontFamily: {
        sans: ["Inter", "Noto Sans SC", "system-ui", "sans-serif"],
        serif: ["Lora", "Source Serif", "Noto Serif SC", "ui-serif", "Georgia", "serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
      fontSize: {
        "2xs": ["0.625rem", { lineHeight: "0.875rem" }],
      },
      borderRadius: {
        xl: "1rem",
        "2xl": "1.25rem",
      },
      animation: {
        "fade-in": "fadeIn 0.3s ease-out",
        "slide-up": "slideUp 0.3s ease-out",
        "cursor-blink": "cursorBlink 1s step-end infinite",
        "rotate-in": "rotateIn 1.2s cubic-bezier(0.34, 1.56, 0.64, 1)",
        "rotate-out": "rotateOut 1.2s cubic-bezier(0.34, 1.56, 0.64, 1)",
        "breathe": "breathe 1.4s ease-in-out infinite",
        "shake": "shake 0.35s ease-out",
      },
      keyframes: {
        fadeIn: {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        slideUp: {
          from: { transform: "translateY(8px)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
        cursorBlink: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0" },
        },
        rotateIn: {
          from: { transform: "rotate(90deg) scale(0.8)", opacity: "0" },
          to: { transform: "rotate(0deg) scale(1)", opacity: "1" },
        },
        rotateOut: {
          from: { transform: "rotate(0deg) scale(1)", opacity: "1" },
          to: { transform: "rotate(90deg) scale(0.8)", opacity: "0" },
        },
        breathe: {
          "0%, 100%": { opacity: "0.3", transform: "scale(0.8)" },
          "50%": { opacity: "1", transform: "scale(1.2)" },
        },
        shake: {
          "0%, 100%": { transform: "translateX(0)" },
          "25%": { transform: "translateX(-4px)" },
          "50%": { transform: "translateX(4px)" },
          "75%": { transform: "translateX(-2px)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
