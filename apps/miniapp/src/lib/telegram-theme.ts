type TelegramThemeParams = {
  readonly bg_color?: string;
  readonly text_color?: string;
};

export const applyTelegramTheme = (theme?: TelegramThemeParams): void => {
  if (typeof document === "undefined") return;
  const style = document.documentElement.style;
  style.setProperty("--tg-theme-bg-color", theme?.bg_color ?? "#0f172a");
  style.setProperty("--tg-theme-text-color", theme?.text_color ?? "#e2e8f0");
};
