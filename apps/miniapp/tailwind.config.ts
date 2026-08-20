import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/features/**/*.{ts,tsx}",
    "./src/hooks/**/*.{ts,tsx}",
    "./src/lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        "telegram-bg": "var(--tg-theme-bg-color)",
        "telegram-text": "var(--tg-theme-text-color)"
      }
    }
  },
  plugins: []
};

export default config;
