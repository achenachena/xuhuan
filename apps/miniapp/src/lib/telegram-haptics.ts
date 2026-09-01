export const playTelegramHaptic = async (
  kind: "selection" | "rescue" | "warning",
): Promise<void> => {
  try {
    const { default: webApp } = await import("@twa-dev/sdk");
    if (webApp.platform === "unknown" || !webApp.isVersionAtLeast("6.1")) return;
    if (kind === "selection") webApp.HapticFeedback.selectionChanged();
    else if (kind === "rescue") webApp.HapticFeedback.notificationOccurred("success");
    else webApp.HapticFeedback.impactOccurred("medium");
  } catch {
    // Haptics are optional and must never interrupt input.
  }
};
