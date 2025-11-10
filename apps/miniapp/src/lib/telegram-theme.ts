type TelegramSdkThemeParams = {
  readonly bg_color?: string;
  readonly secondary_bg_color?: string;
  readonly text_color?: string;
  readonly hint_color?: string;
  readonly button_color?: string;
  readonly button_text_color?: string;
};
export type TelegramThemeParams = {
  readonly backgroundColor?: string;
  readonly secondaryBackgroundColor?: string;
  readonly textColor?: string;
  readonly hintColor?: string;
  readonly buttonColor?: string;
  readonly buttonTextColor?: string;
};

export type TelegramThemeState = {
  readonly colorScheme: "light" | "dark";
  readonly themeParams: TelegramThemeParams;
};

const FALLBACK_THEME: Required<TelegramThemeParams> = Object.freeze({
  backgroundColor: "#0f172a",
  secondaryBackgroundColor: "#1e293b",
  textColor: "#e2e8f0",
  hintColor: "#cbd5f5",
  buttonColor: "#1d4ed8",
  buttonTextColor: "#f8fafc"
});

const THEME_VARIABLES: Record<keyof TelegramThemeParams, string> = Object.freeze({
  backgroundColor: "--tg-theme-bg-color",
  secondaryBackgroundColor: "--tg-theme-secondary-bg-color",
  textColor: "--tg-theme-text-color",
  hintColor: "--tg-theme-hint-color",
  buttonColor: "--tg-theme-button-color",
  buttonTextColor: "--tg-theme-button-text-color"
});

export const getFallbackTheme = (): Required<TelegramThemeParams> => {
  return FALLBACK_THEME;
};

const isNormalizedThemeParams = (
  params: TelegramThemeParams | TelegramSdkThemeParams
): params is TelegramThemeParams => {
  return typeof (params as TelegramThemeParams).backgroundColor !== "undefined";
};

export const normalizeThemeParams = (
  params?: TelegramSdkThemeParams | TelegramThemeParams
): TelegramThemeParams => {
  if (!params) {
    return FALLBACK_THEME;
  }
  if (isNormalizedThemeParams(params)) {
    return params;
  }
  return {
    backgroundColor: params.bg_color ?? FALLBACK_THEME.backgroundColor,
    secondaryBackgroundColor:
      params.secondary_bg_color ?? FALLBACK_THEME.secondaryBackgroundColor,
    textColor: params.text_color ?? FALLBACK_THEME.textColor,
    hintColor: params.hint_color ?? FALLBACK_THEME.hintColor,
    buttonColor: params.button_color ?? FALLBACK_THEME.buttonColor,
    buttonTextColor: params.button_text_color ?? FALLBACK_THEME.buttonTextColor
  };
};

export const applyTelegramTheme = (theme?: TelegramSdkThemeParams | TelegramThemeParams) => {
  if (typeof document === "undefined") {
    return;
  }
  const rootElement: HTMLElement = document.documentElement;
  const normalizedTheme = normalizeThemeParams(theme);
  const mergedTheme: Required<TelegramThemeParams> = {
    backgroundColor: normalizedTheme.backgroundColor ?? FALLBACK_THEME.backgroundColor,
    secondaryBackgroundColor:
      normalizedTheme.secondaryBackgroundColor ?? FALLBACK_THEME.secondaryBackgroundColor,
    textColor: normalizedTheme.textColor ?? FALLBACK_THEME.textColor,
    hintColor: normalizedTheme.hintColor ?? FALLBACK_THEME.hintColor,
    buttonColor: normalizedTheme.buttonColor ?? FALLBACK_THEME.buttonColor,
    buttonTextColor: normalizedTheme.buttonTextColor ?? FALLBACK_THEME.buttonTextColor
  };
  (Object.keys(THEME_VARIABLES) as Array<keyof TelegramThemeParams>).forEach((key) => {
    const variableName: string = THEME_VARIABLES[key];
    const value: string = mergedTheme[key];
    rootElement.style.setProperty(variableName, value);
  });
};

