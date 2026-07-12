import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "var(--ink)",
        "ink-deep": "var(--ink-deep)",
        paper: "var(--paper)",
        "paper-line": "var(--paper-line)",
        "mark-right": "var(--mark-right)",
        "mark-wrong": "var(--mark-wrong)",
        highlight: "var(--highlight)",
      },
      fontFamily: {
        display: ["var(--font-display)", "serif"],
        body: ["var(--font-body)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      maxWidth: {
        content: "640px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(16,27,82,0.06)",
      },
    },
  },
  plugins: [],
};

export default config;
