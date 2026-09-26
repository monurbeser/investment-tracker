/**
 * Categorical series colors (fixed order, validated for CVD separation on the
 * adjacent pairlist). Colors follow the instrument, not its rank.
 */
export const SERIES_DARK = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"];
export const SERIES_LIGHT = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];
export const MAX_SERIES = SERIES_DARK.length;

export type Theme = "dark" | "light";

export const CHART_THEME = {
  dark: { bg: "#131722", text: "#b2b5be", grid: "rgba(42,46,57,0.6)", border: "#2a2e39", up: "#26a69a", down: "#ef5350", crosshair: "#758696" },
  light: { bg: "#ffffff", text: "#434651", grid: "rgba(224,227,235,0.7)", border: "#e0e3eb", up: "#089981", down: "#f23645", crosshair: "#9598a1" },
};

export function seriesColor(slot: number, theme: Theme): string {
  const p = theme === "dark" ? SERIES_DARK : SERIES_LIGHT;
  return p[slot % p.length];
}
