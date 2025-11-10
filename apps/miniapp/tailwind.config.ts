import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/hooks/**/*.{ts,tsx}",
    "./src/lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        "telegram-bg": "var(--tg-theme-bg-color)",
        "telegram-secondary": "var(--tg-theme-secondary-bg-color)",
        "telegram-text": "var(--tg-theme-text-color)",
        "telegram-hint": "var(--tg-theme-hint-color)",
        "telegram-button": "var(--tg-theme-button-color)",
        "telegram-button-text": "var(--tg-theme-button-text-color)"
      },
      backdropBlur: {
        xs: "6px"
      }
    }
  },
  plugins: []
};

export default config;

