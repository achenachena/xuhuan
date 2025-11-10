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
      },
      keyframes: {
        "attack-pulse": {
          "0%, 100%": { transform: "scale(1)" },
          "50%": { transform: "scale(1.05) translateX(10px)" }
        },
        "damage-shake": {
          "0%, 100%": { transform: "translateX(0)" },
          "10%, 30%, 50%, 70%, 90%": { transform: "translateX(-5px)" },
          "20%, 40%, 60%, 80%": { transform: "translateX(5px)" }
        },
        "block-bounce": {
          "0%, 100%": { transform: "scale(1)" },
          "50%": { transform: "scale(0.95)" }
        },
        "special-glow": {
          "0%, 100%": { transform: "scale(1)", filter: "brightness(1)" },
          "50%": { transform: "scale(1.1)", filter: "brightness(1.3)" }
        },
        "victory-bounce": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-20px)" }
        },
        "defeat-fade": {
          "0%": { opacity: "1", transform: "translateY(0)" },
          "100%": { opacity: "0.3", transform: "translateY(30px) rotate(15deg)" }
        }
      },
      animation: {
        "attack-pulse": "attack-pulse 0.5s ease-in-out",
        "damage-shake": "damage-shake 0.5s ease-in-out",
        "block-bounce": "block-bounce 0.3s ease-in-out",
        "special-glow": "special-glow 0.6s ease-in-out",
        "victory-bounce": "victory-bounce 1s ease-in-out infinite",
        "defeat-fade": "defeat-fade 1s ease-out forwards"
      }
    }
  },
  plugins: []
};

export default config;

